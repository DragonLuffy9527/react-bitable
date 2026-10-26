import React from 'react';
import { BitableColumnConfig, BitableFilterRule, FilterOperator } from './types';

interface BitableFilterPopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  filterRules: BitableFilterRule[];
  filterLogic: 'AND' | 'OR';
  onUpdateRules: (rules: BitableFilterRule[]) => void;
  onUpdateLogic: (logic: 'AND' | 'OR') => void;
  onClose: () => void;
}

export const BitableFilterPopover = <T,>({
  columns,
  filterRules,
  filterLogic,
  onUpdateRules,
  onUpdateLogic,
  onClose
}: BitableFilterPopoverProps<T>) => {
  const filterableColumns = columns.filter((c) => c.filterable !== false);

  const handleAddRule = () => {
    const firstCol = filterableColumns[0]?.id || '';
    const newRule: BitableFilterRule = {
      id: `rule_${Date.now()}`,
      fieldId: firstCol,
      operator: 'contains',
      value: ''
    };
    onUpdateRules([...filterRules, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    onUpdateRules(filterRules.filter((r) => r.id !== id));
  };

  const handleChangeRule = (id: string, updates: Partial<BitableFilterRule>) => {
    onUpdateRules(
      filterRules.map((r) => {
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
    <div className="absolute left-0 top-full mt-1.5 w-[440px] max-w-[calc(100vw-32px)] bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 select-none text-slate-800 text-[12px] overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="material-symbols-outlined text-[16px] text-slate-500">filter_alt</span>
          <span>高级筛选条件</span>
          {filterRules.length > 0 && (
            <span className="text-[11px] font-normal text-[#005BAC]">({filterRules.length} 条已生效)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {filterRules.length > 0 && (
            <button
              onClick={handleClearAll}
              type="button"
              className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              清空全部
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 rounded p-0.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      {/* Rules list - no horizontal scrollbar */}
      <div className="py-2 space-y-2">
        {filterRules.length === 0 ? (
          <div className="text-center py-5 text-slate-400 text-[11.5px] bg-slate-50 rounded border border-dashed border-slate-200">
            当前视图未设置任何筛选条件，显示全部数据
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-0.5">
            {filterRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded border border-slate-200">
                {/* Logic connector */}
                {idx === 0 ? (
                  <span className="w-12 text-[11px] text-slate-500 font-medium px-1 text-center shrink-0">
                    符合
                  </span>
                ) : idx === 1 ? (
                  <select
                    value={filterLogic}
                    onChange={(e) => onUpdateLogic(e.target.value as 'AND' | 'OR')}
                    className="w-12 h-6 px-1 text-[11px] bg-white border border-slate-200 rounded font-bold text-[#005BAC] focus:outline-none shrink-0"
                  >
                    <option value="AND">且</option>
                    <option value="OR">或</option>
                  </select>
                ) : (
                  <span className="w-12 text-[11px] text-[#005BAC] font-bold px-1 text-center shrink-0">
                    {filterLogic === 'AND' ? '且' : '或'}
                  </span>
                )}

                {/* Field selector */}
                <select
                  value={rule.fieldId}
                  onChange={(e) => handleChangeRule(rule.id, { fieldId: e.target.value })}
                  className="h-6 px-1.5 text-[11px] bg-white border border-slate-200 rounded text-slate-700 focus:outline-none shrink-0 max-w-[110px]"
                >
                  {filterableColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* Operator selector */}
                <select
                  value={rule.operator}
                  onChange={(e) => handleChangeRule(rule.id, { operator: e.target.value as FilterOperator })}
                  className="h-6 px-1 text-[11px] bg-white border border-slate-200 rounded text-slate-700 focus:outline-none shrink-0"
                >
                  <option value="contains">包含</option>
                  <option value="not_contains">不包含</option>
                  <option value="equals">等于</option>
                  <option value="not_equals">不等于</option>
                  <option value="starts_with">开头是</option>
                  <option value="is_empty">为空</option>
                  <option value="is_not_empty">不为空</option>
                </select>

                {/* Value Input */}
                {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) => handleChangeRule(rule.id, { value: e.target.value })}
                    placeholder="输入关键词..."
                    className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                  />
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveRule(rule.id)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                  title="删除条件"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Add */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={handleAddRule}
          className="h-7 px-2.5 flex items-center gap-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>添加筛选条件</span>
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
