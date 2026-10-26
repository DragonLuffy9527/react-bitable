import React, { useState, useEffect, useRef } from 'react';
import { BitableColumnConfig } from './types';

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

export const EditableCell = <T,>({
  column,
  row,
  value,
  highlightStyle,
  onUpdate
}: EditableCellProps<T>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value !== undefined && value !== null ? value : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setEditValue(value !== undefined && value !== null ? value : '');
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
        onClick={() => setIsEditing(true)}
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
    const defaultOptions = [
      { label: '选项1', value: '选项1', color: 'bg-blue-50 text-[#005BAC] border-blue-200' },
      { label: '选项2', value: '选项2', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      { label: '选项3', value: '选项3', color: 'bg-slate-100 text-slate-700 border-slate-200' }
    ];
    const opts = column.options && column.options.length > 0 ? column.options : defaultOptions;

    if (isEditing) {
      return (
        <select
          ref={selectRef}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            onUpdate(e.target.value);
            setIsEditing(false);
          }}
          onBlur={() => setIsEditing(false)}
          className="w-full h-7 px-1.5 text-[11.5px] bg-white border border-[#005BAC] rounded shadow-xs focus:outline-none"
        >
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    const currentOpt = opts.find((o) => o.value === value);
    const colorStyle = currentOpt?.color || 'bg-slate-100 text-slate-700 border-slate-200';

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
          {currentOpt ? currentOpt.label : value || '请选择'}
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
