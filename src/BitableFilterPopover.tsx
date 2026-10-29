import React from 'react';
import { BitableColumnConfig, BitableFilterRule, FilterOperator } from './types';
import { ComparableKind, operatorsFor, resolveComparableKind } from './filtering';

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: '包含',
  not_contains: '不包含',
  equals: '等于',
  not_equals: '不等于',
  starts_with: '开头是',
  is_empty: '为空',
  is_not_empty: '不为空',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  between: '介于'
};

const VALUE_PLACEHOLDER: Record<ComparableKind, string> = {
  text: '输入关键词...',
  number: '数值，如 100',
  date: '日期，如 2026-10-08'
};

/** 切换字段后原操作符可能不再适用（比如从数字列切到文本列却还选着「大于」） */
function pickOperator(current: FilterOperator, kind: ComparableKind): FilterOperator {
  const allowed = operatorsFor(kind);
  if (allowed.includes(current)) return current;
  return kind === 'text' ? 'contains' : 'equals';
}

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
  // 筛选下拉纳入所有真实字段（2026-10-28 用户要求）：
  // 求值是通用字符串匹配（String(row[fieldId])），任何列都能筛；
  // 仅排除 action（附件/操作）列——它是按钮/文件入口，无业务值可筛。
  const filterableColumns = columns.filter((c) => c.type !== 'action');

  const handleAddRule = () => {
    const firstCol = filterableColumns[0];
    const newRule: BitableFilterRule = {
      id: `rule_${Date.now()}`,
      fieldId: firstCol?.id || '',
      operator: pickOperator('contains', resolveComparableKind(firstCol?.type)),
      value: ''
    };
    onUpdateRules([...filterRules, newRule]);
  };

  /** 换字段时顺手把不适用的操作符换成默认值，避免出现「数字列 大于 abc」这种死条件 */
  const handleChangeField = (rule: BitableFilterRule, fieldId: string) => {
    const kind = resolveComparableKind(filterableColumns.find((c) => c.id === fieldId)?.type);
    handleChangeRule(rule.id, { fieldId, operator: pickOperator(rule.operator, kind) });
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
    <div className="absolute left-0 top-full mt-1.5 w-[520px] max-w-[calc(100vw-32px)] bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 select-none text-slate-800 text-[12px] overflow-hidden">
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
            {filterRules.map((rule, idx) => {
              const kind = resolveComparableKind(filterableColumns.find((c) => c.id === rule.fieldId)?.type);
              const operators = operatorsFor(kind);
              const showValue = !['is_empty', 'is_not_empty'].includes(rule.operator);
              const isBetween = rule.operator === 'between';

              return (
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
                  onChange={(e) => handleChangeField(rule, e.target.value)}
                  className="h-6 px-1.5 text-[11px] bg-white border border-slate-200 rounded text-slate-700 focus:outline-none shrink-0 max-w-[110px]"
                >
                  {filterableColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* Operator selector — 选项随列类型变化 */}
                <select
                  value={rule.operator}
                  onChange={(e) => handleChangeRule(rule.id, { operator: e.target.value as FilterOperator })}
                  className="h-6 px-1 text-[11px] bg-white border border-slate-200 rounded text-slate-700 focus:outline-none shrink-0"
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>

                {/* Value Input — between 需要上下界两个框 */}
                {showValue &&
                  (isBetween ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) => handleChangeRule(rule.id, { value: e.target.value })}
                        placeholder={VALUE_PLACEHOLDER[kind]}
                        className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                      />
                      <span className="text-[11px] text-slate-400 shrink-0">~</span>
                      <input
                        type="text"
                        value={rule.value2 ?? ''}
                        onChange={(e) => handleChangeRule(rule.id, { value2: e.target.value })}
                        placeholder={VALUE_PLACEHOLDER[kind]}
                        className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => handleChangeRule(rule.id, { value: e.target.value })}
                      placeholder={VALUE_PLACEHOLDER[kind]}
                      className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                    />
                  ))}

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
              );
            })}
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
