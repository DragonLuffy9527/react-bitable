import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BitableColumnConfig } from './types';
import {
  toValueList,
  firstValue,
  resolveOptionList,
  findOption,
  normalizeUrl,
  displayUrl,
  initialsOf,
  isMultiValueType,
  FALLBACK_OPTION_COLOR
} from './cellValue';

export interface HighlightStyleInfo {
  className?: string;
  style?: React.CSSProperties;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
}

interface EditableCellProps<T> {
  column: BitableColumnConfig<T>;
  row: T;
  value: any;
  highlightStyle?: HighlightStyleInfo | null;
  onUpdate: (newValue: any) => void;
}

const DEFAULT_SELECT_OPTIONS = [
  { label: '选项1', value: '选项1', color: 'bg-blue-50 text-[#005BAC] border-blue-200' },
  { label: '选项2', value: '选项2', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: '选项3', value: '选项3', color: 'bg-slate-100 text-slate-700 border-slate-200' }
];

export interface BitableAttachmentFile {
  name: string;
  size?: string;
  url?: string;
}

/** 字节数 → 演示用可读大小（与 mockData 附件的 '1.2 MB' 口径一致） */
const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const EditableCell = <T,>({
  column,
  row,
  value,
  highlightStyle,
  onUpdate
}: EditableCellProps<T>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value !== undefined && value !== null ? value : '');
  /** 多值字段（多选/人员/群组）的文本输入草稿：「张伟、李强」 */
  const [listText, setListText] = useState(() => toValueList(value).join('、'));
  /** 多选浮层的屏幕坐标（fixed 定位，避免被 td 的 overflow-hidden 裁切） */
  const [multiPos, setMultiPos] = useState<{ left: number; top: number } | null>(null);
  const [multiDraft, setMultiDraft] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  /** 附件编辑浮层：草稿文件列表 + 浮层坐标（fixed 定位）+ 隐藏选文件 input */
  const [filesPos, setFilesPos] = useState<{ left: number; top: number } | null>(null);
  const [filesDraft, setFilesDraft] = useState<BitableAttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value !== undefined && value !== null ? value : '');
    setListText(toValueList(value).join('、'));
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select?.();
      } else if (selectRef.current) {
        selectRef.current.focus();
      }
    }
  }, [isEditing]);

  // If column has custom render and is not in edit mode
  const isLocked = !!column.isLocked || !column.editable;

  /**
   * 附件列：打开编辑浮层（可多选上传 / 逐个移除）。
   * 锁定列与后台固定字段（图纸识别录入）不会走到这里——上方 isLocked 分支直接只读返回。
   */
  const openFilesPanel = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const W = 264;
    const H = 320;
    setFilesDraft(
      (Array.isArray(value) ? (value as BitableAttachmentFile[]) : []).map((f) => ({ ...f }))
    );
    setFilesPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
      top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - H - 8))
    });
    setIsEditing(true);
  };

  if (column.render && !isEditing) {
    let rendered: React.ReactNode;
    try {
      rendered = column.render(row, value, onUpdate);
    } catch {
      // 新建的空白记录里，部分自定义渲染会取不到数组字段（如 row.rawAssets.map），
      // 这里降级成纯文本占位，保证空白行也能正常显示、不炸整张表
      rendered = (
        <span className="truncate block text-[11.5px] text-slate-300">
          {value !== undefined && value !== null && String(value).trim() !== ''
            ? String(value)
            : '—'}
        </span>
      );
    }

    // 只读列：直接展示，不提供任何编辑入口
    if (isLocked) {
      return (
        <div
          className={`truncate ${highlightStyle?.className || ''}`}
          style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        >
          {rendered}
        </div>
      );
    }

    // 可编辑列：保留自定义渲染外观，点击进入行内编辑（与表头铅笔状态保持一致）
    return (
      <div
        onClick={(e) => {
          // 附件列的自定义 render 多为「预览」入口：点击直接进上传/移除浮层
          if (column.type === 'attachment') {
            openFilesPanel(e);
            return;
          }
          setIsEditing(true);
        }}
        className="group flex items-center gap-1 w-full h-full cursor-text rounded hover:bg-slate-100/60 -mx-1 px-1"
        title="点击行内编辑"
      >
        <div
          className={`truncate flex-1 min-w-0 ${highlightStyle?.className || ''}`}
          style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        >
          {rendered}
        </div>
        <span className="material-symbols-outlined text-[12px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          edit
        </span>
      </div>
    );
  }

  // Handle boolean column (both locked and editable)
  if (column.type === 'boolean') {
    const isChecked = !!value && value !== 'false' && value !== '0' && value !== 0;
    if (isLocked) {
      return (
        <div className="flex items-center gap-1.5 py-0.5 select-none" title="已锁定字段（只读）">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${
              isChecked
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-400 bg-slate-50 border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[13px] leading-none">
              {isChecked ? 'check_box' : 'check_box_outline_blank'}
            </span>
            <span>{isChecked ? '是' : '否'}</span>
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 py-0.5 select-none">
        <label className="inline-flex items-center gap-1.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => onUpdate(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
          />
          <span
            className={`text-[11.5px] font-medium transition-colors ${
              isChecked ? 'text-emerald-700 font-semibold' : 'text-slate-500 group-hover:text-slate-800'
            }`}
          >
            {isChecked ? '是' : '否'}
          </span>
        </label>
      </div>
    );
  }

  /**
   * 多值字段的胶囊列表（多选 / 人员 / 群组）。
   * 只读与可编辑两条路径共用同一套外观，避免"锁了之后长相完全不同"。
   * 超过 2 项折叠成 +N（title 里给全量），保证行高稳定、不撑破列宽。
   */
  const renderValueChips = () => {
    const list = toValueList(value);

    if (column.type === 'multiSelect') {
      const opts = resolveOptionList(
        column.options && column.options.length > 0 ? column.options : DEFAULT_SELECT_OPTIONS,
        value
      );
      return (
        <span className="flex items-center gap-1 min-w-0 overflow-hidden">
          {opts.slice(0, 2).map((o) => (
            <span
              key={o.value}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border truncate max-w-[86px] shrink-0 ${
                o.color || FALLBACK_OPTION_COLOR
              }`}
              title={o.label}
            >
              {o.label}
            </span>
          ))}
          {opts.length > 2 && (
            <span className="text-[10px] font-semibold text-slate-400 shrink-0">+{opts.length - 2}</span>
          )}
        </span>
      );
    }

    if (column.type === 'user') {
      return (
        <span className="flex items-center gap-1 min-w-0 overflow-hidden">
          {list.slice(0, 2).map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 h-5 pl-0.5 pr-1.5 rounded-full bg-teal-50 border border-teal-200 text-[10.5px] font-medium text-teal-800 max-w-[92px] shrink-0"
              title={name}
            >
              <span className="w-4 h-4 rounded-full bg-teal-600 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                {initialsOf(name)}
              </span>
              <span className="truncate">{name}</span>
            </span>
          ))}
          {list.length > 2 && (
            <span className="text-[10px] font-semibold text-slate-400 shrink-0" title={list.join('、')}>
              +{list.length - 2}
            </span>
          )}
        </span>
      );
    }

    // group（群组）：用方块图标而不是头像，与人员区分开
    return (
      <span className="flex items-center gap-1 min-w-0 overflow-hidden">
        {list.slice(0, 2).map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded bg-orange-50 border border-orange-200 text-[10.5px] font-medium text-orange-800 max-w-[92px] shrink-0"
            title={name}
          >
            <span className="material-symbols-outlined text-[11px] leading-none shrink-0">groups</span>
            <span className="truncate">{name}</span>
          </span>
        ))}
        {list.length > 2 && (
          <span className="text-[10px] font-semibold text-slate-400 shrink-0" title={list.join('、')}>
            +{list.length - 2}
          </span>
        )}
      </span>
    );
  };

  /** 超链接：始终可点跳转（锁定态也允许打开链接，只是不能改值） */
  const renderLink = () => (
    <a
      href={normalizeUrl(String(value))}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 min-w-0 max-w-full text-[12px] text-[#005BAC] hover:underline"
      title={String(value)}
    >
      <span className="material-symbols-outlined text-[12px] leading-none shrink-0">link</span>
      <span className="truncate">{displayUrl(String(value))}</span>
    </a>
  );

  // Not editable / locked column
  if (isLocked) {
    if (column.type === 'badge' && value) {
      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border truncate max-w-full ${
            highlightStyle
              ? 'bg-white/95 font-bold shadow-2xs'
              : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
          style={
            highlightStyle?.textColor
              ? { color: highlightStyle.textColor, borderColor: highlightStyle.textColor + '40' }
              : undefined
          }
          title={String(value)}
        >
          {String(value)}
        </span>
      );
    }

    if (isMultiValueType(column.type)) {
      const list = toValueList(value);
      if (list.length === 0) {
        return <span className="text-[12px] text-slate-300">-</span>;
      }
      return (
        <div className="w-full min-w-0" title={list.join('、')}>
          {renderValueChips()}
        </div>
      );
    }

    if (column.type === 'url' && value) {
      return <div className="min-w-0 max-w-full">{renderLink()}</div>;
    }

    // 附件类型默认渲染：无自定义 render 时显示附件数量徽章（文件名列表见 title）
    if (column.type === 'attachment') {
      const files = Array.isArray(value)
        ? (value as Array<{ name?: string; size?: string }>)
        : [];
      if (files.length === 0) {
        return <span className="text-[11.5px] text-slate-300">无附件</span>;
      }
      return (
        <span
          className="inline-flex items-center gap-1 max-w-full text-[11px] text-slate-700"
          title={files.map((f) => `${f.name || ''}${f.size ? ` (${f.size})` : ''}`).join('、')}
        >
          <span className="material-symbols-outlined text-[13px] text-[#005BAC] shrink-0">attach_file</span>
          <span className="truncate min-w-0 flex-1">{files[0]?.name || `${files.length} 个附件`}</span>
          {files.length > 1 && (
            <span className="shrink-0 text-[10px] px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 leading-4">
              +{files.length - 1}
            </span>
          )}
        </span>
      );
    }

    return (
      <span
        className={`truncate block text-[12px] ${highlightStyle ? 'font-bold' : 'text-slate-700'}`}
        style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        title={String(value || '')}
      >
        {value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : '-'}
      </span>
    );
  }

  // 9. Attachment Editor（附件列：浮层内多选上传 / 逐个移除；锁定列已在上方只读分支返回）
  if (column.type === 'attachment') {
    const files = Array.isArray(value) ? (value as BitableAttachmentFile[]) : [];

    const closeFilesPanel = (commit: boolean) => {
      if (commit) {
        const sig = (list: BitableAttachmentFile[]) =>
          list.map((f) => `${f.name}|${f.size || ''}|${f.url || ''}`).join('#');
        if (sig(filesDraft) !== sig(files)) onUpdate(filesDraft);
      }
      setIsEditing(false);
      setFilesPos(null);
    };

    const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files || []).map((f) => ({
        name: f.name,
        size: formatFileSize(f.size)
      }));
      if (picked.length > 0) setFilesDraft((prev) => [...prev, ...picked]);
      // 允许重复选择同一个文件（清空 input value），仅追加不覆盖
      e.target.value = '';
    };

    if (isEditing && filesPos) {
      return createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => closeFilesPanel(true)} />
          <div
            style={{ position: 'fixed', left: filesPos.left, top: filesPos.top, zIndex: 9999 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[264px] bg-white border border-slate-200 rounded-lg shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={pickFiles}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-8 rounded border border-dashed border-[#005BAC]/40 bg-[#005BAC]/5 hover:bg-[#005BAC]/10 flex items-center justify-center gap-1 text-[11px] font-medium text-[#005BAC] cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[14px] leading-none">upload</span>
              上传附件（可多选）
            </button>
            <div className="mt-1 max-h-44 overflow-y-auto pr-0.5">
              {filesDraft.length === 0 ? (
                <div className="px-1 py-3 text-center text-[10.5px] text-slate-300">暂无附件</div>
              ) : (
                filesDraft.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="h-7 px-1.5 rounded flex items-center gap-1.5 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[13px] text-[#005BAC] shrink-0 leading-none">
                      attach_file
                    </span>
                    <span
                      className="truncate min-w-0 flex-1 text-[10.5px] text-slate-700"
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    {f.size && (
                      <span className="shrink-0 text-[10px] text-slate-400 font-mono">{f.size}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setFilesDraft((prev) => prev.filter((_, idx) => idx !== i))}
                      className="material-symbols-outlined text-[13px] text-slate-300 hover:text-red-500 shrink-0 cursor-pointer transition-colors"
                      title="移除该附件"
                    >
                      close
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between">
              <span className="pl-1 text-[10px] text-slate-400">共 {filesDraft.length} 个附件</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => closeFilesPanel(false)}
                  className="h-6 px-1.5 rounded text-[10.5px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => closeFilesPanel(true)}
                  className="h-6 px-2 rounded bg-[#005BAC] hover:bg-[#004785] text-white text-[10.5px] font-medium cursor-pointer"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      );
    }

    // 展示态：与锁定态外观同源（首个文件名 + 数量角标），点击进入上传/移除浮层
    return (
      <div
        onClick={openFilesPanel}
        className="group flex items-center gap-1 w-full h-full py-0.5 cursor-pointer"
        title={
          files.length
            ? `${files.map((f) => `${f.name || ''}${f.size ? ` (${f.size})` : ''}`).join('、')}（点击添加或移除附件）`
            : '点击上传附件（可多选）'
        }
      >
        {files.length === 0 ? (
          <span className="text-[11px] italic text-slate-300">无附件 (点击上传)</span>
        ) : (
          <>
            <span className="material-symbols-outlined text-[13px] text-[#005BAC] shrink-0 leading-none">
              attach_file
            </span>
            <span className="truncate min-w-0 flex-1 text-[11px] text-slate-700">
              {files[0]?.name || `${files.length} 个附件`}
            </span>
            {files.length > 1 && (
              <span className="shrink-0 text-[10px] px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 leading-4">
                +{files.length - 1}
              </span>
            )}
          </>
        )}
        <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-[#005BAC] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          upload
        </span>
      </div>
    );
  }

  const handleSave = () => {
    setIsEditing(false);
    if (editValue !== value) {
      onUpdate(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(value);
    }
  };

  // 1. Select Dropdown Editor
  if (column.type === 'select') {
    const opts = column.options && column.options.length > 0 ? column.options : DEFAULT_SELECT_OPTIONS;
    // 原多选列改成单选时值是数组，这里只取第一个，避免原生 select 拿到 "a,b" 匹配不到任何项
    const currentValue = firstValue(value);

    if (isEditing) {
      return (
        <select
          ref={selectRef}
          value={currentValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            onUpdate(e.target.value);
            setIsEditing(false);
          }}
          onBlur={() => setIsEditing(false)}
          className="w-full h-7 px-1.5 text-[11.5px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        >
          <option value="">请选择</option>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    const currentOpt = findOption(opts, currentValue);
    const colorStyle = currentOpt?.color || FALLBACK_OPTION_COLOR;

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer group flex items-center justify-between w-full h-full py-0.5"
        title="点击切换选项"
      >
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-bold border truncate ${
            highlightStyle ? 'bg-white/95 shadow-2xs' : colorStyle
          }`}
          style={
            highlightStyle?.textColor
              ? {
                  color: highlightStyle.textColor,
                  borderColor: highlightStyle.textColor + '50'
                }
              : undefined
          }
        >
          {currentOpt ? currentOpt.label : currentValue || '请选择'}
        </span>
        <span className="material-symbols-outlined text-[13px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
          arrow_drop_down
        </span>
      </div>
    );
  }

  // 2. Date Editor
  if (column.type === 'date') {
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full h-7 px-1 text-[11px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        />
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer flex items-center justify-between w-full group py-0.5"
        title="点击修改日期"
      >
        <span
          className={`font-mono text-[11.5px] truncate ${highlightStyle ? 'font-bold' : 'text-slate-700'}`}
          style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        >
          {value || '-'}
        </span>
        <span className="material-symbols-outlined text-[13px] text-slate-400 opacity-0 group-hover:opacity-100">
          calendar_today
        </span>
      </div>
    );
  }

  // 3. Number Editor
  if (column.type === 'number') {
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="0"
          className="w-full h-7 px-1.5 text-[12px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none font-mono"
        />
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer group flex items-center justify-between w-full h-full py-0.5 rounded hover:bg-slate-100/60 px-1 -mx-1"
        title="点击录入数值"
      >
        <span
          className={`font-mono text-[12px] truncate ${highlightStyle ? 'font-bold' : 'text-slate-800'}`}
          style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        >
          {value !== undefined && value !== null && String(value).trim() !== '' ? (
            String(value)
          ) : (
            <span className="text-slate-300 italic font-sans text-[11px]">空 (录入数值)</span>
          )}
        </span>
        <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          edit
        </span>
      </div>
    );
  }

  // 4. Badge Editor
  if (column.type === 'badge') {
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="输入标签文字"
          className="w-full h-7 px-1.5 text-[11.5px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        />
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer group flex items-center justify-between w-full h-full py-0.5"
        title="点击修改标签"
      >
        {value ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border truncate max-w-full ${
              highlightStyle ? 'bg-white/95 shadow-2xs' : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}
            style={
              highlightStyle?.textColor
                ? { color: highlightStyle.textColor, borderColor: highlightStyle.textColor + '40' }
                : undefined
            }
          >
            {String(value)}
          </span>
        ) : (
          <span className="text-slate-300 italic text-[11px]">未标记 (点击添加)</span>
        )}
        <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          edit
        </span>
      </div>
    );
  }

  // 6. Multi-select Editor（多选：checkbox 浮层，Portal 到 body 避免被 td 的 overflow 裁切）
  if (column.type === 'multiSelect') {
    const opts = column.options && column.options.length > 0 ? column.options : DEFAULT_SELECT_OPTIONS;

    const openPanel = (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const W = 232;
      const H = Math.min(300, opts.length * 30 + 76);
      // 老数据可能存的是 label 而不是 value，统一映射成 value，否则勾选态判断不出来
      setMultiDraft(toValueList(value).map((v) => findOption(opts, v)?.value || v));
      setMultiPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - H - 8))
      });
      setIsEditing(true);
    };

    const closePanel = (commit: boolean) => {
      // 关闭时一律提交（与「点遮罩即失焦保存」的表格交互习惯一致），
      // 但内容没变就不写库，避免每次点开再关都触发一次 setData + localStorage；
      // Esc / 取消 走 commit=false 回滚。
      if (commit) {
        const prev = toValueList(value);
        if (multiDraft.join('|') !== prev.join('|')) onUpdate(multiDraft);
      }
      setIsEditing(false);
      setMultiPos(null);
    };

    const toggleOption = (v: string) => {
      setMultiDraft((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
    };

    return (
      <>
        <div
          onClick={openPanel}
          className="cursor-pointer group flex items-center justify-between gap-1 w-full h-full py-0.5"
          title={toValueList(value).length ? `${toValueList(value).join('、')}（点击修改）` : '点击选择（可多选）'}
        >
          {toValueList(value).length > 0 ? (
            renderValueChips()
          ) : (
            <span className="text-[11px] italic text-slate-300">未选择 (点击添加)</span>
          )}
          <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            expand_more
          </span>
        </div>

        {isEditing &&
          multiPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => closePanel(true)} />
              <div
                data-bitable-multiselect-panel="1"
                style={{ position: 'fixed', left: multiPos.left, top: multiPos.top, zIndex: 9999 }}
                className="w-[232px] bg-white border border-slate-200 rounded-lg shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-1.5 pb-1 text-[10px] font-medium text-slate-400">
                  可多选 · 共 {opts.length} 项
                </div>
                <div className="max-h-56 overflow-y-auto pr-0.5">
                  {opts.map((o) => {
                    const checked = multiDraft.includes(o.value) || multiDraft.includes(o.label);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleOption(o.value)}
                        className="w-full h-7 px-1.5 rounded flex items-center gap-1.5 hover:bg-slate-100 text-left cursor-pointer"
                      >
                        <span
                          className={`material-symbols-outlined text-[15px] leading-none shrink-0 ${
                            checked ? 'text-[#005BAC]' : 'text-slate-300'
                          }`}
                        >
                          {checked ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium border truncate ${
                            o.color || FALLBACK_OPTION_COLOR
                          }`}
                        >
                          {o.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span className="pl-1 text-[10px] text-slate-400">已选 {multiDraft.length} 项</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => closePanel(false)}
                      className="h-6 px-1.5 rounded text-[10.5px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => closePanel(true)}
                      className="h-6 px-2 rounded bg-[#005BAC] hover:bg-[#004785] text-white text-[10.5px] font-medium cursor-pointer"
                    >
                      完成
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
      </>
    );
  }

  // 7. Person / Group Editor（人员 / 群组：逗号分隔的多人录入，写回字符串数组）
  if (column.type === 'user' || column.type === 'group') {
    const isUser = column.type === 'user';

    const commitList = () => {
      setIsEditing(false);
      const next = toValueList(listText);
      const prev = toValueList(value);
      // 内容没变就别写库，避免每次点开再关都触发一次 setData + localStorage
      if (next.join('|') !== prev.join('|')) onUpdate(next);
    };

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="text"
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          onBlur={commitList}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitList();
            if (e.key === 'Escape') {
              setListText(toValueList(value).join('、'));
              setIsEditing(false);
            }
          }}
          placeholder={isUser ? '张伟、李强（多人用顿号分隔）' : '土建一工区、机电安装组'}
          className="w-full h-7 px-1.5 text-[11.5px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        />
      );
    }

    const list = toValueList(value);
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer group flex items-center justify-between gap-1 w-full h-full py-0.5"
        title={list.length ? `${list.join('、')}（点击修改）` : isUser ? '点击添加责任人' : '点击添加群组'}
      >
        {list.length > 0 ? (
          renderValueChips()
        ) : (
          <span className="text-[11px] italic text-slate-300">
            {isUser ? '未指派 (点击添加)' : '未关联 (点击添加)'}
          </span>
        )}
        <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          edit
        </span>
      </div>
    );
  }

  // 8. Hyperlink Editor（超链接：文字区直接跳转，右侧铅笔进编辑）
  if (column.type === 'url') {
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="url"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="https://…"
          className="w-full h-7 px-1.5 text-[11.5px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        />
      );
    }

    if (!value) {
      return (
        <div
          onClick={() => setIsEditing(true)}
          className="cursor-pointer group flex items-center justify-between w-full h-full py-0.5"
          title="点击录入链接"
        >
          <span className="text-[11px] italic text-slate-300">空 (点击录入链接)</span>
          <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
            edit
          </span>
        </div>
      );
    }

    return (
      <div className="group flex items-center justify-between gap-1 w-full h-full py-0.5">
        {renderLink()}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="material-symbols-outlined text-[13px] text-slate-300 hover:text-[#005BAC] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
          title="修改链接"
        >
          edit
        </button>
      </div>
    );
  }

  // 5. Text Editor (Default)
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full h-7 px-1.5 text-[12px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="cursor-pointer group flex items-center justify-between w-full h-full py-0.5 rounded hover:bg-slate-100/60 px-1 -mx-1"
      title="点击直接行内编辑"
    >
      <span
        className={`truncate text-[12px] ${highlightStyle ? 'font-bold' : 'text-slate-800'}`}
        style={highlightStyle?.textColor ? { color: highlightStyle.textColor } : undefined}
        title={String(value || '')}
      >
        {value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : (
          <span className="text-slate-300 italic">空 (点击录入)</span>
        )}
      </span>
      <span className="material-symbols-outlined text-[13px] text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
        edit
      </span>
    </div>
  );
};
