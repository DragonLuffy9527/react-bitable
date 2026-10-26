import React from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel } from './cardModel';

interface BitableGanttViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  /** 视图配置：阶段/版次字段（未设置时用默认 REV 五阶段） */
  stageFieldId?: string | null;
  /** 视图配置：卡片配置（标题字段、显示字段） */
  viewConfig?: BitableViewConfig;
}

/** 未指定阶段字段时使用的默认阶段列 */
const DEFAULT_STAGES = ['待开始', '进行中', '待评审', '已完成', '已关闭'];

export const BitableGanttView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  stageFieldId,
  viewConfig
}: BitableGanttViewProps<T>) => {
  // 阶段字段：优先单选字段的选项作为阶段列，其次取去重值（≤6 列）
  const stageCol = React.useMemo(
    () => (stageFieldId ? columns.find((c) => c.id === stageFieldId) : undefined),
    [columns, stageFieldId]
  );

  const { stages, stageOf } = React.useMemo(() => {
    if (!stageCol) {
      const stageOfDefault = (item: T): number => {
        const rev = String((item as any).rev || 'REV-02');
        if (rev.includes('00')) return 0;
        if (rev.includes('01')) return 1;
        if (rev.includes('02')) return 2;
        if (rev.includes('03')) return 3;
        if (rev.includes('04')) return 4;
        return 2;
      };
      return { stages: DEFAULT_STAGES, stageOf: stageOfDefault };
    }
    const optionLabels: string[] =
      stageCol.options && stageCol.options.length > 0
        ? stageCol.options.map((o) => o.label)
        : Array.from(new Set(items.map((it) => String((it as any)[stageCol.id] ?? '—')))).slice(0, 6);
    const stageList = optionLabels.length > 0 ? optionLabels : DEFAULT_STAGES;
    const idxOf = (val: string): number => {
      const i = stageList.findIndex((s) => s === val);
      if (i >= 0) return i;
      const m = val.match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 0 && n < stageList.length) return n;
      }
      return 0;
    };
    const stageOfCustom = (item: T): number => {
      const raw = (item as any)[stageCol.id];
      if (raw == null || raw === '') return 0;
      const opt = stageCol.options?.find((o) => String(o.value) === String(raw));
      return idxOf(opt ? opt.label : String(raw));
    };
    return { stages: stageList, stageOf: stageOfCustom };
  }, [stageCol, items]);

  const stageCount = Math.max(stages.length, 1);
  const gridColsStyle = { gridTemplateColumns: `repeat(${stageCount}, minmax(0, 1fr))` };

  return (
    <div className="w-full h-full overflow-auto bg-white select-none text-[12px]">
      {/* Gantt Header */}
      <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10 font-semibold text-slate-700">
        <div className="w-72 p-3 border-r border-slate-200 shrink-0 flex items-center justify-between">
          <span>记录条目</span>
          <span className="text-[11px] text-slate-400 font-normal">共 {items.length} 条</span>
        </div>
        <div className="flex-1 grid divide-x divide-slate-200 text-center" style={gridColsStyle}>
          {stages.map((stage) => (
            <div key={stage} className="py-2.5 px-2 text-[11px] truncate" title={stage}>
              {stage}
            </div>
          ))}
        </div>
      </div>

      {/* Gantt Rows */}
      <div className="divide-y divide-slate-100">
        {items.map((item, idx) => {
          const isSelected = selectedRowId === item.id;
          // 按列配置取字段，不再硬编码 code/title/discipline/rev
          const card = buildCardModel(columns, item, 6, {
            titleFieldId: viewConfig?.cardTitleFieldId,
            fieldIds: viewConfig?.cardFields
          });
          const code = card.title;
          const title = card.subtitle;
          const badgeText = card.tags[0]?.text || '';
          const statusText = card.status?.text || '';

          // 阶段下标：由视图配置的「阶段字段」决定（未配置则按内置默认阶段）
          const stageIdx = stageOf(item);

          // 状态词义 → 胶囊色调：异常类红、完成类绿、其余中性
          const isDiff = /阻塞|异常|失败|驳回|延期|差异/.test(statusText);
          const isApproved = /核准|归档|通过|完成|关闭/.test(statusText);

          return (
            <div
              key={item.id}
              onClick={() => onSelectRow?.(item)}
              className={`flex hover:bg-slate-50/80 transition-colors cursor-pointer items-center ${
                isSelected ? 'bg-red-50/50' : idx % 2 === 1 ? 'bg-slate-50/20' : 'bg-white'
              }`}
            >
              {/* Left Item Info */}
              <div className="w-72 p-3 border-r border-slate-200 shrink-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  {badgeText && (
                    <span className="px-1 py-0.2 bg-blue-50 text-blue-700 text-[10px] rounded font-mono font-bold">
                      {badgeText}
                    </span>
                  )}
                  <span className="font-semibold text-slate-800 text-[12px] truncate max-w-[200px]" title={code}>
                    {code}
                  </span>
                </div>
                {title && (
                  <div className="text-[11.5px] text-slate-600 truncate mt-0.5" title={title}>
                    {title}
                  </div>
                )}
              </div>

              {/* Right Gantt Bar Area */}
              <div className="flex-1 grid divide-x divide-slate-100 p-2 relative h-14 items-center" style={gridColsStyle}>
                {/* Background grid lines */}
                {Array.from({ length: stageCount }).map((_, i) => (
                  <div key={i} className="h-full" />
                ))}

                {/* Progress Bar span */}
                <div
                  className={`absolute h-7 rounded-md shadow-xs flex items-center justify-between gap-2 px-2 text-[10.5px] font-bold text-white transition-all ${
                    isDiff ? 'bg-rose-500' : isApproved ? 'bg-emerald-600' : 'bg-[#005BAC]'
                  }`}
                  style={{
                    left: `${(stageIdx / stageCount) * 100 + 2}%`,
                    width: `${100 / stageCount - 4}%`
                  }}
                >
                  <span className="truncate">{badgeText || statusText}</span>
                  {statusText && badgeText && (
                    <span className="text-[9.5px] font-normal opacity-90 truncate">{statusText}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
