import React, { useRef, useState, useEffect } from 'react';
import {
  BitableColumnConfig,
  BitableColorRule,
  BitableDensity,
  BitableViewType,
  BitableViewConfig,
  BitableGroupSection
} from './types';
import { EditableCell } from './EditableCell';
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
  density: BitableDensity;
  colorRules: BitableColorRule[];
  onUpdateCell: (rowId: string, fieldId: string, value: any) => void;
  onDeleteRow?: (rowId: string) => void;
  onToggleColumnLock?: (columnId: string) => void;
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
}

export const BitableTable = <T extends { id: string }>({
  columns,
  groupedData,
  selectedRowId,
  onSelectRow,
  checkedIds,
  onToggleCheck,
  onToggleSelectAll,
  density,
  colorRules,
  onUpdateCell,
  onDeleteRow,
  onToggleColumnLock,
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
  onOpenAttachment
}: BitableTableProps<T>) => {
  const visibleColumns = columns.filter((c) => c.visible);
  // 父子记录的行折叠状态（置于条件早返回之前，保证 hooks 顺序稳定）
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});

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
      const width = Math.max(80, Math.round(start.startWidth + (e.clientX - start.startX)));
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
    resizing && resizing.id === col.id ? `${resizing.width}px` : col.minWidth || '100px';

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
    if (col.type === 'action' || !onRenameColumn) return;
    // Locked or non-editable fields cannot have their names changed
    if (col.isLocked || (!col.editable && !col.isCustom)) return;
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
  const primaryFieldId = visibleColumns[0]?.id; // 主键列 = 第一个可见字段

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

  return (
    <div className="w-full overflow-x-auto bg-white border border-slate-200 rounded-lg shadow-2xs select-none">
      <table className="w-full text-left border-collapse min-w-full">
        {/* Table Header */}
        <thead className="bg-slate-100 text-slate-700 text-[11.5px] font-semibold border-b border-slate-300 uppercase tracking-wider sticky top-0 z-20">
          <tr className="h-8">
            {/* Checkbox column */}
            <th className="w-9 px-2 text-center border-r border-slate-200 shrink-0">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
              />
            </th>

            {/* Row Number */}
            <th className="w-10 px-1 text-center border-r border-slate-200 text-slate-400 font-mono text-[10.5px]">
              #
            </th>

            {/* Dynamic visible columns */}
            {visibleColumns.map((col) => {
              const isEditing = editingColId === col.id;
              const isFieldLocked = !!col.isLocked || !col.editable;
              // 与 EditableCell 的判定保持完全一致：表头能改名 ⇔ 单元格能编辑
              const isFieldEditable = !!col.editable && col.type !== 'action' && !col.isLocked;

              return (
                <th
                  key={col.id}
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
                  className={`relative border-r border-slate-200 whitespace-nowrap text-slate-700 font-medium group/col ${
                    isEditing ? 'px-1.5 bg-blue-50/70' : 'px-3'
                  } ${onReorderColumns ? 'cursor-grab active:cursor-grabbing' : ''} ${
                    dragColId === col.id ? 'opacity-40' : ''
                  } ${
                    dragOverColId === col.id
                      ? 'bg-blue-50/70 shadow-[inset_2px_0_0_0_#005BAC]'
                      : ''
                  }`}
                  style={{ width: effectiveWidth(col), minWidth: effectiveMinWidth(col) }}
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
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1 truncate min-w-0">
                        <span
                          className={`truncate select-none ${
                            isFieldEditable && onRenameColumn
                              ? 'cursor-pointer hover:text-[#005BAC] transition-colors'
                              : ''
                          }`}
                          title={
                            isFieldEditable && onRenameColumn
                              ? '双击或点击笔符号修改字段名称'
                              : isFieldLocked
                              ? '已锁定受控字段（不可更改名称与表格内容，可在“字段配置”中解锁）'
                              : '管理员配置字段（不可更改名称与表格内容）'
                          }
                          onDoubleClick={(e) => {
                            if (isFieldEditable) {
                              e.stopPropagation();
                              handleStartRename(col);
                            }
                          }}
                        >
                          {col.label}
                        </span>

                        {isFieldLocked && col.type !== 'action' && !onToggleColumnLock && (
                          <span
                            className="material-symbols-outlined text-[12px] text-amber-600/80 shrink-0"
                            title="已锁定受控（只读保护）"
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
                              isFieldLocked
                                ? 'text-amber-600 hover:bg-amber-100'
                                : 'text-slate-300 hover:text-slate-600 hover:bg-slate-200/60 opacity-0 group-hover/col:opacity-100'
                            }`}
                            title={
                              isFieldLocked
                                ? '该字段【已锁定】（受控只读，禁止修改表中数据）。点击即可解锁'
                                : '该字段【未锁定】。点击即可锁定保护此字段'
                            }
                          >
                            <span className="material-symbols-outlined text-[12px] leading-none">
                              {isFieldLocked ? 'lock' : 'lock_open'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Only editable / custom columns display the pencil symbol; admin columns do NOT display any pencil */}
                      {isFieldEditable && onRenameColumn && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(col);
                          }}
                          className="p-0.5 -mr-1 rounded cursor-pointer transition-all flex items-center justify-center shrink-0 text-slate-400 hover:text-[#005BAC] hover:bg-blue-50"
                          title="点击修改字段名称（表中内容亦可修改）"
                        >
                          <span className="material-symbols-outlined text-[12px] leading-none">
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
                          onClick={() => onSelectRow?.(row)}
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
                          className={`cursor-pointer transition-colors group ${rowHeightClass} ${
                            dragRowId === row.id ? 'opacity-40' : ''
                          } ${dropHintClass(row.id)} ${
                            rowColorStyle?.className
                              ? rowColorStyle.className
                              : isSelected
                              ? 'bg-blue-50/70 font-medium'
                              : index % 2 === 1
                              ? 'bg-slate-50/40 hover:bg-slate-100/70'
                              : 'bg-white hover:bg-slate-100/70'
                          }`}
                          style={
                            rowColorStyle?.style
                              ? { ...rowColorStyle.style }
                              : undefined
                          }
                        >
                          {/* Checkbox */}
                          <td
                            className="px-2 text-center border-r border-slate-200 whitespace-nowrap"
                            style={{ boxShadow: selectionOutline(isSelected, true, false) }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => onToggleCheck(row.id, e)}
                              onChange={() => {}}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
                            />
                          </td>

                          {/* 行号 / 拖动把手 / 删除 */}
                          <td
                            className="px-0 text-center border-r border-slate-200 font-mono text-[10.5px] text-slate-400 relative"
                            style={{
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

                            return (
                              <td
                                key={col.id}
                                className={`px-3 border-r border-slate-200 whitespace-nowrap overflow-hidden transition-colors ${
                                  cellColorStyle?.className || ''
                                }`}
                                style={{
                                  width: effectiveWidth(col),
                                  minWidth: effectiveMinWidth(col),
                                  paddingLeft: isFirstCol ? `${8 + depth * 18}px` : undefined,
                                  ...(cellColorStyle?.style || {}),
                                  boxShadow: selectionOutline(
                                    isSelected,
                                    false,
                                    colIndex === visibleColumns.length - 1
                                  )
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
