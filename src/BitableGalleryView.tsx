import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel, formatTag } from './cardModel';
import { BitableIcon } from './BitableIcon';

export interface AttachmentLike {
  name: string;
  size?: string;
  url?: string;
}

export interface BitableGalleryViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  /** 视图配置：封面字段（未设置时自动探测附件列，再退化为 CAD 占位） */
  coverFieldId?: string | null;
  /** 点击封面「预览附件」：由页面接到外部 AttachmentViewerModal，若未提供则使用内置全屏 Lightbox 预览 */
  onOpenAttachment?: (row: T) => void;
  /** 视图配置：卡片大小 + 卡片配置（标题字段、显示字段） */
  viewConfig?: BitableViewConfig;
  /** 视图配置更新回调（如卡片尺寸切换等） */
  onUpdateViewConfig?: (updates: Partial<BitableViewConfig>) => void;
}

/** 从任意字段值里抽出附件数组（附件列通常是 [{ name, size, url }]） */
function extractFiles(raw: unknown): AttachmentLike[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((v) => v && typeof v === 'object' && typeof (v as AttachmentLike).name === 'string')
      .map((v) => v as AttachmentLike);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const isUrl = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/');
    return [{ name: raw.split('/').pop() || raw, url: isUrl ? raw : undefined }];
  }
  return [];
}

/** 去掉扩展名，让封面上的文件名短一些 */
const baseName = (n: string) => n.replace(/\.[a-z0-9]{1,5}$/i, '');
const extName = (n: string) => (n.match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'PDF').toUpperCase();
const isPdf = (n: string) => /\.pdf$/i.test(n);
const isImageFile = (n: string) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(n);

