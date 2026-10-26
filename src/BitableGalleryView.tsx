import React from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel, formatTag } from './cardModel';

interface AttachmentLike {
  name: string;
  size?: string;
  url?: string;
}

interface BitableGalleryViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  /** 视图配置：封面字段（未设置时自动探测附件列，再退化为 CAD 占位） */
  coverFieldId?: string | null;
  /** 点击封面「预览附件」：由页面接到 AttachmentViewerModal */
  onOpenAttachment?: (row: T) => void;
  /** 视图配置：卡片大小 + 卡片配置（标题字段、显示字段） */
  viewConfig?: BitableViewConfig;
}

/** 从任意字段值里抽出附件数组（附件列通常是 [{ name, size, url }]） */
function extractFiles(raw: unknown): AttachmentLike[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((v) => v && typeof v === 'object' && typeof (v as AttachmentLike).name === 'string')
      .map((v) => v as AttachmentLike);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [{ name: raw.split('/').pop() || raw }];
  }
  return [];
}

/** 去掉扩展名，让封面上的文件名短一些 */
const baseName = (n: string) => n.replace(/\.[a-z0-9]{1,5}$/i, '');
const extName = (n: string) => (n.match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'PDF').toUpperCase();
const isPdf = (n: string) => /\.pdf$/i.test(n);

export const BitableGalleryView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  coverFieldId,
  onOpenAttachment,
  viewConfig
}: BitableGalleryViewProps<T>) => {
  // 卡片大小：影响每行列数与封面高度（对齐飞书画册的「卡片大小」）
  const cardSize = viewConfig?.galleryCardSize || 'medium';
  const gridCls =
    cardSize === 'small'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
      : cardSize === 'large'
      ? 'grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  const coverH = cardSize === 'small' ? 'h-24' : cardSize === 'large' ? 'h-52' : 'h-36';
  // 显式配置的封面字段
  const coverCol = React.useMemo(
    () => (coverFieldId ? columns.find((c) => c.id === coverFieldId) : undefined),
    [columns, coverFieldId]
  );

  /**
   * 封面解析优先级：
   * 1. 视图配置里指定的封面字段（图片铺满 / 附件走 PDF 预览）
   * 2. 自动探测附件列（值为 [{name,size}] 的列）——画册要看的是 PDF 附件本身，不是 CAD 占位
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
      const looksImage =
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(first.name) || first.name.startsWith('/');
      if (looksImage) return { kind: 'image' as const, src: first.name, files, label: col.label };
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

  return (
    <div className="w-full h-full overflow-y-auto p-4 bg-slate-100/60 select-none">
      <div className={`grid ${gridCls} gap-4`}>
        {items.map((item) => {
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

          // 状态词义 → 胶囊色调：异常类红、完成类绿、其余中性
          const isDiff = /阻塞|异常|失败|驳回|延期|差异/.test(statusText);
          const isApproved = /核准|归档|有效|通过|审定|完成|关闭/.test(statusText);

          return (
            <div
              key={item.id}
              onClick={() => onSelectRow?.(item)}
              className={`bg-white rounded-xl border overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer flex flex-col group ${
                isSelected
                  ? 'border-[#005BAC] ring-2 ring-blue-100'
                  : 'border-slate-200/90 hover:border-slate-300'
              }`}
            >
              {/* ===== 封面区 ===== */}
              <div className={`${coverH} relative overflow-hidden border-b border-slate-200/80`}>
                {cover?.kind === 'image' ? (
                  <div className="absolute inset-0 bg-slate-900">
                    <img
                      src={cover.src}
                      alt={code}
                      className="absolute inset-0 w-full h-full object-cover z-[5]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : cover?.kind === 'file' ? (
                  /* ===== PDF 附件预览：画册看的就是附件本身 ===== */
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col items-center justify-center px-3">
                    <div
                      className="absolute inset-0 opacity-[0.06]"
                      style={{
                        backgroundImage:
                          'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)',
                        backgroundSize: '18px 18px'
                      }}
                    />
                    <span
                      className={`material-symbols-outlined text-[40px] leading-none relative z-10 ${
                        isPdf(cover.files[0].name) ? 'text-rose-600' : 'text-sky-600'
                      }`}
                    >
                      {isPdf(cover.files[0].name) ? 'picture_as_pdf' : 'description'}
                    </span>
                    {/* 文件名最多两行，不铺满整张封面 */}
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
                      <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9.5px] font-bold">
                        +{cover.files.length - 1}
                      </span>
                    )}

                    {onOpenAttachment && (
                      <div className="absolute inset-0 z-20 bg-slate-900/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAttachment(item);
                          }}
                          className="h-7 px-3 rounded-full bg-white text-[#005BAC] text-[11.5px] font-semibold shadow-md flex items-center gap-1 cursor-pointer hover:bg-blue-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          预览附件
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ===== 兜底：无封面时的占位（取主字段首字 + 字段提示） ===== */
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage:
                          'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
                        backgroundSize: '16px 16px'
                      }}
                    />
                    <div className="flex flex-col items-center justify-center z-10 transition-transform group-hover:scale-105 duration-200">
                      <span className="text-[26px] font-semibold text-slate-400 leading-none">
                        {(card.title || card.titleLabel || '?').trim().slice(0, 1)}
                      </span>
                      <span className="text-[10px] font-medium tracking-wide text-slate-400 mt-1.5 max-w-[180px] truncate px-2">
                        {card.titleLabel || '暂无封面'}
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
                        className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-medium border border-blue-100 truncate max-w-[110px]"
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
                        <span className="material-symbols-outlined text-[13px] text-slate-400">
                          person
                        </span>
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
    </div>
  );
};
