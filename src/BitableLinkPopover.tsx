import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BitableIcon } from './BitableIcon';
import type { BitableColumnConfig, BitableLinkedTableAccessor } from './types';
import { formatLinkedRecordDisplay, resolveLinkedRecordIds } from './relations';

export interface BitableLinkPopoverProps {
  open: boolean;
  onClose: () => void;
  targetTableId: string;
  targetFieldId?: string;
  multiple?: boolean;
  selectedIds: string[];
  onCommit: (nextIds: string[]) => void;
  getLinkedTableData?: BitableLinkedTableAccessor;
  anchorRect?: DOMRect | null;
}

export function BitableLinkPopover({
  open,
  onClose,
  targetTableId,
  targetFieldId,
  multiple = true,
  selectedIds,
  onCommit,
  getLinkedTableData,
  anchorRect
}: BitableLinkPopoverProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [draftIds, setDraftIds] = useState<string[]>(() => resolveLinkedRecordIds(selectedIds));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraftIds(resolveLinkedRecordIds(selectedIds));
      setSearchQuery('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, selectedIds]);

  // 点击外部自动保存并关闭
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(draftIds);
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open, draftIds, onCommit, onClose]);

  // 按 Esc 关闭并保存
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCommit(draftIds);
        onClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        onCommit(draftIds);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, draftIds, onCommit, onClose]);

  const targetTable = useMemo(
    () => (getLinkedTableData ? getLinkedTableData(targetTableId) : undefined),
    [getLinkedTableData, targetTableId]
  );

  const targetRows = targetTable?.data || [];
  const targetColumns = targetTable?.columns || [];

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return targetRows;
    return targetRows.filter((r) => {
      const displayLabel = formatLinkedRecordDisplay(r, targetColumns, targetFieldId).toLowerCase();
      if (displayLabel.includes(q)) return true;
      return Object.values(r).some((v) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'object') return false;
        return String(v).toLowerCase().includes(q);
      });
    });
  }, [targetRows, targetColumns, targetFieldId, searchQuery]);

  const toggleSelect = (id: string) => {
    if (multiple) {
      setDraftIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      const next = draftIds.includes(id) ? [] : [id];
      setDraftIds(next);
      onCommit(next);
      onClose();
    }
  };

  const handleClear = () => {
    setDraftIds([]);
  };

  const handleConfirm = () => {
    onCommit(draftIds);
    onClose();
  };

  if (!open) return null;

  // 定位计算
  const popoverWidth = 320;
  const popoverHeight = 360;
  const pad = 10;
  let top = (anchorRect?.bottom || 100) + 4;
  let left = anchorRect?.left || 100;

  if (typeof window !== 'undefined') {
    if (left + popoverWidth > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - popoverWidth - pad);
    }
    if (top + popoverHeight > window.innerHeight - pad && anchorRect) {
      top = Math.max(pad, anchorRect.top - popoverHeight - 4);
    }
  }

  const selectedSet = new Set(draftIds);

  return createPortal(
    <div
      ref={containerRef}
      style={{ top, left }}
      className="fixed z-[9999] w-[320px] rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <BitableIcon name="link" className="text-[14px] text-indigo-600 shrink-0" />
          <span className="text-[12.5px] font-semibold text-slate-800 truncate">
            关联 · {targetTable?.label || targetTableId || '目标表'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono px-1 rounded bg-slate-100 shrink-0">
            {multiple ? '多选' : '单选'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onCommit(draftIds);
            onClose();
          }}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-200/50 cursor-pointer"
        >
          <BitableIcon name="close" className="text-[14px]" />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="p-2 border-b border-slate-100">
        <div className="relative flex items-center">
          <BitableIcon
            name="search"
            className="absolute left-2.5 text-[13px] text-slate-400 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索关联记录..."
            className="w-full pl-7.5 pr-2.5 py-1 text-[12px] bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <BitableIcon name="cancel" className="text-[12px]" />
            </button>
          )}
        </div>
      </div>

      {/* 候选记录列表 */}
      <div className="flex-1 overflow-y-auto max-h-[220px] p-1.5 space-y-0.5">
        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-400">
            {targetRows.length === 0 ? '目标表暂无可用记录' : '未找到匹配的记录'}
          </div>
        ) : (
          filteredRows.map((row) => {
            const isChecked = selectedSet.has(row.id);
            const label = formatLinkedRecordDisplay(row, targetColumns, targetFieldId);

            return (
              <div
                key={row.id}
                onClick={() => toggleSelect(row.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors ${
                  isChecked
                    ? 'bg-indigo-50/80 text-indigo-900 font-medium'
                    : 'hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <BitableIcon
                  name={
                    multiple
                      ? isChecked
                        ? 'check_box'
                        : 'check_box_outline_blank'
                      : isChecked
                      ? 'radio_button_checked'
                      : 'check_box_outline_blank'
                  }
                  className={`text-[14px] shrink-0 ${
                    isChecked ? 'text-indigo-600' : 'text-slate-300'
                  }`}
                />
                <span className="truncate flex-1 min-w-0" title={label}>
                  {label}
                </span>
                {row.id && (
                  <span className="text-[10px] text-slate-300 font-mono shrink-0">
                    #{String(row.id).slice(-4)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部确认栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50 text-[11.5px]">
        <div className="text-slate-500">
          已选 <span className="font-semibold text-indigo-600">{draftIds.length}</span> 条
        </div>
        <div className="flex items-center gap-1.5">
          {draftIds.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded cursor-pointer transition-colors"
            >
              清空
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className="px-2.5 py-1 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium cursor-pointer transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
