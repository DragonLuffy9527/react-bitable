import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  BitableColumnConfig,
  BitableColorRule,
  BitableDensity,
  BitableViewType,
  BitableViewConfig,
  BitableGroupSection
} from './types';
import { EditableCell } from './EditableCell';
import {
  buildFillPlan,
  incrementValue,
  isFillableFieldType,
  BitableFillUpdate
} from './fillSeries';
import { BitableKanbanView } from './BitableKanbanView';
import { BitableGalleryView } from './BitableGalleryView';
import { BitableGanttView } from './BitableGanttView';
import { BitableCalendarView } from './BitableCalendarView';
import { BitableFormView } from './BitableFormView';

interface BitableTableProps<T extends { id: string }> {
  columns: BitableColumnConfig<T>[];
  groupedData:
    | BitableGroupSection<T>[]
    | {
        groupKey: string;
        groupTitle: string;
        items: T[];
        level?: number;
        parentKey?: string;
        isLeaf?: boolean;
        fieldLabel?: string;
        groupValue?: string;
      }[];
  selectedRowId?: string | null;
  onSelectRow?: (row: T) => void;
  checkedIds: Record<string, boolean>;
  onToggleCheck: (id: string, e: React.MouseEvent) => void;
  onToggleSelectAll: (checked: boolean) => void;
  /**
   * Excel 式行选择（Shift+点击范围选择）时回传目标行集合：
   * 页面应把勾选集整体替换为这批行（作用对象与复选框勾选一致）。
   * 未提供时 Shift+点击退化为普通单行点击。
   */
  onSelectRows?: (rowIds: string[]) => void;
  density: BitableDensity;
  colorRules: BitableColorRule[];
  onUpdateCell: (rowId: string, fieldId: string, value: any) => void;
  onDeleteRow?: (rowId: string) => void;
  onToggleColumnLock?: (columnId: string) => void;
  /**
   * 列锁定保护判定（wiki/13 §13.18 固定字段）：返回 true 的已锁定列为
   * 「后端固定字段」，锁图标显示红色且不可解锁（点击由页面的
   * onToggleColumnLock 弹 Toast 拒绝）。未提供时所有锁定列按普通锁定（黄色）展示。
   */
  isLockProtectedColumn?: (columnId: string) => boolean;
  onRenameColumn?: (columnId: string, newLabel: string) => void;
  /** 表头左右拖动调整列顺序：传入即启用拖拽 */
  onReorderColumns?: (dragColumnId: string, targetColumnId: string) => void;
  /** 拖动表头右边线调整列宽：传入即启用拖拽边线 */
  onResizeColumn?: (columnId: string, width: number) => void;
  /** 右键菜单/拖拽：插入空白记录（anchorRowId 为空时追加到表尾） */
  onInsertRow?: (anchorRowId: string | null, position: 'above' | 'below' | 'child') => void;
  /** 右键菜单：复制记录到当前行下方 */
  onDuplicateRow?: (rowId: string) => void;
  /** 拖拽：调整行顺序 / 建立父子记录 */
  onMoveRow?: (dragId: string, targetId: string, position: 'before' | 'after' | 'child') => void;
  /** 右键菜单：解除父子层级 */
  onDetachRow?: (rowId: string) => void;
  /** 需要滚动定位并高亮的行（新增/插入记录后使用） */
  scrollToRowId?: string | null;
  emptyText?: string;
  collapsedGroups?: Record<string, boolean>;
  onToggleGroupCollapse?: (groupKey: string) => void;
  viewType?: BitableViewType;
  /** 当前视图完整配置：为父子记录等视图级配置提供数据 */
  viewConfig?: BitableViewConfig;
  /** 画册视图封面点「预览附件」时回传该行，由页面接到 AttachmentViewerModal */
  onOpenAttachment?: (row: T) => void;
  /**
   * 拖拽填充（单元格右下角手柄下拉，Excel 式递增/复制）的批量写入回调。
   * 未提供时退化为逐格 onUpdateCell（会触发 N 次保存反馈，建议页面都接上）。
   */
  onFillCells?: (updates: BitableFillUpdate[]) => void;
  /**
   * 填充模式：撑满父容器高度（父级需为确定高度的 flex 列，本组件 h-full 内部滚动）。
   * 默认 false 时沿用旧版 max-h-[calc(100vh-215px)] 视口截断，四个台账页应统一传 true 以对齐底边。
   */
  fillHeight?: boolean;
}

