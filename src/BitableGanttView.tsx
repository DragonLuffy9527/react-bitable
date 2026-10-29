import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel } from './cardModel';

interface BitableGanttViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  /** 开始日期字段（优先级低于 viewConfig.ganttStartFieldId） */
  startFieldId?: string | null;
  /** 结束日期字段（优先级低于 viewConfig.ganttEndFieldId） */
  endFieldId?: string | null;
  /** 单格写回：拖拽改期时逐字段调用，未提供 onUpdateCells 时用它兜底 */
  onUpdateCell?: (rowId: string, fieldId: string, value: any) => void;
  /** 批量写回：一次拖拽同时改开始与结束，只产生一步撤销。优先使用 */
  onUpdateCells?: (
    updates: { rowId: string; fieldId: string; value: any }[],
    label?: string
  ) => void;
  viewConfig?: BitableViewConfig;
}

/** 每天占多少像素。28px 刚好能放下两位数日期 + 周末底色 */
const DAY_W = 28;
const LEFT_W = 264;
const ROW_H = 40;

const pad2 = (n: number) => String(n).padStart(2, '0');

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** 用 UTC 天数差算索引，绕开夏令时导致的 23/25 小时偏差 */
const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
const dayIndex = (d: Date, base: Date) => dayNumber(d) - dayNumber(base);

const parseDay = (raw: any): Date | null => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : startOfDay(fallback);
};

/** 写回字段用的日期文本：保留原值里的时间部分，避免拖一次就把时刻抹掉 */
const formatForField = (d: Date, original: string): string => {
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const m = String(original).match(/(\d{1,2}):(\d{2})/);
  return m ? `${base} ${pad2(Number(m[1]))}:${m[2]}` : base;
};

interface DragState {
  rowId: string;
  mode: 'move' | 'resize-end';
  startX: number;
  origStartIdx: number;
  origEndIdx: number;
  delta: number;
}

