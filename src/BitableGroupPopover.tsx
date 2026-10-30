import React from 'react';
import { BitableColumnConfig, BitableGroupRule } from './types';
import { BitableIcon } from './BitableIcon';

interface BitableGroupPopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  groupRules?: BitableGroupRule[];
  groupByFieldId?: string | null;
  onUpdateGroupRules: (rules: BitableGroupRule[]) => void;
  onSelectGroupField?: (fieldId: string | null) => void;
  isAllCollapsed?: boolean;
  onToggleAllCollapse?: () => void;
  onClose: () => void;
}

export const BitableGroupPopover = <T,>({
  columns,
  groupRules = [],
  groupByFieldId,
  onUpdateGroupRules,
  isAllCollapsed,
  onToggleAllCollapse,
  onClose
}: BitableGroupPopoverProps<T>) => {
  const groupableColumns = columns.filter((c) => c.groupable !== false);

  // Normalize active rules: prefer groupRules; if empty but legacy groupByFieldId exists, adapt it
  const activeRules: BitableGroupRule[] = React.useMemo(() => {
    if (groupRules && groupRules.length > 0) {
      return groupRules;
    }
    if (groupByFieldId) {
      return [{ id: 'rule-legacy', fieldId: groupByFieldId, direction: 'asc' }];
    }
    return [];
  }, [groupRules, groupByFieldId]);

  /**
   * 写入分组规则。
   *
   * 注意：只走 onUpdateGroupRules，不要再回调 onSelectGroupField。
   * 后者的实现（useBitable.setGroupByFieldId）会把 groupRules 重置成「仅第一级」一条，
   * 于是每加一级就被打回单级 —— 表现就是「点添加分组条件没反应、永远只有 1 级」。
   * setGroupRules 内部本来就会同步 groupByFieldId，这一层不需要额外补。
   */
  const updateRules = (nextRules: BitableGroupRule[]) => {
    onUpdateGroupRules(nextRules);
  };

  // Add rule
  const handleAddRule = () => {
    const usedFieldIds = new Set(activeRules.map((r) => r.fieldId));
    const nextCol = groupableColumns.find((c) => !usedFieldIds.has(c.id)) || groupableColumns[0];
    if (!nextCol) return;

    const newRule: BitableGroupRule = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldId: nextCol.id,
      direction: 'asc'
    };
    updateRules([...activeRules, newRule]);
  };

  // Modify rule field
  const handleChangeField = (index: number, newFieldId: string) => {
    const next = [...activeRules];
    next[index] = { ...next[index], fieldId: newFieldId };
    updateRules(next);
  };

  // Toggle rule sort direction
  const handleToggleDirection = (index: number) => {
    const next = [...activeRules];
    const currentDir = next[index].direction || 'asc';
    next[index] = {
      ...next[index],
      direction: currentDir === 'asc' ? 'desc' : 'asc'
    };
    updateRules(next);
  };

  // Remove single rule
  const handleRemoveRule = (index: number) => {
    const next = activeRules.filter((_, i) => i !== index);
    updateRules(next);
  };

  // Move rule up/down
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeRules.length) return;
    const next = [...activeRules];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    updateRules(next);
  };

  // Clear all
  const handleClearAll = () => {
    updateRules([]);
  };

  const levelLabels = ['第一级分组', '第二级分组', '第三级分组', '第四级分组', '第五级分组'];

  return (
    <div
      data-panel="group-rules"
      className="absolute left-0 top-full mt-1.5 w-[360px] bg-white border border-slate-200 rounded-lg shadow-2xl z-50 select-none text-slate-800 text-[12px] animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <BitableIcon name="grid_view" className="text-[17px] text-[#005BAC]" />
          <span className="font-bold text-slate-900 text-[12.5px]">分组设置</span>
          {activeRules.length > 0 && (
            <span className="px-1.5 py-0.2 bg-blue-50 text-[#005BAC] text-[10.5px] font-bold rounded-full">
              {activeRules.length} 级
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleAllCollapse && activeRules.length > 0 && (
            <button
              type="button"
              onClick={onToggleAllCollapse}
              className="text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
              title={isAllCollapsed ? '展开全部嵌套分组' : '收起全部嵌套分组'}
            >
              <BitableIcon
                name={isAllCollapsed ? 'unfold_more' : 'unfold_less'}
                className="text-[13px]"
              />
              <span>{isAllCollapsed ? '全部展开' : '全部收起'}</span>
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-700 rounded p-1 hover:bg-slate-200/60 transition-colors"
          >
            <BitableIcon name="close" className="text-[15px] block" />
          </button>
        </div>
      </div>

      <div className="p-3.5 space-y-3 max-h-[380px] overflow-y-auto">
        <div className="text-[11.5px] text-slate-500 leading-relaxed">
          根据字段值对数据进行多级分类与嵌套汇总，支持单独调整各层级的升降序。
        </div>

        {/* Rules list */}
        {activeRules.length === 0 ? (
          <div className="py-6 px-4 bg-slate-50/80 border border-dashed border-slate-200 rounded-lg text-center text-slate-400">
            <BitableIcon name="table_rows_narrow" className="text-[26px] text-slate-300 block mb-1 mx-auto" />
            <div className="text-[12px] text-slate-600 font-medium">当前为平铺展示 (未设置分组)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">点击下方按钮添加多层级分组条件</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeRules.map((rule, idx) => {
              const dir = rule.direction || 'asc';
              const isFirst = idx === 0;
              const isLast = idx === activeRules.length - 1;

              return (
                <div
                  key={rule.id}
                  className="p-2.5 bg-slate-50/90 border border-slate-200 rounded-md hover:border-slate-300 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#005BAC]"></span>
                      <span className="font-semibold text-slate-700">
                        {levelLabels[idx] || `第 ${idx + 1} 级分组`}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {/* Move up */}
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => handleMoveRule(idx, 'up')}
                        className={`p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 ${
                          isFirst ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        title="上移此级分组"
                      >
                        <BitableIcon name="arrow_upward" className="text-[13px] block" />
                      </button>
                      {/* Move down */}
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => handleMoveRule(idx, 'down')}
                        className={`p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 ${
                          isLast ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        title="下移此级分组"
                      >
                        <BitableIcon name="arrow_downward" className="text-[13px] block" />
                      </button>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer ml-1"
                        title="移除此条件"
                      >
                        <BitableIcon name="close" className="text-[14px] block" />
                      </button>
                    </div>
                  </div>

                  {/* Field select & Direction */}
                  <div className="flex items-center gap-1.5">
                    {/* Field select（原生箭头关掉，只留右侧这一枚，避免两个箭头叠在一起） */}
                    <div className="flex-1 relative">
                      <select
                        value={rule.fieldId}
                        onChange={(e) => handleChangeField(idx, e.target.value)}
                        className="w-full h-7 pl-2 pr-7 text-[12px] bg-white border border-slate-300 rounded appearance-none focus:outline-none focus:ring-1 focus:ring-[#005BAC] focus:border-[#005BAC] font-medium text-slate-800 cursor-pointer"
                      >
                        {groupableColumns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                      <BitableIcon
                        name="unfold_more"
                        className="text-[13px] text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      />
                    </div>

                    {/* Direction toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleDirection(idx)}
                      className="h-7 px-2 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 cursor-pointer shrink-0 text-[11.5px] font-medium transition-colors"
                      title={dir === 'asc' ? '当前：升序 (A → Z, 1 → 9)' : '当前：降序 (Z → A, 9 → 1)'}
                    >
                      <BitableIcon
                        name={dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        className="text-[13px] text-slate-500"
                      />
                      <span>{dir === 'asc' ? '升序' : '降序'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add condition button */}
        <div className="pt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={handleAddRule}
            disabled={activeRules.length >= groupableColumns.length}
            className={`h-7 px-2.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
              activeRules.length >= groupableColumns.length
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer hover:border-[#005BAC] hover:text-[#005BAC]'
            }`}
          >
            <BitableIcon name="add" className="text-[15px]" />
            <span>添加分组条件</span>
          </button>

          {activeRules.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline cursor-pointer"
            >
              清空所有分组
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
