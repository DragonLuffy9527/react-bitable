import React, { useMemo, useState } from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel, formatTag } from './cardModel';
import { BitableIcon } from './BitableIcon';

interface BitableKanbanViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  kanbanFieldId?: string;
  /** 拖拽卡片换列时写回分组字段。不传则卡片不可拖拽（只读展示） */
  onUpdateCell?: (rowId: string, fieldId: string, value: any) => void;
  /** 视图配置：泳道字段 + 卡片配置（标题字段、显示字段） */
  viewConfig?: BitableViewConfig;
}

/** 无值记录归入的泳道名。投放回这条泳道等于把字段清空 */
const UNSET_LANE = '未分类';

interface Lane<T> {
  /** 泳道显示名 */
  title: string;
  /** 投放时要写入字段的真实值（单选字段的 value 可能与 label 不同） */
  value: string;
  items: T[];
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
  // 分组字段：优先视图配置，其次按常见字段名猜，最后退到第一个单选列
  const kanbanCol = useMemo(() => {
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
  // 字段被锁定或宿主没接写回回调时，拖拽没有意义，直接禁用
  const canDrag = !!onUpdateCell && kanbanCol?.editable !== false && !kanbanCol?.isLocked;

  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);

  const { lanes, optionColors } = useMemo(() => {
    // 先按实际值分桶。不能只按字段预设选项分：真实数据常带后缀
    // （如「已核对通过 (中建国际签认)」），只按选项分会让它们全塞进未分类。
    const buckets = new Map<string, T[]>();
    items.forEach((item) => {
      const rawVal = (item as any)[fieldId];
      const val =
        rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
          ? String(rawVal).trim()
          : UNSET_LANE;
      const arr = buckets.get(val);
      if (arr) arr.push(item);
      else buckets.set(val, [item]);
    });

    // 选项顺序 + 配色；同时把「没有记录的选项」补成空泳道，
    // 否则用户没法把卡片拖进一个当前没有任何记录的状态。
    const optionOrder = new Map<string, number>();
    const valueByLabel = new Map<string, string>();
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
      [UNSET_LANE]: 'bg-slate-100 text-slate-600 border-slate-200'
    };

    kanbanCol?.options?.forEach((opt, i) => {
      const key = opt.label || opt.value;
      optionOrder.set(key, i);
      valueByLabel.set(key, opt.value);
      if (opt.color) colors[key] = opt.color;
      if (!buckets.has(key)) buckets.set(key, []);
    });

    const titles = Array.from(buckets.keys()).sort((a, b) => {
      const ia = optionOrder.has(a) ? optionOrder.get(a)! : Number.MAX_SAFE_INTEGER;
      const ib = optionOrder.has(b) ? optionOrder.get(b)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return 0; // 其余保持插入顺序（Array.sort 稳定）
    });

    const nextLanes: Lane<T>[] = titles.map((title) => ({
      title,
      value: title === UNSET_LANE ? '' : valueByLabel.get(title) ?? title,
      items: buckets.get(title)!
    }));

    return { lanes: nextLanes, optionColors: colors };
  }, [items, fieldId, kanbanCol]);

  const handleDrop = (e: React.DragEvent, lane: Lane<T>) => {
    e.preventDefault();
    setOverLane(null);
    setDragRowId(null);
    if (!onUpdateCell || !canDrag) return;

    const rowId = e.dataTransfer.getData('text/plain');
    if (!rowId) return;
    const item = items.find((it) => it.id === rowId);
    if (!item) return;

    const current = (item as any)[fieldId];
    const currentText = current == null ? '' : String(current).trim();
    if (currentText === lane.value) return;

    onUpdateCell(rowId, fieldId, lane.value);
  };

  if (lanes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100/70 text-slate-400 text-[12px]">
        当前视图没有可用的分组字段，请在「视图配置」里选择一个单选字段作为泳道依据。
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-x-auto p-4 bg-slate-100/70 select-none">
      <div className="flex gap-4 min-w-max items-start">
        {lanes.map((lane) => {
          // 精确匹配优先，其次按关键词模糊匹配（实际值常带后缀）
          const colorClass =
            optionColors[lane.title] ||
            (Object.keys(optionColors).find(
              (k) => k !== UNSET_LANE && lane.title.includes(k)
            )
              ? optionColors[
                  Object.keys(optionColors).find(
                    (k) => k !== UNSET_LANE && lane.title.includes(k)
                  )!
                ]
              : undefined) ||
            'bg-slate-100 text-slate-700 border-slate-200';

          const isOver = overLane === lane.title && !!dragRowId;

          return (
            <div
              key={lane.title}
              onDragOver={(e) => {
                if (!canDrag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overLane !== lane.title) setOverLane(lane.title);
              }}
              onDragLeave={(e) => {
                // 只有真正离开整列才清除高亮，否则子元素之间移动会闪烁
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setOverLane((prev) => (prev === lane.title ? null : prev));
              }}
              onDrop={(e) => handleDrop(e, lane)}
              className={`w-72 bg-slate-50 border rounded-xl shadow-xs flex flex-col max-h-[calc(100vh-250px)] transition-colors ${
                isOver
                  ? 'border-[#005BAC] ring-2 ring-blue-200 bg-blue-50/40'
                  : 'border-slate-200/90'
              }`}
            >
              {/* 泳道头 */}
              <div className="p-3 border-b border-slate-200/80 flex items-center justify-between bg-white rounded-t-xl shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${colorClass}`}>
                    {lane.title}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono font-medium">
                    ({lane.items.length})
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">{kanbanCol?.label}</div>
              </div>

              {/* 卡片列表 */}
              <div className="p-2 space-y-2 overflow-y-auto flex-1">
                {lane.items.length === 0 ? (
                  <div
                    className={`py-8 text-center text-[11.5px] border border-dashed rounded-lg ${
                      isOver
                        ? 'border-[#005BAC] text-[#005BAC] bg-white'
                        : 'border-slate-200 text-slate-400 bg-white/40'
                    }`}
                  >
                    {canDrag ? (isOver ? '松手放到这里' : '暂无记录，可拖入') : '暂无记录'}
                  </div>
                ) : (
                  lane.items.map((item) => {
                    const isSelected = selectedRowId === item.id;
                    const card = buildCardModel(columns, item, 6, {
                      titleFieldId: viewConfig?.cardTitleFieldId,
                      fieldIds: viewConfig?.cardFields
                    });
                    const isDragging = dragRowId === item.id;

                    return (
                      <div
                        key={item.id}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          e.stopPropagation();
                          e.dataTransfer.setData('text/plain', item.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragRowId(item.id);
                        }}
                        onDragEnd={() => {
                          setDragRowId(null);
                          setOverLane(null);
                        }}
                        onClick={() => onSelectRow?.(item)}
                        className={`p-3 bg-white rounded-lg border transition-all shadow-xs hover:shadow-md hover:border-[#005BAC]/40 ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${isDragging ? 'opacity-40' : ''} ${
                          isSelected
                            ? 'border-[#005BAC] ring-2 ring-blue-100'
                            : 'border-slate-200/90'
                        }`}
                      >
                        {/* 主字段 + 状态 */}
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

                        {card.subtitle && (
                          <div className="text-[12px] font-semibold text-slate-900 leading-snug line-clamp-2 mb-2">
                            {card.subtitle}
                          </div>
                        )}

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

                        {(card.person || card.date) && (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10.5px] text-slate-400 gap-2">
                            {card.person ? (
                              <div className="flex items-center gap-1 text-slate-600 min-w-0">
                                <BitableIcon name="person" className="text-[13px] text-slate-400" />
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