export const BitableGanttView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  startFieldId: propStartFieldId,
  endFieldId: propEndFieldId,
  onUpdateCell,
  onUpdateCells,
  viewConfig
}: BitableGanttViewProps<T>) => {
  const dateCols = useMemo(() => columns.filter((c) => c.type === 'date'), [columns]);

  const { startFieldId, endFieldId, canEdit } = useMemo(() => {
    const byName = (re: RegExp) => dateCols.find((c) => re.test(`${c.id} ${c.label}`))?.id ?? null;

    const start =
      viewConfig?.ganttStartFieldId ||
      propStartFieldId ||
      byName(/start|begin|开始|启动/) ||
      dateCols[0]?.id ||
      null;
    const end =
      viewConfig?.ganttEndFieldId ||
      propEndFieldId ||
      byName(/end|due|finish|deadline|截止|结束|完成/) ||
      dateCols.find((c) => c.id !== start)?.id ||
      start;

    const startCol = columns.find((c) => c.id === start);
    const endCol = columns.find((c) => c.id === end);
    const editable =
      !!start &&
      !!end &&
      (!!onUpdateCell || !!onUpdateCells) &&
      startCol?.editable !== false &&
      !startCol?.isLocked &&
      endCol?.editable !== false &&
      !endCol?.isLocked;

    return { startFieldId: start, endFieldId: end, canEdit: editable };
  }, [columns, dateCols, viewConfig, propStartFieldId, propEndFieldId, onUpdateCell, onUpdateCells]);

  const rows = useMemo(() => {
    return items.map((item) => {
      const rawStart = startFieldId ? (item as any)[startFieldId] : null;
      const rawEnd = endFieldId ? (item as any)[endFieldId] : null;
      let s = parseDay(rawStart);
      let e = parseDay(rawEnd);
      // 只填了一端时按「单日任务」处理；两端颠倒时自动纠正，避免出现负宽度
      if (s && !e) e = s;
      if (!s && e) s = e;
      if (s && e && e.getTime() < s.getTime()) {
        const t = s;
        s = e;
        e = t;
      }
      return { item, start: s, end: e };
    });
  }, [items, startFieldId, endFieldId]);

  // 时间范围：数据最早开始 ~ 最晚结束，前后各留几天，且至少铺满三周
  const { rangeStart, totalDays } = useMemo(() => {
    const valid = rows.filter((r) => r.start && r.end) as { start: Date; end: Date }[];
    if (valid.length === 0) {
      const today = startOfDay(new Date());
      return { rangeStart: addDays(today, -7), totalDays: 28 };
    }
    let min = valid[0].start;
    let max = valid[0].end;
    valid.forEach((r) => {
      if (r.start < min) min = r.start;
      if (r.end > max) max = r.end;
    });
    const start = addDays(min, -3);
    const span = dayIndex(max, start) + 8;
    return { rangeStart: start, totalDays: Math.max(span, 28) };
  }, [rows]);

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, totalDays]
  );

  const monthSpans = useMemo(() => {
    const spans: { key: string; label: string; count: number }[] = [];
    days.forEach((d) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const last = spans[spans.length - 1];
      if (last && last.key === key) last.count += 1;
      else spans.push({ key, label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, count: 1 });
    });
    return spans;
  }, [days]);

  const todayIdx = dayIndex(startOfDay(new Date()), rangeStart);
  const trackWidth = totalDays * DAY_W;

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const isDragging = drag !== null;

  const commitDrag = (d: DragState) => {
    const row = rows.find((r) => r.item.id === d.rowId);
    if (!row || !row.start || !row.end || !startFieldId || !endFieldId) return;
    if (d.mode === 'move' && d.delta === 0) return;

    const newStartIdx = d.mode === 'move' ? d.origStartIdx + d.delta : d.origStartIdx;
    const newEndIdx =
      d.mode === 'move' ? d.origEndIdx + d.delta : Math.max(d.origStartIdx, d.origEndIdx + d.delta);
    if (d.mode === 'resize-end' && newEndIdx === d.origEndIdx) return;

    const newStart = addDays(rangeStart, newStartIdx);
    const newEnd = addDays(rangeStart, newEndIdx);
    const rawStart = String((row.item as any)[startFieldId] ?? '');
    const rawEnd = String((row.item as any)[endFieldId] ?? '');

    const updates: { rowId: string; fieldId: string; value: any }[] = [];
    if (d.mode === 'move') {
      updates.push({
        rowId: d.rowId,
        fieldId: startFieldId,
        value: formatForField(newStart, rawStart)
      });
    }
    updates.push({
      rowId: d.rowId,
      fieldId: endFieldId,
      value: formatForField(newEnd, rawEnd)
    });

    if (onUpdateCells) onUpdateCells(updates, '调整甘特日期');
    else updates.forEach((u) => onUpdateCell?.(u.rowId, u.fieldId, u.value));
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const delta = Math.round((e.clientX - cur.startX) / DAY_W);
      if (delta !== cur.delta) setDrag({ ...cur, delta });
    };
    const onUp = () => {
      const cur = dragRef.current;
      setDrag(null);
      if (cur) commitDrag(cur);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const beginDrag = (e: React.MouseEvent, rowId: string, mode: DragState['mode']) => {
    if (!canEdit) return;
    const row = rows.find((r) => r.item.id === rowId);
    if (!row?.start || !row?.end) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      rowId,
      mode,
      startX: e.clientX,
      origStartIdx: dayIndex(row.start, rangeStart),
      origEndIdx: dayIndex(row.end, rangeStart),
      delta: 0
    });
  };

  const startLabel = columns.find((c) => c.id === startFieldId)?.label || '开始日期';
  const endLabel = columns.find((c) => c.id === endFieldId)?.label || '结束日期';

  if (!startFieldId || !endFieldId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white text-slate-400 text-[12px] px-6 text-center leading-relaxed">
        甘特视图需要两个日期字段。请先添加「开始日期」「结束日期」字段，再在「视图配置」里指定。
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-white select-none text-[12px]">
      {/* 顶部说明 */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white sticky top-0 z-30"
        style={{ minWidth: LEFT_W + trackWidth }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#005BAC]">view_timeline</span>
          <span className="font-bold text-slate-800 text-[13.5px]">时间轴</span>
          <span className="px-1.5 py-0.2 bg-blue-50 text-[#005BAC] rounded text-[10.5px] border border-blue-100">
            {startLabel} → {endLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>共 {items.length} 条</span>
          <span>
            {rangeStart.getFullYear()}-{pad2(rangeStart.getMonth() + 1)}-
            {pad2(rangeStart.getDate())} 起 {totalDays} 天
          </span>
          {canEdit && <span className="text-slate-500">拖动色条改期，拖右边缘改结束日</span>}
        </div>
      </div>

      <div style={{ minWidth: LEFT_W + trackWidth }}>
        {/* 表头：月份 + 日 */}
        <div className="flex sticky top-[37px] z-20 bg-slate-50 border-b border-slate-200">
          <div
            className="shrink-0 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 px-3 py-1.5 font-semibold text-slate-600 flex items-end"
            style={{ width: LEFT_W }}
          >
            记录
          </div>
          <div style={{ width: trackWidth }}>
            <div className="flex border-b border-slate-200">
              {monthSpans.map((m) => (
                <div
                  key={m.key}
                  className="text-[10.5px] font-semibold text-slate-500 px-2 py-1 border-r border-slate-200 truncate"
                  style={{ width: m.count * DAY_W }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex">
              {days.map((d, i) => {
                const dow = d.getDay();
                const weekend = dow === 0 || dow === 6;
                const isToday = i === todayIdx;
                return (
                  <div
                    key={i}
                    className={`text-center text-[9.5px] py-1 border-r border-slate-100 ${
                      isToday
                        ? 'bg-[#005BAC] text-white font-bold'
                        : weekend
                        ? 'bg-slate-100/80 text-slate-400'
                        : 'text-slate-500'
                    }`}
                    style={{ width: DAY_W }}
                    title={`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`}
                  >
                    {d.getDate()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 数据行 */}
        {rows.map(({ item, start, end }, rowIdx) => {
          const isSelected = selectedRowId === item.id;
          const card = buildCardModel(columns, item, 3, {
            titleFieldId: viewConfig?.cardTitleFieldId,
            fieldIds: viewConfig?.cardFields
          });

          const statusText = card.status?.text || '';
          const tone =
            statusText.includes('差异') || statusText.includes('风险')
              ? 'bg-rose-500'
              : statusText.includes('完成') ||
                statusText.includes('核准') ||
                statusText.includes('归档')
              ? 'bg-emerald-600'
              : 'bg-[#005BAC]';

          let leftIdx = start ? dayIndex(start, rangeStart) : 0;
          let rightIdx = end ? dayIndex(end, rangeStart) : 0;
          const draggingThis = drag?.rowId === item.id;
          if (draggingThis && drag) {
            if (drag.mode === 'move') {
              leftIdx += drag.delta;
              rightIdx += drag.delta;
            } else {
              rightIdx = Math.max(leftIdx, rightIdx + drag.delta);
            }
          }
          const barLeft = leftIdx * DAY_W;
          const barWidth = Math.max(DAY_W, (rightIdx - leftIdx + 1) * DAY_W);

          return (
            <div
              key={item.id}
              className={`flex border-b border-slate-100 ${
                isSelected ? 'bg-blue-50/50' : rowIdx % 2 ? 'bg-slate-50/30' : 'bg-white'
              }`}
              style={{ height: ROW_H }}
            >
              {/* 左侧记录信息 */}
              <div
                onClick={() => onSelectRow?.(item)}
                className={`shrink-0 sticky left-0 z-10 border-r border-slate-200 px-3 flex flex-col justify-center cursor-pointer ${
                  isSelected ? 'bg-blue-50/50' : rowIdx % 2 ? 'bg-slate-50' : 'bg-white'
                }`}
                style={{ width: LEFT_W }}
                title={card.title}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-bold text-slate-800 text-[11px] truncate">
                    {card.title || String(item.id)}
                  </span>
                  {card.status && (
                    <span className="px-1 py-0.2 bg-slate-100 text-slate-500 rounded text-[9.5px] shrink-0">
                      {card.status.text}
                    </span>
                  )}
                </div>
                {card.subtitle && (
                  <div className="text-[10.5px] text-slate-500 truncate">{card.subtitle}</div>
                )}
              </div>

              {/* 右侧时间轨 */}
              <div className="relative" style={{ width: trackWidth }}>
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map((d, i) => {
                    const dow = d.getDay();
                    const weekend = dow === 0 || dow === 6;
                    return (
                      <div
                        key={i}
                        className={`border-r border-slate-100 ${weekend ? 'bg-slate-100/50' : ''}`}
                        style={{ width: DAY_W }}
                      />
                    );
                  })}
                </div>
                {todayIdx >= 0 && todayIdx < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-400/70 pointer-events-none"
                    style={{ left: todayIdx * DAY_W + DAY_W / 2 }}
                  />
                )}

                {start && end ? (
                  <div
                    onMouseDown={(e) => beginDrag(e, item.id, 'move')}
                    onClick={() => onSelectRow?.(item)}
                    className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md text-white text-[10px] flex items-center px-1.5 overflow-hidden shadow-xs ${tone} ${
                      canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                    } ${draggingThis ? 'opacity-80 ring-2 ring-white' : ''}`}
                    style={{ left: barLeft, width: barWidth }}
                    title={`${card.title} · ${start.getFullYear()}-${pad2(
                      start.getMonth() + 1
                    )}-${pad2(start.getDate())} → ${end.getFullYear()}-${pad2(
                      end.getMonth() + 1
                    )}-${pad2(end.getDate())}`}
                  >
                    <span className="truncate">{card.title}</span>
                    {canEdit && (
                      <span
                        onMouseDown={(e) => beginDrag(e, item.id, 'resize-end')}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                        title="拖动改结束日期"
                      />
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-y-0 left-2 flex items-center text-[10.5px] text-slate-300">
                    未设置日期
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-[12px]">当前视图没有记录</div>
      )}
    </div>
  );
};
