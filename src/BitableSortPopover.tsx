import React from 'react';
import { BitableColumnConfig, BitableSortRule } from './types';
import { BitableIcon } from './BitableIcon';

interface BitableSortPopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  sortRules: BitableSortRule[];
  onUpdateRules: (rules: BitableSortRule[]) => void;
  onClose: () => void;
}

export const BitableSortPopover = <T,>({
  columns,
  sortRules,
  onUpdateRules,
  onClose
}: BitableSortPopoverProps<T>) => {
  const sortableColumns = columns.filter((c) => c.sortable !== false);

  const handleAddRule = () => {
    const usedFieldIds = new Set(sortRules.map((r) => r.fieldId));
    const available = sortableColumns.find((c) => !usedFieldIds.has(c.id)) || sortableColumns[0];
    if (!available) return;

    const newRule: BitableSortRule = {
      id: `sort_${Date.now()}`,
      fieldId: available.id,
      direction: 'asc'
    };
    onUpdateRules([...sortRules, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    onUpdateRules(sortRules.filter((r) => r.id !== id));
  };

  const handleChangeRule = (id: string, updates: Partial<BitableSortRule>) => {
    onUpdateRules(
      sortRules.map((r) => {
        if (r.id === id) {
          return { ...r, ...updates };
        }
        return r;
      })
    );
  };

  const handleClearAll = () => {
    onUpdateRules([]);
  };

  return (
    <div className="absolute left-0 top-full mt-1.5 w-84 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 select-none text-slate-800 text-[12px] overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <BitableIcon name="swap_vert" className="text-[16px] text-slate-500" />
          <span>多级排序规则</span>
          {sortRules.length > 0 && (
            <span className="text-[11px] font-normal text-[#005BAC]">({sortRules.length} 级排序)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sortRules.length > 0 && (
            <button
              onClick={handleClearAll}
              type="button"
              className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              清空
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 rounded p-0.5 cursor-pointer"
          >
            <BitableIcon name="close" className="text-[16px]" />
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 py-1.5">支持多个字段按先后优先级层级排序</div>

      {/* Rules list */}
      <div className="py-1 space-y-2 max-h-[60vh] overflow-y-auto overflow-x-hidden">
        {sortRules.length === 0 ? (
          <div className="text-center py-4 text-slate-400 text-[11.5px] bg-slate-50 rounded border border-dashed border-slate-200">
            未配置排序规则，保持原样顺序
          </div>
        ) : (
          sortRules.map((rule, idx) => (
            <div key={rule.id} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 w-12 text-center shrink-0">
                {idx === 0 ? '主要' : `次要${idx}`}
              </span>

              {/* Field Select */}
              <select
                value={rule.fieldId}
                onChange={(e) => handleChangeRule(rule.id, { fieldId: e.target.value })}
                className="flex-1 min-w-0 h-6 px-1.5 text-[11px] bg-white border border-slate-200 rounded text-slate-700 focus:outline-none"
              >
                {sortableColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* Direction toggle */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => handleChangeRule(rule.id, { direction: 'asc' })}
                  className={`h-6 px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    rule.direction === 'asc' ? 'bg-[#005BAC] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  升序 ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeRule(rule.id, { direction: 'desc' })}
                  className={`h-6 px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    rule.direction === 'desc' ? 'bg-[#005BAC] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  降序 ↓
                </button>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => handleRemoveRule(rule.id)}
                className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
              >
                <BitableIcon name="delete" className="text-[15px]" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add sort */}
      <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={handleAddRule}
          disabled={sortRules.length >= sortableColumns.length}
          className="h-7 px-2.5 flex items-center gap-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] cursor-pointer disabled:opacity-30"
        >
          <BitableIcon name="add" className="text-[14px]" />
          <span>添加排序规则</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="h-7 px-3 bg-[#005BAC] text-white rounded text-[11.5px] font-medium hover:bg-[#004785] cursor-pointer"
        >
          确定
        </button>
      </div>
    </div>
  );
};