export const BitableTable = <T extends { id: string }>({
  columns,
  groupedData,
  selectedRowId,
  onSelectRow,
  checkedIds,
  onToggleCheck,
  onToggleSelectAll,
  onSelectRows,
  density,
  colorRules,
  onUpdateCell,
  onDeleteRow,
  onToggleColumnLock,
  isLockProtectedColumn,
  onRenameColumn,
  onReorderColumns,
  onResizeColumn,
  onInsertRow,
  onDuplicateRow,
  onMoveRow,
  onDetachRow,
  scrollToRowId,
  emptyText = '暂无符合条件的记录',
  collapsedGroups: controlledCollapsedGroups,
  onToggleGroupCollapse,
  viewType = 'grid',
  viewConfig,
  onOpenAttachment,
  onFillCells,
  fillHeight = false
}: BitableTableProps<T>) => {
  const visibleColumns = columns.filter((c) => c.visible);
  // 父子记录的行折叠状态（置于条件早返回之前，保证 hooks 顺序稳定）
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});
  // Excel 式行选择锚点（最近一次普通/Ctrl/勾选点击的行），置于早返回之前保证 hooks 顺序稳定
  const anchorRowIdRef = useRef<string | null>(null);

  // Column renaming inline state
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColLabel, setEditingColLabel] = useState<string>('');

  // 表头拖拽换列状态（ref 存逻辑值，state 只驱动视觉反馈）
  const dragColIdRef = useRef<string | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // —— 列宽拖拽（拖动表头右边线） ——
  const [resizing, setResizing] = useState<{ id: string; width: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const resizeWidthRef = useRef(0);
  const resizeCallbackRef = useRef(onResizeColumn);
  resizeCallbackRef.current = onResizeColumn;

  const beginResize = (e: React.MouseEvent, columnId: string, startWidth: number) => {
    if (!onResizeColumn) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { id: columnId, startX: e.clientX, startWidth };
    resizeWidthRef.current = startWidth;
    setResizing({ id: columnId, width: startWidth });
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      // 最小 52px：日期/张数等短内容列可以压得更扁，配合 52px 的 minWidth 兜底
      const width = Math.max(52, Math.round(start.startWidth + (e.clientX - start.startX)));
      resizeWidthRef.current = width;
      setResizing({ id: start.id, width });
    };
    const handleUp = () => {
      const start = resizeRef.current;
      resizeRef.current = null;
      setResizing(null);
      if (start) resizeCallbackRef.current?.(start.id, resizeWidthRef.current);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // 只在开始/结束时重建监听，拖动过程中不重订阅
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing?.id]);

  /** 拖动过程中用预览宽度覆盖列宽，松手后再落到 columns 配置里 */
  const effectiveWidth = (col: BitableColumnConfig<T>) =>
    resizing && resizing.id === col.id ? `${resizing.width}px` : col.width;
  const effectiveMinWidth = (col: BitableColumnConfig<T>) =>
    resizing && resizing.id === col.id ? `${resizing.width}px` : col.minWidth || '52px';

  // —— 单元格拖拽填充（右下角手柄下拉：递增 / 复制，对齐 Excel） ——
  const [fillDrag, setFillDrag] = useState<{
    rowIds: string[];
    label: string;
    chip: { x: number; y: number };
  } | null>(null);
  const [filling, setFilling] = useState(false);
  const fillTargetSet = useMemo(() => new Set(fillDrag?.rowIds || []), [fillDrag]);
  const fillStateRef = useRef<{
    fieldId: string;
    type: BitableColumnConfig<T>['type'];
    value: any;
    rows: { id: string; top: number; bottom: number }[];
    sourceIndex: number;
    lastIndex: number;
    copyOnly: boolean;
    anchor: { left: number };
  } | null>(null);
  const fillCommitRef = useRef(onFillCells);
  fillCommitRef.current = onFillCells;
  const fillFallbackRef = useRef(onUpdateCell);
  fillFallbackRef.current = onUpdateCell;

  /**
   * 可填充列：除「后台固定字段」（附件 / 操作等 action 列）与被锁定的列外全部开放。
   * 只读列（图纸编号 / 名称 / 生效版本等）也允许填充——写入走 updateCell，渲染层会正常反映。
   */
  const canFillColumn = (col: BitableColumnConfig<T>) =>
    col.type !== 'action' && !col.isLocked && isFillableFieldType(col.type);

  /** 按下手柄：记录源行、当前可见行序（含分组顺序，已渲染的行才算） */
  const beginFill = (e: React.MouseEvent, row: T, col: BitableColumnConfig<T>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    const tableEl = handle.closest('table');
    if (!tableEl) return;
    const rowNodes = Array.from(
      tableEl.querySelectorAll('tbody tr[data-row-id]')
    ) as HTMLElement[];
    const rows = rowNodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.rowId || '', top: rect.top, bottom: rect.bottom };
    });
    const sourceIndex = rows.findIndex((r) => r.id === row.id);
    if (sourceIndex < 0) return;
    const cellRect =
      (handle.closest('td') as HTMLElement | null)?.getBoundingClientRect() ||
      handle.getBoundingClientRect();
    fillStateRef.current = {
      fieldId: col.id,
      type: col.type,
      value: (row as any)[col.id],
      rows,
      sourceIndex,
      lastIndex: sourceIndex,
      copyOnly: e.shiftKey,
      anchor: { left: cellRect.left }
    };
    setFillDrag(null);
    setFilling(true);
  };

  useEffect(() => {
    if (!filling) return;

    // 只在「命中的目标行」变化时才 setState，避免每移动一个像素就重渲染整张表
    const handleMove = (ev: MouseEvent) => {
      const st = fillStateRef.current;
      if (!st || st.rows.length === 0) return;
      let hoverIndex = st.lastIndex;
      for (let i = 0; i < st.rows.length; i += 1) {
        if (ev.clientY >= st.rows[i].top && ev.clientY <= st.rows[i].bottom) {
          hoverIndex = i;
          break;
        }
      }
      if (ev.clientY > st.rows[st.rows.length - 1].bottom) hoverIndex = st.rows.length - 1;
      if (ev.clientY < st.rows[0].top) hoverIndex = 0;

      const copyOnly = ev.shiftKey;
      if (hoverIndex === st.lastIndex && copyOnly === st.copyOnly) return;
      st.lastIndex = hoverIndex;
      st.copyOnly = copyOnly;

      if (hoverIndex === st.sourceIndex) {
        setFillDrag(null);
        return;
      }

      const downward = hoverIndex > st.sourceIndex;
      const rowIds = downward
        ? st.rows.slice(st.sourceIndex + 1, hoverIndex + 1).map((r) => r.id)
        : st.rows
            .slice(hoverIndex, st.sourceIndex)
            .map((r) => r.id)
            .reverse();
      const direction = downward ? 1 : -1;
      const previewValue = incrementValue(
        st.type,
        st.value,
        copyOnly ? 0 : direction * rowIds.length
      );
      const previewText =
        previewValue === undefined || previewValue === null || String(previewValue).trim() === ''
          ? '空'
          : Array.isArray(previewValue)
          ? previewValue.join('、') || '空'
          : String(previewValue);

      setFillDrag({
        rowIds,
        label: copyOnly
          ? `复制填充 ${rowIds.length} 行`
          : `递增填充 ${rowIds.length} 行 · 末行 ${previewText}`,
        chip: {
          x: Math.min(Math.max(8, st.anchor.left), Math.max(8, window.innerWidth - 240)),
          y: Math.min(st.rows[hoverIndex].bottom + 6, window.innerHeight - 32)
        }
      });
    };

    const handleUp = () => {
      const st = fillStateRef.current;
      fillStateRef.current = null;
      setFilling(false);
      setFillDrag(null);
      if (!st || st.lastIndex === st.sourceIndex) return;

      const downward = st.lastIndex > st.sourceIndex;
      const rowIds = downward
        ? st.rows.slice(st.sourceIndex + 1, st.lastIndex + 1).map((r) => r.id)
        : st.rows
            .slice(st.lastIndex, st.sourceIndex)
            .map((r) => r.id)
            .reverse();
      if (rowIds.length === 0) return;

      const updates = buildFillPlan({
        fieldId: st.fieldId,
        type: st.type,
        sourceValue: st.value,
        targetRowIds: rowIds,
        copyOnly: st.copyOnly,
        direction: downward ? 1 : -1
      });
      if (fillCommitRef.current) {
        fillCommitRef.current(updates);
      } else {
        updates.forEach((u) => fillFallbackRef.current(u.rowId, u.fieldId, u.value));
      }
    };

    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [filling]);

  /**
   * 冻结列（`col.isFrozen`）：左侧吸附定位。
   * 勾选列 w-9(36px) + 行号列 w-10(40px) 常驻左侧共 76px，冻结列的 left 从该值起逐列累加。
   *
   * ⚠️ 偏移必须按「实际渲染宽度」累加：表格是 table-layout:auto + width:100%，
   * 浏览器会把列宽重新分配到与配置宽度不同的实际值；若按配置宽度估算，冻结单元格
   * 之间会留出缝隙，横向滚动时右侧内容从缝隙中透出（2026-10-28 修复）。
   * 首帧先用配置宽度估算，layout effect 测量 thead 实际列宽后切换为实测值，
   * 并用 ResizeObserver 跟随容器 / 列宽变化重测。
   */
  const LEAD_COL_WIDTH = 76;
  const parseWidthPx = (value?: string | number): number => {
    if (typeof value === 'number') return value;
    const matched = /^\s*([\d.]+)px\s*$/.exec(String(value ?? ''));
    return matched ? parseFloat(matched[1]) : 140;
  };
  const estimatedFrozenLeftMap: Record<string, number> = {};
  {
    let cursor = LEAD_COL_WIDTH;
    visibleColumns.forEach((col) => {
      if (!col.isFrozen) return;
      estimatedFrozenLeftMap[col.id] = cursor;
      cursor += parseWidthPx(effectiveWidth(col));
    });
  }
  const [measuredFrozenLeftMap, setMeasuredFrozenLeftMap] = useState<Record<
    string,
    number
  > | null>(null);
  const frozenLeftMap = measuredFrozenLeftMap ?? estimatedFrozenLeftMap;
  const tableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => {
      const map: Record<string, number> = {};
      let cursor = LEAD_COL_WIDTH;
      for (const col of visibleColumns) {
        if (!col.isFrozen) continue;
        const th = table.querySelector<HTMLTableCellElement>(
          `thead tr:first-child th[data-col-id="${CSS.escape(col.id)}"]`
        );
        map[col.id] = cursor;
        cursor += th ? th.offsetWidth : parseWidthPx(effectiveWidth(col));
      }
      setMeasuredFrozenLeftMap((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(map) ? prev : map
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
    // visibleColumns 引用每轮渲染都可能是新数组，这里刻意每次渲染重测；
    // setState 有相等性守卫，不会形成死循环。
  });
  const lastFrozenId = [...visibleColumns].reverse().find((col) => col.isFrozen)?.id;

  // —— 行拖拽（排序 / 建立父子记录） ——
  const dragRowIdRef = useRef<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{
    rowId: string;
    position: 'before' | 'after' | 'child';
  } | null>(null);

  /**
   * 拖放落点提示：用单元格边框画插入线（tr 上的 box-shadow 在 border-collapse 表格里不可靠）
   */
  const dropHintClass = (rowId: string) => {
    if (!dropHint || dropHint.rowId !== rowId) return '';
    if (dropHint.position === 'before') {
      return 'bg-blue-50/70 [&>td]:border-t-2 [&>td]:border-t-[#005BAC]';
    }
    if (dropHint.position === 'after') {
      return 'bg-blue-50/70 [&>td]:border-b-2 [&>td]:border-b-[#005BAC]';
    }
    return 'bg-blue-50/90 [&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-[#005BAC]';
  };

  // —— 行右键菜单 ——
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rowId: string } | null>(null);

  // 新增/插入记录后滚动到该行并闪一下底色（排序视图里新行往往不在可视区）
  useEffect(() => {
    if (!scrollToRowId) return;
    const el = document.querySelector<HTMLElement>(`tr[data-row-id="${scrollToRowId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('bitable-row-flash');
    const timer = window.setTimeout(() => el.classList.remove('bitable-row-flash'), 1700);
    return () => window.clearTimeout(timer);
  }, [scrollToRowId]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ctxMenu]);

  const openCtxMenu = (e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 224;
    const menuHeight = 268;
    setCtxMenu({
      x: Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8)),
      rowId
    });
  };

  const ctxMenuItem = (
    icon: string,
    label: string,
    onPick: () => void,
    variant: 'default' | 'danger' = 'default'
  ) => (
    <button
      type="button"
      onClick={() => {
        onPick();
        setCtxMenu(null);
      }}
      className={`w-full flex items-center gap-2 px-2.5 py-[7px] text-left cursor-pointer transition-colors ${
        variant === 'danger'
          ? 'text-rose-600 hover:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span
        className={`material-symbols-outlined text-[15px] leading-none ${
          variant === 'danger' ? 'text-rose-500' : 'text-slate-400'
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );

  const handleStartRename = (col: BitableColumnConfig<T>) => {
    if (!onRenameColumn) return;
    // 改名只看显式锁定：editable:false 只代表单元格只读（主键、图名等），仍允许改字段名。
    // 与 useBitable.renameColumn、字段配置弹层保持同一口径。
    if (col.isLocked) return;
    setEditingColId(col.id);
    setEditingColLabel(col.label);
  };

  const handleSaveRename = (colId: string) => {
    const trimmed = editingColLabel.trim();
    if (trimmed && onRenameColumn) {
      onRenameColumn(colId, trimmed);
    }
    setEditingColId(null);
  };

  // Group collapsed state (supports controlled via props or uncontrolled local state)
  const [internalCollapsedGroups, setInternalCollapsedGroups] = useState<Record<string, boolean>>({});
  const isControlled = controlledCollapsedGroups !== undefined;
  const collapsedGroups = isControlled ? controlledCollapsedGroups : internalCollapsedGroups;

  const toggleGroupCollapse = (groupKey: string) => {
    if (onToggleGroupCollapse) {
      onToggleGroupCollapse(groupKey);
    } else {
      setInternalCollapsedGroups((prev) => ({
        ...prev,
        [groupKey]: !prev[groupKey]
      }));
    }
  };

  // Row height mapping
  const rowHeightClass = {
    compact: 'h-8 py-0.5 text-[11.5px]',
    medium: 'h-10 py-1 text-[12px]',
    relaxed: 'h-13 py-2 text-[12.5px]'
  }[density];

  // Total items
  const allItems = groupedData.flatMap((g) => g.items);
  const allChecked = allItems.length > 0 && allItems.every((item) => checkedIds[item.id]);

  // Color rule preset class to hex mappings (guarantees inline style fallback)
  const presetClassToColor: Record<string, { bg: string; text: string; border?: string }> = {
    'bg-red-50': { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    'bg-rose-50': { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
    'bg-orange-50': { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
    'bg-yellow-50': { bg: '#fefce8', text: '#a16207', border: '#fde047' },
    'bg-amber-50': { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
    'bg-amber-100': { bg: '#fef08a', text: '#854d0e', border: '#eab308' },
    'bg-emerald-50': { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' },
    'bg-green-50': { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
    'bg-teal-50': { bg: '#f0fdfa', text: '#0f766e', border: '#5eead4' },
    'bg-blue-50': { bg: '#eff6ff', text: '#005BAC', border: '#93c5fd' },
    'bg-sky-50': { bg: '#f0f9ff', text: '#0369a1', border: '#7dd3fc' },
    'bg-cyan-50': { bg: '#ecfeff', text: '#0e7490', border: '#67e8f9' },
    'bg-purple-50': { bg: '#faf5ff', text: '#7e22ce', border: '#d8b4fe' },
    'bg-indigo-50': { bg: '#eef2ff', text: '#4338ca', border: '#a5b4fc' },
    'bg-pink-50': { bg: '#fdf2f8', text: '#be185d', border: '#f472b6' },
    'bg-slate-50': { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
    'bg-slate-100': { bg: '#f1f5f9', text: '#334155', border: '#94a3b8' },
    'bg-slate-200': { bg: '#e2e8f0', text: '#0f172a', border: '#64748b' }
  };

  const evaluateColorRule = (row: T, rule: BitableColorRule): boolean => {
    const rawVal = (row as any)[rule.fieldId];
    if (rule.operator === 'empty') {
      return rawVal === undefined || rawVal === null || String(rawVal).trim() === '';
    }
    if (rule.operator === 'notEmpty') {
      return rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';
    }
    if (rawVal === undefined || rawVal === null) return false;

    const target = (rule.value || '').toLowerCase().trim();
    if (!target) return false; // Prevent empty string matching every row

    const strVal = String(rawVal).toLowerCase();
    if (rule.operator === 'equals') {
      return strVal === target;
    }
    if (rule.operator === 'startsWith') {
      return strVal.startsWith(target);
    }
    // Default: 'contains'
    return strVal.includes(target);
  };

  const resolveColorOutput = (rule: BitableColorRule) => {
    const fallback = rule.bgClass ? presetClassToColor[rule.bgClass] : null;
    const bg = rule.bgColor || fallback?.bg || '#fef2f2';
    const text = rule.textColor || fallback?.text || '#b91c1c';
    const border = rule.borderColor || fallback?.border || '#fca5a5';
    return {
      className: `${rule.bgClass || ''} ${rule.textClass || ''}`.trim(),
      style: { backgroundColor: bg, color: text } as React.CSSProperties,
      bgColor: bg,
      textColor: text,
      borderColor: border
    };
  };

  // 选中描边：画在单元格内部（inset 阴影会覆盖在单元格填充色之上），
  // 避免 td 的背景色把 tr 的 ring 盖住。
  const selectionOutline = (isSelected: boolean, isFirst = false, isLast = false) => {
    if (!isSelected) return undefined;
    const parts = ['inset 0 2px 0 0 #005BAC', 'inset 0 -2px 0 0 #005BAC'];
    if (isFirst) parts.push('inset 2px 0 0 0 #005BAC');
    if (isLast) parts.push('inset -2px 0 0 0 #005BAC');
    return parts.join(', ');
  };

  // Color rule evaluator for row scope
  const getRowColorStyle = (row: T) => {
    for (const rule of colorRules) {
      if (rule.scope !== 'row') continue;
      if (evaluateColorRule(row, rule)) {
        return resolveColorOutput(rule);
      }
    }
    return null;
  };

  // Color rule evaluator for cell scope
  const getCellColorStyle = (row: T, fieldId: string) => {
    for (const rule of colorRules) {
      if (rule.scope !== 'cell') continue;
      const targetCol = rule.targetFieldId || rule.fieldId;
      if (targetCol !== fieldId) continue;
      if (evaluateColorRule(row, rule)) {
        return resolveColorOutput(rule);
      }
    }
    return null;
  };

  // Switch to alternative views (Feishu Bitable features)
  if (viewType === 'kanban') {
    return (
      <BitableKanbanView
        items={allItems}
        columns={columns}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
        onUpdateCell={onUpdateCell}
        kanbanFieldId={viewConfig?.kanbanFieldId || undefined}
        viewConfig={viewConfig}
      />
    );
  }

  if (viewType === 'gallery') {
    return (
      <BitableGalleryView
        items={allItems}
        columns={columns}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
        coverFieldId={viewConfig?.galleryCoverFieldId || undefined}
        onOpenAttachment={onOpenAttachment}
        viewConfig={viewConfig}
      />
    );
  }

  if (viewType === 'gantt') {
    return (
      <BitableGanttView
        items={allItems}
        columns={columns}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
        stageFieldId={viewConfig?.ganttStageFieldId || undefined}
        viewConfig={viewConfig}
      />
    );
  }

  if (viewType === 'calendar') {
    return (
      <BitableCalendarView
        items={allItems}
        columns={columns}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
        viewConfig={viewConfig}
      />
    );
  }

  if (viewType === 'form') {
    return (
      <BitableFormView
        items={allItems}
        columns={columns}
        viewConfig={viewConfig}
      />
    );
  }

  // Check if group section is hidden by any collapsed ancestor
  const isSectionVisible = (group: any): boolean => {
    let p = group.parentKey;
    while (p) {
      if (collapsedGroups[p]) return false;
      const lastIdx = p.lastIndexOf('__');
      if (lastIdx > 0) {
        p = p.substring(0, lastIdx);
      } else {
        break;
      }
    }
    return true;
  };

  // —— 父子记录（视图配置开启后生效）：按「父级字段」的值匹配父记录主键建立层级 ——
  const pcEnabled = !!(viewConfig?.parentChildEnabled && viewConfig?.parentFieldId);
  const primaryFieldId = visibleColumns[0]?.id; // 主键列（通常为图号/编号/文件编号）

  const buildHierarchy = (items: T[]): { row: T; depth: number; hasChildren: boolean }[] => {
    if (!pcEnabled) return items.map((row) => ({ row, depth: 0, hasChildren: false }));
    const fieldId = viewConfig!.parentFieldId!;
    const keySet = new Set<string>();
    items.forEach((r) => {
      const byId = String((r as any).id ?? '').trim();
      const byPrimary = primaryFieldId ? String((r as any)[primaryFieldId] ?? '').trim() : '';
      if (byId) keySet.add(byId);
      if (byPrimary) keySet.add(byPrimary);
    });

    const childrenMap = new Map<string, T[]>();
    const roots: T[] = [];
    items.forEach((r) => {
      const parentRef = String((r as any)[fieldId] ?? '').trim();
      const selfKey = String((r as any).id ?? '').trim();
      const selfPrimary = primaryFieldId ? String((r as any)[primaryFieldId] ?? '').trim() : '';
      // 父级写成了自己（或指向不存在的记录）时按顶层处理，避免整棵树丢失
      if (parentRef && parentRef !== selfKey && parentRef !== selfPrimary && keySet.has(parentRef)) {
        const arr = childrenMap.get(parentRef) || [];
        arr.push(r);
        childrenMap.set(parentRef, arr);
      } else {
        roots.push(r);
      }
    });

    const out: { row: T; depth: number; hasChildren: boolean }[] = [];
    // 层级成环（所有行互为子记录）时兜底为平铺，避免整个表格空白
    if (roots.length === 0 && items.length > 0) {
      return items.map((row) => ({ row, depth: 0, hasChildren: false }));
    }
    const walk = (rows: T[], depth: number) => {
      rows.forEach((r) => {
        const byId = String((r as any).id ?? '').trim();
        const byPrimary = primaryFieldId ? String((r as any)[primaryFieldId] ?? '').trim() : '';
        const kids = childrenMap.get(byId) || childrenMap.get(byPrimary) || [];
        out.push({ row: r, depth, hasChildren: kids.length > 0 });
        if (kids.length > 0 && !collapsedRows[r.id]) walk(kids, depth + 1);
      });
    };
    walk(roots, 0);
    return out;
  };

  // —— Excel 式行选择：Ctrl+点击 = 切换该行勾选；Shift+点击 = 锚点行到当前行的范围勾选 ——
  // 范围作用于复选框勾选集（onSelectRows），锚点在 handleRowClick/handleCheckboxClick 中维护。

  // 当前可见行的渲染顺序（跳过被分组折叠/父子折叠隐藏的行），Shift 范围按此顺序取区间
  const visibleRowIdList: string[] = [];
  groupedData.forEach((g) => {
    if (!isSectionVisible(g)) return;
    if (collapsedGroups[g.groupKey]) return;
    buildHierarchy(g.items).forEach((h) => visibleRowIdList.push(h.row.id));
  });

  /** Shift+点击：选中锚点行到当前行的可见区间。成功返回 true（已处理），否则退化为普通点击 */
  const shiftRangeSelect = (row: T, e: React.MouseEvent): boolean => {
    if (!e.shiftKey) return false;
    const anchorId = anchorRowIdRef.current;
    const targetIdx = visibleRowIdList.indexOf(row.id);
    const anchorIdx = anchorId ? visibleRowIdList.indexOf(anchorId) : -1;
    if (targetIdx < 0 || anchorIdx < 0 || !onSelectRows) return false;
    e.preventDefault();
    const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    onSelectRows(visibleRowIdList.slice(from, to + 1));
    return true;
  };

  /** 行体点击：Shift=范围勾选；Ctrl/Cmd=切换该行勾选；普通=单行高亮（原有行为） */
  const handleRowClick = (row: T, e: React.MouseEvent) => {
    if (shiftRangeSelect(row, e)) {
      anchorRowIdRef.current = row.id;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      onToggleCheck(row.id, e);
    } else {
      onSelectRow?.(row);
    }
    anchorRowIdRef.current = row.id;
  };

  /** 复选框点击：Shift=范围勾选；其余为原有单个切换 */
  const handleCheckboxClick = (row: T, e: React.MouseEvent) => {
    if (!shiftRangeSelect(row, e)) {
      onToggleCheck(row.id, e);
    }
    anchorRowIdRef.current = row.id;
  };

  return (
    <div
      className={`w-full overflow-auto bg-white border border-slate-200 rounded-lg shadow-2xs select-none ${
        fillHeight ? 'h-full min-h-0' : 'max-h-[calc(100vh-215px)]'
      }`}
    >
      {/* border-separate + spacing-0：border-collapse 下 sticky thead 在横向滚动后会丢失吸顶 */}
      <table ref={tableRef} className="w-full text-left border-separate border-spacing-0 min-w-full">
        {/* Table Header（每个 th 自己 sticky top，才能与左侧冻结列的 left 叠加生效） */}
        <thead className="bg-slate-100 text-slate-700 text-[11.5px] font-semibold border-b border-slate-300 uppercase tracking-wider sticky top-0 z-30">
          <tr className="h-8">
            {/* Checkbox column */}
            <th className="w-9 px-2 text-center border-r border-slate-200 shrink-0 sticky left-0 z-40 bg-slate-100"
              style={{ width: 36, minWidth: 36 }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
              />
            </th>

            {/* Row Number */}
            <th className="w-10 px-1 text-center border-r border-slate-200 text-slate-400 font-mono text-[10.5px] sticky left-[36px] z-40 bg-slate-100"
              style={{ width: 40, minWidth: 40 }}>
              #
            </th>

            {/* Dynamic visible columns */}
            {visibleColumns.map((col) => {
              const isEditing = editingColId === col.id;
              // 表头锁图标 / 解锁按钮只反映「显式锁定」，不能把 editable:false（单元格只读）也算成锁定，
              // 否则点解锁后图标永远是 lock（主键、图名、版本等系统字段都中招）。
              const isFieldLocked = !!col.isLocked;
              // 锁图标三态（2026-10-29 用户定稿）：
              // 灰 = 未锁定（可点击锁定）；黄 = 普通锁定（可解锁编辑）；
              // 红 = 后端固定字段（识别来源），列定义受保护、不可解锁。
              const isLockProtected = isFieldLocked && !!isLockProtectedColumn?.(col.id);
              // 改名入口只看显式锁定，与字段配置弹层一致；单元格能否编辑由 EditableCell 自行判定
              // 后台字段（附件 / 按钮列）也允许改名：label 只影响表头文字，render 仍按 id 绑定
              const isFieldRenamable = !col.isLocked;
              const frozenLeft = frozenLeftMap[col.id];
              const isFrozenCol = frozenLeft !== undefined;

              return (
                <th
                  key={col.id}
                  data-col-id={col.id}
                  draggable={!!onReorderColumns && !isEditing}
                  onDragStart={(e) => {
                    if (!onReorderColumns) return;
                    dragColIdRef.current = col.id;
                    setDragColId(col.id);
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox 需要写入数据才会真正启动拖拽
                    e.dataTransfer.setData('text/plain', col.id);
                  }}
                  onDragOver={(e) => {
                    if (!onReorderColumns || !dragColIdRef.current || dragColIdRef.current === col.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverColId !== col.id) setDragOverColId(col.id);
                  }}
                  onDragLeave={() => {
                    setDragOverColId((prev) => (prev === col.id ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragId = dragColIdRef.current;
                    if (onReorderColumns && dragId && dragId !== col.id) {
                      onReorderColumns(dragId, col.id);
                    }
                    dragColIdRef.current = null;
                    setDragColId(null);
                    setDragOverColId(null);
                  }}
                  onDragEnd={() => {
                    dragColIdRef.current = null;
                    setDragColId(null);
                    setDragOverColId(null);
                  }}
                  title={onReorderColumns ? '按住表头可左右拖动，调整列顺序' : undefined}
                  className={`relative border-r border-slate-200 whitespace-nowrap text-slate-700 font-medium group/col bg-slate-100 ${
                    isFrozenCol ? 'sticky z-40' : ''
                  } ${col.id === lastFrozenId ? 'shadow-[1px_0_0_0_#cbd5e1]' : ''} ${
                    isEditing ? 'px-1.5 bg-blue-50/70' : 'px-1.5'
                  } ${onReorderColumns ? 'cursor-grab active:cursor-grabbing' : ''} ${
                    dragColId === col.id ? 'opacity-40' : ''
                  } ${
                    dragOverColId === col.id
                      ? 'bg-blue-50/70 shadow-[inset_2px_0_0_0_#005BAC]'
                      : ''
                  }`}
                  style={{
                    width: effectiveWidth(col),
                    minWidth: effectiveMinWidth(col),
                    ...(isFrozenCol ? { left: frozenLeft } : {})
                  }}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingColLabel}
                        onChange={(e) => setEditingColLabel(e.target.value)}
                        onBlur={() => handleSaveRename(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(col.id);
                          if (e.key === 'Escape') setEditingColId(null);
                        }}
                        autoFocus
                        placeholder="字段名称"
                        className="h-6 px-1.5 text-[11px] font-semibold text-slate-900 bg-white border border-[#005BAC] rounded shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#005BAC] w-full min-w-[70px]"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSaveRename(col.id);
                        }}
                        className="p-0.5 rounded text-emerald-600 hover:bg-emerald-100 cursor-pointer flex items-center justify-center shrink-0"
                        title="保存名称"
                      >
                        <span className="material-symbols-outlined text-[13px] leading-none">check</span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditingColId(null);
                        }}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center shrink-0"
                        title="取消"
                      >
                        <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-0.5 truncate min-w-0">
                        <span
                          className={`truncate select-none ${
                            isFieldRenamable && onRenameColumn
                              ? 'cursor-pointer hover:text-[#005BAC] transition-colors'
                              : ''
                          }`}
                          title={
                            isFieldLocked
                              ? '已锁定受控字段（不可改名称，也无法改表内数据），可在“字段配置”中解锁'
                              : isFieldRenamable && onRenameColumn
                              ? `双击或点击笔符号修改字段名称${col.editable ? '' : '（该字段内容为只读）'}`
                              : '此字段不可改名'
                          }
                          onDoubleClick={(e) => {
                            if (isFieldRenamable) {
                              e.stopPropagation();
                              handleStartRename(col);
                            }
                          }}
                        >
                          {col.label}
                        </span>

                        {isFieldLocked && col.type !== 'action' && !onToggleColumnLock && (
                          <span
                            className={`material-symbols-outlined text-[10px] shrink-0 ${
                              isLockProtected ? 'text-red-600/80' : 'text-amber-600/80'
                            }`}
                            title={isLockProtected ? '系统固定字段（识别来源），列定义受保护，不可解锁' : '已锁定受控（只读保护）'}
                          >
                            lock
                          </span>
                        )}

                        {onToggleColumnLock && col.type !== 'action' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleColumnLock(col.id);
                            }}
                            className={`p-0.5 rounded cursor-pointer transition-colors flex items-center justify-center shrink-0 ${
                              isLockProtected
                                ? 'text-red-600 hover:bg-red-50'
                                : isFieldLocked
                                ? 'text-amber-600 hover:bg-amber-100'
                                : 'text-slate-300 hover:text-slate-600 hover:bg-slate-200/60 opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100'
                            }`}
                            title={
                              isLockProtected
                                ? '系统固定字段（识别来源），列定义受保护，不可解锁，也不可修改表中数据'
                                : isFieldLocked
                                ? '该字段【已锁定】（受控只读，禁止修改表中数据）。点击即可解锁'
                                : '该字段【未锁定】。点击即可锁定保护此字段'
                            }
                          >
                            <span className="material-symbols-outlined text-[10px] leading-none">
                              {isFieldLocked ? 'lock' : 'lock_open'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* 改名铅笔：只看显式锁定（主键、系统只读字段也可改名） */}
                      {isFieldRenamable && onRenameColumn && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(col);
                          }}
                          className="p-0.5 -mr-1 rounded cursor-pointer transition-all flex items-center justify-center shrink-0 text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100"
                          title={col.editable ? '点击修改字段名称（表中内容亦可修改）' : '点击修改字段名称（该字段内容为只读）'}
                        >
                          <span className="material-symbols-outlined text-[11px] leading-none">
                            edit
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 列宽拖拽边线 */}
                  {onResizeColumn && (
                    <span
                      onMouseDown={(e) => {
                        const th = e.currentTarget.parentElement as HTMLElement | null;
                        beginResize(e, col.id, th ? th.getBoundingClientRect().width : 140);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 -right-[3px] z-10 flex h-full w-1.5 cursor-col-resize items-center justify-center group/resize"
                      title="拖动边线调整列宽"
                    >
                      <span
                        className={`h-full w-px transition-colors ${
                          resizing?.id === col.id
                            ? 'bg-[#005BAC]'
                            : 'bg-transparent group-hover/resize:bg-[#005BAC]/60'
                        }`}
                      />
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Table Body with Groups */}
        <tbody className="divide-y divide-slate-200 text-slate-800">
          {allItems.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length + 2}
                className="py-12 text-center text-slate-400 text-[12.5px]"
              >
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[28px] text-slate-300">search_off</span>
                  <span>{emptyText}</span>
                  <span className="text-[11px] text-slate-400">请尝试清除部分筛选条件或切换其他业务视图</span>
                </div>
              </td>
            </tr>
          ) : (
            groupedData.map((group) => {
              if (!isSectionVisible(group)) return null;

              const isCollapsed = !!collapsedGroups[group.groupKey];
              const isDefaultAllGroup = group.groupKey === '__ALL__';
              const level = (group as any).level || 0;
              const fieldLabel = (group as any).fieldLabel;
              const groupVal = (group as any).groupValue || group.groupTitle;
              const isLeaf = (group as any).isLeaf !== false;

              // Shading by level
              const levelBg =
                level === 0
                  ? 'bg-slate-100/90 font-bold border-slate-300/80 text-slate-900'
                  : level === 1
                  ? 'bg-slate-50/90 font-semibold border-slate-200 text-slate-800'
                  : 'bg-white/95 font-medium border-slate-200 text-slate-700';

              return (
                <React.Fragment key={group.groupKey}>
                  {/* Group header bar (if grouping is active) */}
                  {!isDefaultAllGroup && (
                    <tr
                      onClick={() => toggleGroupCollapse(group.groupKey)}
                      className={`${levelBg} hover:bg-slate-200/60 cursor-pointer transition-colors border-y text-[12px] select-none`}
                    >
                      <td
                        colSpan={visibleColumns.length + 2}
                        className="py-1.5 pr-3"
                        style={{ paddingLeft: `${10 + level * 22}px` }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-slate-500 transition-transform">
                            {isCollapsed ? 'chevron_right' : 'expand_more'}
                          </span>
                          {fieldLabel && (
                            <span className="px-1.5 py-0.2 bg-white text-slate-500 text-[10.5px] rounded border border-slate-200 font-sans font-normal shadow-2xs">
                              {fieldLabel}
                            </span>
                          )}
                          <span className="text-slate-900 font-bold">{groupVal}</span>
                          <span className="px-1.5 py-0.2 bg-white text-slate-600 text-[11px] font-mono rounded-full border border-slate-200 shadow-2xs">
                            {group.items.length} 项
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Group Rows (only if leaf group and not collapsed) */}
                  {isLeaf &&
                    !isCollapsed &&
                    buildHierarchy(group.items).map((h, index) => {
                      const row = h.row;
                      const depth = h.depth;
                      const hasChildren = h.hasChildren;
                      const isSelected = selectedRowId === row.id;
                      const isChecked = !!checkedIds[row.id];
                      const rowColorStyle = getRowColorStyle(row);

                      return (
                        <tr
                          key={row.id}
                          data-row-id={row.id}
                          onClick={(e) => handleRowClick(row, e)}
                          onContextMenu={(e) => openCtxMenu(e, row.id)}
                          onDragOver={(e) => {
                            const dragId = dragRowIdRef.current;
                            if (!onMoveRow || !dragId || dragId === row.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const ratio =
                              rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
                            const position: 'before' | 'after' | 'child' =
                              ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'child';
                            setDropHint((prev) =>
                              prev && prev.rowId === row.id && prev.position === position
                                ? prev
                                : { rowId: row.id, position }
                            );
                          }}
                          onDragLeave={(e) => {
                            const related = e.relatedTarget as Node | null;
                            if (related && (e.currentTarget as Node).contains(related)) return;
                            setDropHint((prev) => (prev && prev.rowId === row.id ? null : prev));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const dragId = dragRowIdRef.current;
                            const position =
                              dropHint && dropHint.rowId === row.id ? dropHint.position : 'after';
                            if (onMoveRow && dragId && dragId !== row.id) {
                              onMoveRow(dragId, row.id, position);
                            }
                            dragRowIdRef.current = null;
                            setDragRowId(null);
                            setDropHint(null);
                          }}
                          className={`cursor-pointer transition-colors group relative z-0 ${rowHeightClass} ${
                            fillTargetSet.has(row.id) ? 'fill-target' : ''
                          } ${
                            dragRowId === row.id ? 'opacity-40' : ''
                          } ${
                            rowColorStyle?.className
                              ? rowColorStyle.className
                              : isSelected || isChecked
                              ? 'bg-blue-50 font-medium'
                              : index % 2 === 1
                              ? 'bg-slate-50 hover:bg-slate-100'
                              : 'bg-white hover:bg-slate-100'
                          }`}
                          style={
                            rowColorStyle?.style
                              ? { ...rowColorStyle.style }
                              : undefined
                          }
                        >
                          {/* Checkbox */}
                          <td
                            className="px-2 text-center border-r border-slate-200 whitespace-nowrap sticky left-0 z-10 bg-inherit"
                            style={{ width: 36, minWidth: 36, boxShadow: selectionOutline(isSelected, true, false) }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => handleCheckboxClick(row, e)}
                              onChange={() => {}}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
                            />
                          </td>

                          {/* 行号 / 拖动把手 / 删除 */}
                          <td
                            className="px-0 text-center border-r border-slate-200 font-mono text-[10.5px] text-slate-400 relative sticky left-[36px] z-10 bg-inherit"
                            style={{
                              width: 40,
                              minWidth: 40,
                              boxShadow: selectionOutline(isSelected, false, visibleColumns.length === 0)
                            }}
                          >
                            {dropHint?.rowId === row.id && dropHint.position === 'child' ? (
                              <span className="block text-[#005BAC] font-bold leading-none">⤷</span>
                            ) : (
                              <span
                                className={`block leading-none ${
                                  onMoveRow || onDeleteRow ? 'group-hover:hidden' : ''
                                } ${dragRowId === row.id ? 'hidden' : ''}`}
                              >
                                {index + 1}
                              </span>
                            )}

                            {(onMoveRow || onDeleteRow) && (
                              <div
                                className={`${
                                  dragRowId === row.id ? 'flex' : 'hidden group-hover:flex'
                                } absolute inset-0 items-center justify-center`}
                              >
                                {onMoveRow && (
                                  <span
                                    draggable
                                    onDragStart={(e) => {
                                      dragRowIdRef.current = row.id;
                                      setDragRowId(row.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', row.id);
                                    }}
                                    onDragEnd={() => {
                                      dragRowIdRef.current = null;
                                      setDragRowId(null);
                                      setDropHint(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-4 h-full flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-[#005BAC]"
                                    title="按住上下拖动：调整行顺序；拖到行中部可成为该行的子记录"
                                  >
                                    <span className="material-symbols-outlined text-[14px] leading-none">
                                      drag_indicator
                                    </span>
                                  </span>
                                )}
                                {onDeleteRow && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rowLabel =
                                        (row as any).code || (row as any).title || `第 ${index + 1} 行`;
                                      if (window.confirm(`确定删除记录【${rowLabel}】？`)) {
                                        onDeleteRow(row.id);
                                      }
                                    }}
                                    className="w-4 h-full flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                    title={`删除第 ${index + 1} 行记录`}
                                  >
                                    <span className="material-symbols-outlined text-[13px] leading-none">
                                      delete
                                    </span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Columns */}
                          {visibleColumns.map((col, colIndex) => {
                            const val = (row as any)[col.id];
                            const cellColorStyle = getCellColorStyle(row, col.id);
                            const isFirstCol = colIndex === 0 && pcEnabled;
                            const frozenLeft = frozenLeftMap[col.id];
                            const isFrozenCol = frozenLeft !== undefined;
                            const outline = selectionOutline(
                              isSelected,
                              false,
                              colIndex === visibleColumns.length - 1
                            );
                            const frozenEdge = isFrozenCol && col.id === lastFrozenId;

                            return (
                              <td
                                key={col.id}
                                className={`group/cell px-1.5 border-r border-slate-200 whitespace-nowrap overflow-hidden transition-colors ${
                                  isFrozenCol ? 'sticky z-10' : 'relative'
                                } ${cellColorStyle?.className || (isFrozenCol ? 'bg-inherit' : '')}`}
                                style={{
                                  width: effectiveWidth(col),
                                  minWidth: effectiveMinWidth(col),
                                  paddingLeft: isFirstCol ? `${8 + depth * 18}px` : undefined,
                                  ...(cellColorStyle?.style || {}),
                                  ...(isFrozenCol ? { left: frozenLeft } : {}),
                                  boxShadow:
                                    [outline, frozenEdge ? '1px 0 0 0 #cbd5e1' : '']
                                      .filter(Boolean)
                                      .join(', ') || undefined
                                }}
                              >
                                {isFirstCol ? (
                                  <div className="flex items-center min-w-0">
                                    {hasChildren ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCollapsedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                                        }}
                                        className="w-4 h-4 -ml-1 mr-0.5 shrink-0 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                                        title={collapsedRows[row.id] ? '展开子记录' : '折叠子记录'}
                                      >
                                        <span className="material-symbols-outlined text-[15px] leading-none">
                                          {collapsedRows[row.id] ? 'chevron_right' : 'expand_more'}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="w-4 shrink-0" />
                                    )}
                                    <EditableCell
                                      column={col}
                                      row={row}
                                      value={val}
                                      highlightStyle={cellColorStyle}
                                      onUpdate={(newVal) => onUpdateCell(row.id, col.id, newVal)}
                                    />
                                  </div>
                                ) : (
                                  <EditableCell
                                    column={col}
                                    row={row}
                                    value={val}
                                    highlightStyle={cellColorStyle}
                                    onUpdate={(newVal) => onUpdateCell(row.id, col.id, newVal)}
                                  />
                                )}

                                {/* 拖拽填充手柄：悬停单元格时出现在右下角 */}
                                {canFillColumn(col) && (
                                  <span
                                    onMouseDown={(e) => beginFill(e, row, col)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute bottom-0 right-0 z-20 w-2 h-2 rounded-[1px] bg-[#005BAC] border border-white cursor-crosshair opacity-0 pointer-events-none group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto transition-opacity"
                                    title="按住上下拖动：按规律递增 / 复制填充（按住 Shift 只复制；Ctrl+Z 可撤销）"
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>

      {/* 拖拽填充预览提示：跟随目标区间底部，显示行数与末行结果 */}
      {fillDrag && (
        <div
          style={{
            position: 'fixed',
            left: fillDrag.chip.x,
            top: fillDrag.chip.y,
            zIndex: 9999
          }}
          className="pointer-events-none px-1.5 py-0.5 rounded bg-[#005BAC] text-white text-[10.5px] font-medium shadow-lg whitespace-nowrap"
        >
          {fillDrag.label}
        </div>
      )}

      {/* 行右键菜单：插入 / 复制 / 层级 / 删除 */}
      {ctxMenu &&
        (() => {
          const ctxRow = allItems.find((item) => item.id === ctxMenu.rowId);
          if (!ctxRow) return null;
          const parentFieldId = viewConfig?.parentChildEnabled ? viewConfig?.parentFieldId : null;
          const hasParent =
            !!parentFieldId && String((ctxRow as any)[parentFieldId] ?? '').trim() !== '';
          return (
            <div
              className="fixed z-[90] w-56 py-1 bg-white border border-slate-200 rounded-md shadow-xl text-[12px] select-none"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="px-2.5 py-1 text-[10.5px] text-slate-400 truncate border-b border-slate-100 mb-0.5">
                {(ctxRow as any).code || (ctxRow as any).title || '当前记录'}
              </div>
              {onInsertRow &&
                ctxMenuItem('arrow_upward', '向上插入记录', () =>
                  onInsertRow(ctxMenu.rowId, 'above')
                )}
              {onInsertRow &&
                ctxMenuItem('arrow_downward', '向下插入记录', () =>
                  onInsertRow(ctxMenu.rowId, 'below')
                )}
              {onInsertRow &&
                ctxMenuItem('account_tree', '插入子记录', () =>
                  onInsertRow(ctxMenu.rowId, 'child')
                )}
              {(onInsertRow || onDuplicateRow) && (
                <div className="my-1 border-t border-slate-100" />
              )}
              {onDuplicateRow &&
                ctxMenuItem('content_copy', '复制记录', () => onDuplicateRow(ctxMenu.rowId))}
              {hasParent &&
                onDetachRow &&
                ctxMenuItem('format_indent_decrease', '移出父级层级', () =>
                  onDetachRow(ctxMenu.rowId)
                )}
              {onDeleteRow && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  {ctxMenuItem(
                    'delete',
                    '删除记录',
                    () => {
                      const rowLabel =
                        (ctxRow as any).code || (ctxRow as any).title || '当前记录';
                      if (window.confirm(`确定删除记录【${rowLabel}】？`)) {
                        onDeleteRow(ctxMenu.rowId);
                      }
                    },
                    'danger'
                  )}
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
};
