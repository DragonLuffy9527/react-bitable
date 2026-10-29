import React from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel, formatTag } from './cardModel';

interface BitableKanbanViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  kanbanFieldId?: string;
  onUpdateCell?: (rowId: string, fieldId: string, value: any) => void;
  /** 视图配置：泳道字段 + 卡片配置（标题字段、显示字段） */
  viewConfig?: BitableViewConfig;
}

export const BitableKanbanView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  kanbanFieldId: propKanbanFieldId,
  onUpdateCell,
  viewConfig
}: BitableKanbanViewProps<T>) => {
  // Determine grouping field for kanban: prefer propKanbanFieldId, or statusText, status, discipline
  const kanbanCol = React.useMemo(() => {
    if (propKanbanFieldId) {
      const found = columns.find((c) => c.id === propKanbanFieldId);
      if (found) return found;
    }
    return (
      columns.find((c) => c.id === 'statusText' || c.id === 'status') ||
      columns.find((c) => c.id === 'discipline') ||
      columns.find((c) => c.type === 'select') ||
      columns[0]
    );
  }, [columns, propKanbanFieldId]);

  const fieldId = kanbanCol?.id || 'statusText';

  // Group items by kanbanCol value
  const { kanbanGroups, optionColors } = React.useMemo(() => {
    // 先按实际值收集，避免字段预设选项与真实数据不一致时出现「一堆空泳道 + 全塞进未分类」
    // （图纸总表的 statusText 选项是 4 个规范状态，实际数据是「已核对通过 (中建国际签认)」这类细粒度值）
    const buckets = new Map<string, T[]>();
    items.forEach((item) => {
      const rawVal = (item as any)[fieldId];
      const val =
        rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
          ? String(rawVal).trim()
          : '未分类';
      const arr = buckets.get(val);
      if (arr) arr.push(item);
      else buckets.set(val, [item]);
    });

    // 泳道顺序：能对上字段选项的按选项顺序在前，其余按首次出现顺序追加
    const optionOrder = new Map<string, number>();
    const colors: Record<string, string> = {
      已核准: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      已归档: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      已核对: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      已审定: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      待处理: 'bg-amber-50 text-amber-700 border-amber-200',
      待核对: 'bg-amber-50 text-amber-700 border-amber-200',
      待发面单: 'bg-amber-50 text-amber-700 border-amber-200',
      待签认: 'bg-red-50 text-[#b81d24] border-red-200',
      差异: 'bg-rose-50 text-rose-700 border-rose-200',
      预审: 'bg-blue-50 text-blue-700 border-blue-200',
      解析: 'bg-blue-50 text-blue-700 border-blue-200',
      待会签: 'bg-purple-50 text-purple-700 border-purple-200',
      未分类: 'bg-slate-100 text-slate-600 border-slate-200'
    };
    kanbanCol?.options?.forEach((opt, i) => {
      const key = opt.label || opt.value;
      optionOrder.set(key, i);
      if (opt.color) colors[key] = opt.color;
    });

    const titles = Array.from(buckets.keys()).sort((a, b) => {
      const ia = optionOrder.has(a) ? optionOrder.get(a)! : Number.MAX_SAFE_INTEGER;
      const ib = optionOrder.has(b) ? optionOrder.get(b)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return 0; // 其余保持插入顺序（Array.sort 稳定）
    });

    return {
      kanbanGroups: titles.map((title) => ({ title, items: buckets.get(title)! })),
      optionColors: colors
    };
  }, [items, fieldId, kanbanCol]);

  return (
    <div className="w-full h-full overflow-x-auto p-4 bg-slate-100/70 select-none">
      <div className="flex gap-4 min-w-max items-start">
        {kanbanGroups.map((group) => {
          // 精确匹配优先，其次按关键词模糊匹配（实际值常带后缀，如「已核对通过 (中建国际签认)」）
          const colorClass =
            optionColors[group.title] ||
            (Object.keys(optionColors).find(
              (k) => k !== '未分类' && group.title.includes(k)
            )
              ? optionColors[
                  Object.keys(optionColors).find(
                    (k) => k !== '未分类' && group.title.includes(k)
                  )!
                ]
              : undefined) ||
            'bg-slate-100 text-slate-700 border-slate-200';

          return (
            <div
              key={group.title}
              className="w-72 bg-slate-50 border border-slate-200/90 rounded-xl shadow-xs flex flex-col max-h-[calc(100vh-250px)]"
            >
              {/* Kanban Column Header */}
              <div className="p-3 border-b border-slate-200/80 flex items-center justify-between bg-white rounded-t-xl shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${colorClass}`}>
                    {group.title}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono font-medium">
                    ({group.items.length})
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  {kanbanCol?.label}
                </div>
              </div>

              {/* Kanban Cards List */}
              <div className="p-2 space-y-2 overflow-y-auto flex-1">
                {group.items.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-[11.5px] border border-dashed border-slate-200 rounded-lg bg-white/40">
                    暂无记录
                  </div>
                ) : (
                  group.items.map((item) => {
                    const isSelected = selectedRowId === item.id;
                    // 按列配置取字段，不再硬编码 code/title/leadPerson
                    const card = buildCardModel(columns, item, 6, {
                      titleFieldId: viewConfig?.cardTitleFieldId,
                      fieldIds: viewConfig?.cardFields
                    });

                    return (
                      <div
                        key={item.id}
                        onClick={() => onSelectRow?.(item)}
                        className={`p-3 bg-white rounded-lg border transition-all cursor-pointer shadow-xs hover:shadow-md hover:border-[#005BAC]/40 ${
                          isSelected
                            ? 'border-[#005BAC] ring-2 ring-blue-100'
                            : 'border-slate-200/90'
                        }`}
                      >
                        {/* Top: 主字段 + 状态 */}
                        <div className="flex items-center justify-between text-[11px] mb-1.5 gap-2">
                          <span
                            className="font-mono font-bold text-slate-800 truncate"
                            title={`${card.titleLabel}：${card.title}`}
                          >
                            {card.title}
                          </span>
                          {card.status && (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-medium shrink-0">
                              {card.status.text}
                            </span>
                          )}
                        </div>

                        {/* 副标题：第二个非空可见字段 */}
                        {card.subtitle && (
                          <div className="text-[12px] font-semibold text-slate-900 leading-snug line-clamp-2 mb-2">
                            {card.subtitle}
                          </div>
                        )}

                        {/* Tags：其余字段 */}
                        {card.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {card.tags.slice(0, 2).map((f) => (
                              <span
                                key={f.id}
                                title={f.label}
                                className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-medium border border-blue-100 truncate max-w-[120px]"
                              >
                                {formatTag(f)}
                              </span>
                            ))}
                            {card.tags.length > 2 && (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded font-medium">
                                +{card.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Footer：人员 + 日期（缺哪项就不渲染哪项） */}
                        {(card.person || card.date) && (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10.5px] text-slate-400 gap-2">
                            {card.person ? (
                              <div className="flex items-center gap-1 text-slate-600 min-w-0">
                                <span className="material-symbols-outlined text-[13px] text-slate-400">
                                  person
                                </span>
                                <span className="truncate" title={card.person.label}>
                                  {card.person.text}
                                </span>
                              </div>
                            ) : (
                              <span />
                            )}
                            {card.date && <span className="shrink-0">{card.date.text}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