export const BitableGalleryView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  coverFieldId,
  onOpenAttachment,
  viewConfig,
  onUpdateViewConfig
}: BitableGalleryViewProps<T>) => {
  // 卡片大小：优先当前受控配置，支持画廊内部快速切换
  const [internalCardSize, setInternalCardSize] = useState<'small' | 'medium' | 'large'>(
    viewConfig?.galleryCardSize || 'medium'
  );
  const cardSize = viewConfig?.galleryCardSize || internalCardSize;

  // 搜索关键字（画册即时搜索筛选）
  const [searchQuery, setSearchQuery] = useState('');

  // 内置全屏 Lightbox 预览状态
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeFileTab, setActiveFileTab] = useState(0);

  const handleCardSizeChange = (size: 'small' | 'medium' | 'large') => {
    setInternalCardSize(size);
    if (onUpdateViewConfig) {
      onUpdateViewConfig({ galleryCardSize: size });
    }
  };

  const gridCls =
    cardSize === 'small'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
      : cardSize === 'large'
      ? 'grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  const coverH = cardSize === 'small' ? 'h-28' : cardSize === 'large' ? 'h-52' : 'h-38';

  // 显式配置的封面字段
  const coverCol = useMemo(
    () => (coverFieldId ? columns.find((c) => c.id === coverFieldId) : undefined),
    [columns, coverFieldId]
  );

  /**
   * 封面解析优先级：
   * 1. 视图配置里指定的封面字段（图片铺满 / 附件走 PDF 预览）
   * 2. 自动探测附件列（值为 [{name,size}] 的列）
   * 3. 都没有才退化成 CAD 蓝图占位
   */
  const resolveCover = (item: T) => {
    const filesOf = (col: BitableColumnConfig<T>) =>
      col.resolveFiles ? extractFiles(col.resolveFiles(item)) : extractFiles((item as Record<string, unknown>)[col.id]);

    const tryColumn = (col: BitableColumnConfig<T> | undefined) => {
      if (!col) return null;
      const files = filesOf(col);
      if (files.length === 0) return null;
      const first = files[0];
      const looksImage = isImageFile(first.name) || (first.url && isImageFile(first.url)) || first.name.startsWith('/');
      if (looksImage) return { kind: 'image' as const, src: first.url || first.name, files, label: col.label };
      return { kind: 'file' as const, files, label: col.label };
    };

    const fromConfig = tryColumn(coverCol);
    if (fromConfig) return fromConfig;

    // 自动探测：优先「附件数组 / 可解析附件」的列
    for (const col of columns) {
      if (!col.visible) continue;
      if (col.resolveFiles) {
        const hit = tryColumn(col);
        if (hit) return hit;
        continue;
      }
      const raw = (item as Record<string, unknown>)[col.id];
      if (
        Array.isArray(raw) &&
        raw.some((v) => v && typeof v === 'object' && 'name' in (v as object))
      ) {
        const hit = tryColumn(col);
        if (hit) return hit;
      }
    }
    return null;
  };

  // 即时搜索过滤
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const card = buildCardModel(columns, item, 6, {
        titleFieldId: viewConfig?.cardTitleFieldId,
        fieldIds: viewConfig?.cardFields
      });

      if (card.title?.toLowerCase().includes(q)) return true;
      if (card.subtitle?.toLowerCase().includes(q)) return true;
      if (card.status?.text?.toLowerCase().includes(q)) return true;
      if (card.person?.text?.toLowerCase().includes(q)) return true;
      if (card.date?.text?.toLowerCase().includes(q)) return true;
      if (card.tags.some((t) => t.text?.toLowerCase().includes(q))) return true;

      // 深度匹配其它字段
      for (const col of columns) {
        if (!col.visible) continue;
        const val = (item as Record<string, unknown>)[col.id];
        if (val !== undefined && val !== null && String(val).toLowerCase().includes(q)) {
          return true;
        }
      }
      return false;
    });
  }, [items, columns, searchQuery, viewConfig?.cardTitleFieldId, viewConfig?.cardFields]);

  // 保证 Lightbox 索引在过滤后不越界
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= filteredItems.length) {
      setLightboxIndex(filteredItems.length > 0 ? filteredItems.length - 1 : null);
    }
  }, [filteredItems.length, lightboxIndex]);

  // 重置单张卡片内附件切换与缩放
  useEffect(() => {
    setZoom(1);
    setActiveFileTab(0);
  }, [lightboxIndex]);

  // 键盘快捷键监听
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < filteredItems.length - 1 ? prev + 1 : prev));
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
      } else if (e.key === '0') {
        setZoom(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredItems.length]);

  const activeItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;
  const activeCard = activeItem
    ? buildCardModel(columns, activeItem, 6, {
        titleFieldId: viewConfig?.cardTitleFieldId,
        fieldIds: viewConfig?.cardFields
      })
    : null;
  const activeCover = activeItem ? resolveCover(activeItem) : null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-100/60 select-none overflow-hidden">
      {/* ===== 顶部画册工具栏 ===== */}
      <div className="shrink-0 px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* 左侧：视图标题与统计 */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-50 text-[#005BAC] flex items-center justify-center font-bold">
            <BitableIcon name="collections" className="text-[17px]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">
              {viewConfig?.name || '画册视图'}
            </span>
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
              {searchQuery.trim()
                ? `已筛选 ${filteredItems.length} / ${items.length} 张`
                : `共 ${items.length} 张卡片`}
            </span>
          </div>
        </div>

        {/* 右侧：即时搜索 + 卡片尺寸切换 */}
        <div className="flex items-center gap-2.5">
          {/* 即时搜索框 */}
          <div className="relative flex items-center">
            <BitableIcon name="search" className="absolute left-2.5 text-slate-400 text-[14px] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索卡片标题、编号、人员..."
              className="w-44 sm:w-56 h-7 pl-7 pr-7 text-[11.5px] bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="清空搜索"
              >
                <BitableIcon name="close" className="text-[13px]" />
              </button>
            )}
          </div>

          {/* 卡片尺寸切换器 */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80">
            {[
              { key: 'small' as const, label: '小', title: '紧凑排布' },
              { key: 'medium' as const, label: '中', title: '标准排布' },
              { key: 'large' as const, label: '大', title: '大幅细节' }
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleCardSizeChange(opt.key)}
                className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                  cardSize === opt.key
                    ? 'bg-white text-[#005BAC] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={opt.title}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 卡片网格区 ===== */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredItems.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3 shadow-xs">
              <BitableIcon name={searchQuery.trim() ? 'search_off' : 'image_not_supported'} className="text-[24px]" />
            </div>
            <div className="text-[13px] font-semibold text-slate-700">
              {searchQuery.trim() ? '未找到符合条件的卡片' : '暂无卡片数据'}
            </div>
            <div className="text-[11.5px] text-slate-400 mt-1 max-w-sm">
              {searchQuery.trim()
                ? `没有包含 “${searchQuery}” 的图纸或记录，请尝试更换关键词。`
                : '当前视图暂无记录，可在表格视图新增或调整过滤规则。'}
            </div>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3.5 h-7 px-3.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] text-[#005BAC] font-medium cursor-pointer shadow-xs transition-colors"
              >
                清空搜索关键词
              </button>
            )}
          </div>
        ) : (
          <div className={`grid ${gridCls} gap-4`}>
            {filteredItems.map((item, index) => {
              const isSelected = selectedRowId === item.id;
              const card = buildCardModel(columns, item, 6, {
                titleFieldId: viewConfig?.cardTitleFieldId,
                fieldIds: viewConfig?.cardFields
              });
              const code = card.title;
              const title = card.subtitle;
              const statusText = card.status?.text || '';
              const author = card.person?.text;
              const date = card.date?.text;
              const coverHint =
                card.tags.find((f) => f.type === 'select')?.text || card.fields[2]?.text || '';
              const cover = resolveCover(item);

              const isDiff = statusText.includes('差异');
              const isApproved =
                statusText.includes('核准') ||
                statusText.includes('归档') ||
                statusText.includes('有效') ||
                statusText.includes('已通过') ||
                statusText.includes('已审定') ||
                statusText.includes('已完成');

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectRow?.(item)}
                  className={`bg-white rounded-xl border overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col group ${
                    isSelected
                      ? 'border-[#005BAC] ring-2 ring-blue-100'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* ===== 封面区 ===== */}
                  <div
                    className={`${coverH} relative overflow-hidden border-b border-slate-200/80 bg-slate-950`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(index);
                    }}
                  >
                    {cover?.kind === 'image' ? (
                      <div className="absolute inset-0 bg-slate-900 overflow-hidden">
                        <img
                          src={cover.src}
                          alt={code}
                          className="absolute inset-0 w-full h-full object-cover z-[5] transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : cover?.kind === 'file' ? (
                      /* ===== PDF / 文档附件预览 ===== */
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col items-center justify-center px-3">
                        <div
                          className="absolute inset-0 opacity-[0.06]"
                          style={{
                            backgroundImage:
                              'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)',
                            backgroundSize: '18px 18px'
                          }}
                        />
                        <BitableIcon
                          name={isPdf(cover.files[0].name) ? 'picture_as_pdf' : 'description'}
                          className={`text-[40px] leading-none relative z-10 drop-shadow-xs transition-transform duration-200 group-hover:scale-110 ${
                            isPdf(cover.files[0].name) ? 'text-rose-600' : 'text-sky-600'
                          }`}
                        />
                        <div
                          className="relative z-10 mt-1.5 text-[10.5px] font-mono font-semibold text-slate-700 text-center leading-snug line-clamp-2 break-all"
                          title={cover.files[0].name}
                        >
                          {baseName(cover.files[0].name)}
                        </div>
                        <div className="relative z-10 mt-1 text-[9px] font-mono uppercase tracking-wider text-slate-400">
                          {extName(cover.files[0].name)}
                          {cover.files[0].size ? ` · ${cover.files[0].size}` : ''}
                          {cover.files.length > 1 ? ` · 共 ${cover.files.length} 个` : ''}
                        </div>

                        {cover.files.length > 1 && (
                          <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9.5px] font-bold shadow-xs">
                            +{cover.files.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      /* ===== 兜底：CAD 蓝图占位 ===== */
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                        <div
                          className="absolute inset-0 opacity-15"
                          style={{
                            backgroundImage:
                              'linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)',
                            backgroundSize: '16px 16px'
                          }}
                        />
                        <div className="flex flex-col items-center justify-center text-sky-400/90 z-10 transition-transform group-hover:scale-105 duration-200">
                          <BitableIcon name="architecture" className="text-[36px] drop-shadow-md" />
                          <span className="text-[10px] font-mono tracking-wider text-sky-200/70 mt-1 uppercase">
                            {coverHint ? `${coverHint} · CAD 视图` : 'CAD 视图'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 状态角标 */}
                    {statusText && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border shadow-xs ${
                            isDiff
                              ? 'bg-rose-500 text-white border-rose-600'
                              : isApproved
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-amber-500 text-white border-amber-600'
                          }`}
                        >
                          {statusText}
                        </span>
                      </div>
                    )}

                    {/* 悬停操作浮层：内置 Lightbox 预览与外部预览 */}
                    <div className="absolute inset-0 z-20 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(index);
                        }}
                        className="h-7 px-3 rounded-full bg-white text-[#005BAC] text-[11.5px] font-semibold shadow-md flex items-center gap-1 cursor-pointer hover:bg-blue-50 transition-transform active:scale-95"
                      >
                        <BitableIcon name="visibility" className="text-[14px]" />
                        预览
                      </button>
                      {onOpenAttachment && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAttachment(item);
                          }}
                          className="h-7 px-2.5 rounded-full bg-slate-800/90 text-white text-[11.5px] font-medium shadow-md flex items-center gap-1 cursor-pointer hover:bg-slate-700 transition-transform active:scale-95"
                          title="在外部附件查看器中打开"
                        >
                          <BitableIcon name="open_in_new" className="text-[13px]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ===== 卡体 ===== */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <div className="text-[11px] font-mono font-bold text-slate-500 truncate" title={code}>
                        {code}
                      </div>
                      {title && (
                        <h4 className="text-[12.5px] font-bold text-slate-900 leading-snug line-clamp-2 mt-0.5 group-hover:text-[#005BAC] transition-colors">
                          {title}
                        </h4>
                      )}
                    </div>

                    {/* Tags：其余字段 */}
                    {card.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-[10.5px]">
                        {card.tags.slice(0, 2).map((f) => (
                          <span
                            key={f.id}
                            title={f.label}
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium border border-blue-100 truncate max-w-[110px]"
                          >
                            {formatTag(f)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    {(author || date) && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 gap-2">
                        {author ? (
                          <div className="flex items-center gap-1 text-slate-600 min-w-0">
                            <BitableIcon name="person" className="text-[13px] text-slate-400" />
                            <span className="truncate">{author}</span>
                          </div>
                        ) : (
                          <span />
                        )}
                        {date && <span className="shrink-0">{date}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 内置全屏 Lightbox 模态框 (Portal 渲染) ===== */}
      {lightboxIndex !== null &&
        activeItem &&
        activeCard &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col text-white select-none animate-in fade-in duration-200"
            onClick={() => setLightboxIndex(null)}
          >
            {/* 顶栏控制条 */}
            <div
              className="shrink-0 h-14 px-6 border-b border-white/10 flex items-center justify-between bg-black/30"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 左侧：卡片编号与标题 */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-mono font-semibold tracking-wider text-slate-200 shrink-0">
                  {lightboxIndex + 1} / {filteredItems.length}
                </span>
                <span className="font-mono text-[13px] font-bold text-sky-400 shrink-0">
                  {activeCard.title}
                </span>
                {activeCard.subtitle && (
                  <span className="text-[13px] font-semibold text-slate-200 truncate max-w-md">
                    {activeCard.subtitle}
                  </span>
                )}
                {activeCard.status?.text && (
                  <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 shrink-0">
                    {activeCard.status.text}
                  </span>
                )}
              </div>

              {/* 右侧：缩放控制、定位记录与关闭 */}
              <div className="flex items-center gap-2 shrink-0">
                {activeCover?.kind === 'image' && (
                  <div className="flex items-center gap-1 mr-3 bg-white/10 p-1 rounded-lg border border-white/10">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      className="w-7 h-7 rounded hover:bg-white/20 flex items-center justify-center text-slate-200 cursor-pointer"
                      title="缩小 (-)"
                    >
                      <BitableIcon name="remove" className="text-[16px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      className="px-2 h-7 rounded hover:bg-white/20 text-[11px] font-mono font-semibold text-slate-200 cursor-pointer"
                      title="恢复 100% (0)"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                      className="w-7 h-7 rounded hover:bg-white/20 flex items-center justify-center text-slate-200 cursor-pointer"
                      title="放大 (+)"
                    >
                      <BitableIcon name="add" className="text-[16px]" />
                    </button>
                  </div>
                )}

                {onOpenAttachment && (
                  <button
                    type="button"
                    onClick={() => onOpenAttachment(activeItem)}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[12px] font-medium flex items-center gap-1.5 cursor-pointer border border-white/10 transition-colors"
                  >
                    <BitableIcon name="open_in_new" className="text-[14px]" />
                    <span>查看附件</span>
                  </button>
                )}

                {onSelectRow && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRow(activeItem);
                      setLightboxIndex(null);
                    }}
                    className="h-8 px-3 rounded-lg bg-[#005BAC] hover:bg-[#004785] text-white text-[12px] font-medium flex items-center gap-1.5 cursor-pointer shadow-md transition-colors"
                  >
                    <BitableIcon name="info" className="text-[14px]" />
                    <span>查看详情</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer ml-1 transition-colors"
                  title="关闭 (Esc)"
                >
                  <BitableIcon name="close" className="text-[18px]" />
                </button>
              </div>
            </div>

            {/* 中间主视口 */}
            <div
              className="flex-1 relative flex items-center justify-center overflow-hidden p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) setLightboxIndex(null);
              }}
            >
              {/* 翻页左箭头 */}
              {lightboxIndex > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
                  }}
                  className="absolute left-6 z-30 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer shadow-lg hover:scale-105 transition-all"
                  title="上一张 (←)"
                >
                  <BitableIcon name="chevron_left" className="text-[28px]" />
                </button>
              )}

              {/* 翻页右箭头 */}
              {lightboxIndex < filteredItems.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev !== null && prev < filteredItems.length - 1 ? prev + 1 : prev));
                  }}
                  className="absolute right-6 z-30 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer shadow-lg hover:scale-105 transition-all"
                  title="下一张 (→)"
                >
                  <BitableIcon name="chevron_right" className="text-[28px]" />
                </button>
              )}

              {/* 舞台内容展示 */}
              <div
                className="max-w-[85vw] max-h-[72vh] flex items-center justify-center overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {activeCover?.kind === 'image' ? (
                  <img
                    src={activeCover.src}
                    alt={activeCard.title}
                    style={{
                      transform: `scale(${zoom})`,
                      transition: 'transform 0.15s ease-out'
                    }}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl cursor-zoom-in select-none"
                    onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 1.75))}
                    onError={(e) => {
                      (e.target as HTMLImageElement).alt = '图片加载失败';
                    }}
                  />
                ) : activeCover?.kind === 'file' ? (
                  <div className="w-[480px] max-w-full bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
                    {/* 多附件标签切换 */}
                    {activeCover.files.length > 1 && (
                      <div className="w-full flex items-center justify-center gap-1.5 mb-5 flex-wrap border-b border-white/10 pb-3">
                        {activeCover.files.map((file, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveFileTab(idx)}
                            className={`px-3 py-1 rounded-full text-[11px] font-mono cursor-pointer transition-colors ${
                              activeFileTab === idx
                                ? 'bg-sky-500 text-white font-bold shadow-xs'
                                : 'bg-white/10 text-slate-300 hover:bg-white/20'
                            }`}
                          >
                            附件 {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const curFile = activeCover.files[activeFileTab] || activeCover.files[0];
                      const pdf = isPdf(curFile.name);
                      return (
                        <>
                          <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-4 shadow-inner">
                            <BitableIcon
                              name={pdf ? 'picture_as_pdf' : 'description'}
                              className={`text-[46px] ${pdf ? 'text-rose-400' : 'text-sky-400'}`}
                            />
                          </div>
                          <h3 className="text-[15px] font-bold text-white break-all leading-snug px-4">
                            {curFile.name}
                          </h3>
                          <p className="text-[12px] font-mono text-slate-400 mt-2">
                            格式：{extName(curFile.name)} {curFile.size ? `· 大小：${curFile.size}` : ''}
                          </p>

                          <div className="mt-6 flex items-center gap-3">
                            {curFile.url ? (
                              <a
                                href={curFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="h-8 px-4 rounded-lg bg-[#005BAC] hover:bg-[#004785] text-white text-[12px] font-medium flex items-center gap-1.5 shadow-md transition-colors"
                              >
                                <BitableIcon name="download" className="text-[15px]" />
                                下载 / 打开文件
                              </a>
                            ) : onOpenAttachment ? (
                              <button
                                type="button"
                                onClick={() => onOpenAttachment(activeItem)}
                                className="h-8 px-4 rounded-lg bg-[#005BAC] hover:bg-[#004785] text-white text-[12px] font-medium flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                              >
                                <BitableIcon name="visibility" className="text-[15px]" />
                                在附件查看器中打开
                              </button>
                            ) : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* CAD 蓝图视图全屏占位 */
                  <div className="w-[620px] max-w-full bg-slate-900 border border-sky-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                    <div
                      className="absolute inset-0 opacity-20 pointer-events-none"
                      style={{
                        backgroundImage:
                          'linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)',
                        backgroundSize: '24px 24px'
                      }}
                    />
                    <BitableIcon name="architecture" className="text-[54px] text-sky-400 drop-shadow-md mb-3" />
                    <h3 className="text-[16px] font-bold text-white tracking-wide">
                      {activeCard.title} · CAD 矢量工程图纸
                    </h3>
                    <p className="text-[12px] text-sky-200/80 mt-1 max-w-md">
                      {activeCard.subtitle || '当前记录未绑定外部实体图片或文档，展示默认工程矢量视图'}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2 justify-center">
                      {activeCard.tags.map((t) => (
                        <span
                          key={t.id}
                          className="px-2.5 py-1 rounded bg-sky-950/80 border border-sky-500/30 text-sky-300 text-[11px] font-mono"
                        >
                          {t.label}: {formatTag(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底栏信息条与快捷键指南 */}
            <div
              className="shrink-0 h-14 px-6 border-t border-white/10 flex items-center justify-between bg-black/40 text-[12px] text-slate-400"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 卡片核心元数据 */}
              <div className="flex items-center gap-4 flex-wrap">
                {activeCard.person?.text && (
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <BitableIcon name="person" className="text-[14px] text-slate-400" />
                    <span>{activeCard.person.text}</span>
                  </div>
                )}
                {activeCard.date?.text && (
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <BitableIcon name="calendar_today" className="text-[14px] text-slate-400" />
                    <span>{activeCard.date.text}</span>
                  </div>
                )}
                {activeCard.tags.slice(0, 3).map((f) => (
                  <span
                    key={f.id}
                    className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[11px] border border-white/5"
                  >
                    {f.label}: {formatTag(f)}
                  </span>
                ))}
              </div>

              {/* 快捷键提示 */}
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                <span>← / → 翻页</span>
                <span>·</span>
                <span>+ / - 缩放</span>
                <span>·</span>
                <span>0 复位</span>
                <span>·</span>
                <span>Esc 退出</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
