import React, { useMemo, useState } from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { buildCardModel } from './cardModel';

interface BitableCalendarViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  /** 把事件条拖到别的日期格时写回日期字段。不传则事件条不可拖拽 */
  onUpdateCell?: (rowId: string, fieldId: string, value: any) => void;
  /** 当前视图配置：日历按日期字段排布 */
  viewConfig?: BitableViewConfig;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 生成写回字段的日期文本。
 *
 * 保留原值里的时间部分：把「2026-10-08 09:30」拖到 10 号，应得到
 * 「2026-10-10 09:30」而不是把时间抹成 00:00——否则一次拖拽会静默丢掉时刻。
 */
const formatDateForField = (target: Date, original: string): string => {
  const base = `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;
  const m = String(original).match(/(\d{1,2}):(\d{2})/);
  return m ? `${base} ${pad2(Number(m[1]))}:${m[2]}` : base;
};

const parseDate = (raw: any): Date | null => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  // 支持 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' / 'MM-DD HH:mm'
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const BitableCalendarView = <T extends { id: string }>({
  items,
  columns,
  selectedRowId,
  onSelectRow,
  onUpdateCell,
  viewConfig
}: BitableCalendarViewProps<T>) => {
  // 日期字段：优先视图配置，其次自动识别常见日期列
  const dateFieldId = useMemo(() => {
    if (viewConfig?.calendarDateFieldId) return viewConfig.calendarDateFieldId;
    const candidates = ['updatedAt', 'date', 'timestamp', 'publishDate', 'createdAt'];
    return candidates.find((id) => items.some((it) => parseDate((it as any)[id]))) || 'updatedAt';
  }, [viewConfig?.calendarDateFieldId, items]);

  const dateFieldLabel = columns.find((c) => c.id === dateFieldId)?.label || '日期';
  const dateCol = columns.find((c) => c.id === dateFieldId);
  // 字段锁定或宿主没接写回回调时，拖拽没有意义
  const canDrag = !!onUpdateCell && dateCol?.editable !== false && !dateCol?.isLocked;

  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent, target: Date) => {
    e.preventDefault();
    setOverKey(null);
    setDragRowId(null);
    if (!onUpdateCell || !canDrag) return;

    const rowId = e.dataTransfer.getData('text/plain');
    if (!rowId) return;
    const row = items.find((it) => it.id === rowId);
    if (!row) return;

    const original = String((row as any)[dateFieldId] ?? '');
    const next = formatDateForField(target, original);
    if (next === original.trim()) return;
    onUpdateCell(rowId, dateFieldId, next);
  };

  // 排布配置：每周起始日 / 是否显示周末（对齐飞书日历视图的配置项）
  const showWeekend = viewConfig?.calendarShowWeekend !== false;
  const weekStart = viewConfig?.calendarWeekStart ?? 1; // 0=周日 1=周一
  const colCount = showWeekend ? 7 : 5;
  // 隐藏周末时按「工作日」列排布，起始日固定为周一
  const mondayFirst = !showWeekend || weekStart === 1;
  const weekLabels = showWeekend
    ? mondayFirst
      ? ['一', '二', '三', '四', '五', '六', '日']
      : ['日', '一', '二', '三', '四', '五', '六']
    : ['一', '二', '三', '四', '五'];

  const dated = useMemo(
    () =>
      items
        .map((it) => ({ row: it, date: parseDate((it as any)[dateFieldId]) }))
        .filter((x): x is { row: T; date: Date } => !!x.date),
    [items, dateFieldId]
  );

  const [cursor, setCursor] = useState<Date>(() => {
    const first = dated[0]?.date;
    return first ? new Date(first.getFullYear(), first.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  // 构建月历格子：按「每周起始日 + 是否显示周末」铺满整月，月外日期渲染为占位
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const rawOffset = mondayFirst ? (firstOfMonth.getDay() + 6) % 7 : firstOfMonth.getDay();
    const tailOffset = 6 - (mondayFirst ? (lastOfMonth.getDay() + 6) % 7 : lastOfMonth.getDay());
    const start = new Date(year, month, 1 - rawOffset);
    const end = new Date(year, month, lastOfMonth.getDate() + tailOffset);

    const list: { date: Date | null; inMonth: boolean }[] = [];
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if (showWeekend || !isWeekend) {
        const inMonth = d.getMonth() === month && d.getFullYear() === year;
        list.push({ date: new Date(d), inMonth });
      }
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [cursor, mondayFirst, showWeekend]);

  const byDay = useMemo(() => {
    const map = new Map<string, { row: T; date: Date }[]>();
    dated.forEach((d) => {
      const key = `${d.date.getFullYear()}-${d.date.getMonth()}-${d.date.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(d);
      map.set(key, arr);
    });
    return map;
  }, [dated]);

  const todayKey = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`;
  })();

  return (
    <div className="w-full h-full overflow-auto bg-white select-none text-[12px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#005BAC]">calendar_month</span>
          <span className="font-bold text-slate-800 text-[13.5px]">
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </span>
          <span className="px-1.5 py-0.2 bg-blue-50 text-[#005BAC] rounded text-[10.5px] border border-blue-100">
            按「{dateFieldLabel}」排布
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-400 mr-1">
            共 {dated.length} 条有日期记录
            {canDrag && dated.length > 0 && ' · 拖动事件条可改日期'}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="w-6 h-6 rounded hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
            title="上个月"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="h-6 px-1.5 rounded hover:bg-slate-100 text-slate-600 text-[11px] cursor-pointer"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="w-6 h-6 rounded hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
            title="下个月"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Week header */}
      <div
        className="grid border-b border-slate-200 bg-slate-50 text-slate-500 text-[11px] font-semibold"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {weekLabels.map((w) => (
          <div key={w} className="py-1.5 text-center border-r border-slate-200 last:border-r-0">
            周{w}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div
        className="grid auto-rows-fr"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, idx) => {
          const key = cell.date ? `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}` : '';
          const dayItems = cell.date && cell.inMonth ? byDay.get(key) || [] : [];
          const isToday = key === todayKey;
          const isOver = !!cell.date && overKey === key && !!dragRowId;
          return (
            <div
              key={idx}
              onDragOver={(e) => {
                if (!canDrag || !cell.date) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overKey !== key) setOverKey(key);
              }}
              onDragLeave={(e) => {
                // 只在真正离开整个格子时清高亮，避免子元素之间移动导致闪烁
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setOverKey((prev) => (prev === key ? null : prev));
              }}
              onDrop={(e) => {
                if (cell.date) handleDrop(e, cell.date);
              }}
              className={`min-h-[92px] border-r border-b border-slate-100 p-1.5 transition-colors ${
                cell.inMonth ? 'bg-white' : 'bg-slate-50/60'
              } ${(idx + 1) % colCount === 0 ? 'border-r-0' : ''} ${
                isOver ? 'ring-2 ring-inset ring-[#005BAC] bg-blue-50/50' : ''
              }`}
            >
              {cell.date && cell.inMonth && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[11px] font-mono ${
                        isToday
                          ? 'bg-[#005BAC] text-white rounded-full w-5 h-5 flex items-center justify-center font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[10px] text-slate-400">{dayItems.length}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map(({ row }) => {
                      // 按列配置取主字段，避免非图纸台账落到 row.id
                      const card = buildCardModel(columns, row);
                      const label = card.title || String(row.id);
                      const isSelected = selectedRowId === row.id;
                      const statusText = card.status?.text || '';
                      const tone = statusText.includes('差异')
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : statusText.includes('核准') || statusText.includes('归档')
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-[#005BAC] border-blue-200';
                      return (
                        <button
                          key={row.id}
                          type="button"
                          draggable={canDrag}
                          onDragStart={(e) => {
                            if (!canDrag) return;
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', row.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDragRowId(row.id);
                          }}
                          onDragEnd={() => {
                            setDragRowId(null);
                            setOverKey(null);
                          }}
                          onClick={() => onSelectRow?.(row)}
                          className={`w-full text-left px-1 py-0.5 rounded border text-[10px] truncate transition-colors ${tone} ${
                            canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                          } ${isSelected ? 'ring-1 ring-[#005BAC]' : ''} ${
                            dragRowId === row.id ? 'opacity-40' : ''
                          }`}
                          title={[card.titleLabel && label, card.subtitle].filter(Boolean).join(' · ')}
                        >
                          {label}
                        </button>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <div className="text-[9.5px] text-slate-400 pl-1">+{dayItems.length - 3} 条</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {dated.length === 0 && (
        <div className="py-8 text-center text-slate-400 text-[12px]">
          当前数据在「{dateFieldLabel}」字段上没有可识别的日期，请在视图配置中选择其他日期字段。
        </div>
      )}
    </div>
  );
};
