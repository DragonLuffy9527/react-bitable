import React, { useState, useMemo } from 'react';
import {
  BitableColumnConfig,
  BitableFieldType,
  BitableSelectOption,
  BITABLE_FIELD_TYPE_META
} from './types';

interface BitableFieldConfigPopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  onToggleVisibility: (colId: string) => void;
  onMoveColumn: (dragIndex: number, hoverIndex: number) => void;
  onAddCustomColumn: (col: Omit<BitableColumnConfig<T>, 'visible'>) => void;
  onRenameColumn?: (colId: string, newLabel: string) => void;
  onDeleteColumn?: (colId: string) => void;
  onToggleColumnLock?: (colId: string) => void;
  onToggleColumnFreeze?: (colId: string) => void;
  onUpdateColumnType?: (colId: string, newType: BitableFieldType, options?: BitableSelectOption[]) => void;
  onResetColumns?: () => void;
  onClose: () => void;
}

export const BitableFieldConfigPopover = <T,>({
  columns,
  onToggleVisibility,
  onMoveColumn,
  onAddCustomColumn,
  onRenameColumn,
  onDeleteColumn,
  onToggleColumnLock,
  onToggleColumnFreeze,
  onUpdateColumnType,
  onResetColumns,
  onClose
}: BitableFieldConfigPopoverProps<T>) => {
  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Add field form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<BitableFieldType>('text');
  const [newFieldOptionsRaw, setNewFieldOptionsRaw] = useState('选项A, 选项B, 选项C');
  const [newFieldIsLocked, setNewFieldIsLocked] = useState(false);

  // Rename inline state
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setNewEditingColName] = useState<string>('');

  // Delete confirmation state
  const [confirmDeleteColId, setConfirmDeleteColId] = useState<string | null>(null);

  // Type change menu popover state
  const [activeTypeMenuColId, setActiveTypeMenuColId] = useState<string | null>(null);

  // Options edit modal state
  const [optionsEditingColId, setOptionsEditingColId] = useState<string | null>(null);
  const [optionsEditingRaw, setOptionsEditingRaw] = useState<string>('');

  // Filter columns by search query
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;
    const query = searchQuery.trim().toLowerCase();
    return columns.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query) ||
        (BITABLE_FIELD_TYPE_META[c.type]?.label || '').includes(query)
    );
  }, [columns, searchQuery]);

  const visibleCount = columns.filter((c) => c.visible).length;

  // Handle batch visibility
  const handleToggleAll = (showAll: boolean) => {
    columns.forEach((col) => {
      if (col.visible !== showAll) {
        onToggleVisibility(col.id);
      }
    });
  };

  const handleStartRename = (col: BitableColumnConfig<T>) => {
    if (col.type === 'action' || !onRenameColumn || col.isLocked || col.id === 'code') return;
    setEditingColId(col.id);
    setNewEditingColName(col.label);
    setConfirmDeleteColId(null);
    setActiveTypeMenuColId(null);
  };

  const handleSaveRename = (colId: string) => {
    const trimmed = editingColName.trim();
    if (trimmed && onRenameColumn) {
      onRenameColumn(colId, trimmed);
    }
    setEditingColId(null);
  };

  const parseSelectOptions = (raw: string): BitableSelectOption[] => {
    const palette = [
      'bg-blue-50 text-[#005BAC] border-blue-200',
      'bg-emerald-50 text-emerald-700 border-emerald-200',
      'bg-purple-50 text-purple-700 border-purple-200',
      'bg-amber-50 text-amber-700 border-amber-200',
      'bg-cyan-50 text-cyan-700 border-cyan-200',
      'bg-rose-50 text-rose-700 border-rose-200'
    ];
    return raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((item, idx) => ({
        label: item,
        value: item,
        color: palette[idx % palette.length]
      }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFieldName.trim();
    if (!trimmed) return;

    const fieldId = `custom_${Date.now()}`;
    const parsedOptions =
      newFieldType === 'select' ? parseSelectOptions(newFieldOptionsRaw) : undefined;

    onAddCustomColumn({
      id: fieldId,
      label: trimmed,
      type: newFieldType,
      minWidth: newFieldType === 'date' ? '120px' : newFieldType === 'number' ? '100px' : '140px',
      editable: !newFieldIsLocked,
      isLocked: newFieldIsLocked,
      sortable: true,
      filterable: true,
      options: parsedOptions
    });

    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldOptionsRaw('选项A, 选项B, 选项C');
    setNewFieldIsLocked(false);
    setShowAddForm(false);
  };

  const handleSaveOptions = (colId: string) => {
    const parsed = parseSelectOptions(optionsEditingRaw);
    if (onUpdateColumnType && parsed.length > 0) {
      onUpdateColumnType(colId, 'select', parsed);
    }
    setOptionsEditingColId(null);
  };

  const availableFieldTypes: BitableFieldType[] = [
    'text',
    'number',
    'select',
    'date',
    'boolean',
    'badge'
  ];

  return (
    <div className="absolute left-0 top-full mt-1.5 w-[560px] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-3.5 select-none text-slate-800 text-[12px] animate-in fade-in zoom-in-95 duration-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-[#005BAC] flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[16px]">tune</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[13px]">
              <span>字段配置 (多维表)</span>
              <span className="text-[11px] font-normal text-slate-500">
                ({visibleCount}/{columns.length} 显示中)
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100 cursor-pointer transition-colors"
          title="关闭"
        >
          <span className="material-symbols-outlined text-[16px] block">close</span>
        </button>
      </div>

      {/* Feature Guide Banner */}
      <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[15px] text-amber-700 shrink-0">
            security
          </span>
          <span className="text-[11px] text-amber-900 truncate">
            <strong>操作提示：</strong>点击 <span className="font-semibold text-amber-800">🔒</span> 切换锁定保护，点击 <span className="font-semibold text-[#005BAC]">📌</span> 冻结固定，点击 <span className="font-semibold text-slate-700">✎</span> 重命名，点击 <span className="font-semibold text-rose-600">🗑️</span> 删除
          </span>
        </div>
      </div>

      {/* Search & Batch Actions */}
      <div className="py-2 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-[15px] text-slate-400 absolute left-2 top-1.5 pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索字段名称或类型..."
            className="w-full h-7 pl-7 pr-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#005BAC] focus:border-[#005BAC] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">cancel</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleToggleAll(true)}
            className="h-7 px-2 text-[11px] text-slate-600 hover:text-[#005BAC] hover:bg-blue-50 rounded border border-slate-200 cursor-pointer transition-colors"
            title="全部勾选显示"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => handleToggleAll(false)}
            className="h-7 px-2 text-[11px] text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded border border-slate-200 cursor-pointer transition-colors"
            title="全部取消显示"
          >
            全隐
          </button>
        </div>
      </div>

      {/* Field Table Header */}
      <div className="flex items-center px-2 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-200/80 mt-1 mb-1 bg-slate-50/80 rounded-md">
        <div className="w-8 shrink-0 text-center">显示</div>
        <div className="flex-1 min-w-0 pl-1.5">字段名称</div>
        <div className="w-28 shrink-0 text-center">类型与选项</div>
        <div className="w-[172px] shrink-0 flex items-center justify-end gap-1">
          <div className="w-7 text-center shrink-0" title="锁定状态保护">锁定</div>
          <div className="w-7 text-center shrink-0" title="冻结固定列">冻结</div>
          <div className="w-7 text-center shrink-0" title="修改字段名称">改名</div>
          <div className="w-7 text-center shrink-0" title="删除字段">删除</div>
          <div className="w-11 text-center shrink-0" title="调整字段排序">排序</div>
        </div>
      </div>

      {/* Field List */}
      <div className="max-h-72 overflow-y-auto space-y-1 py-1 pr-0.5">
        {filteredColumns.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-[11.5px]">未找到符合条件的字段</div>
        ) : (
          filteredColumns.map((col) => {
            const originalIndex = columns.findIndex((c) => c.id === col.id);
            const isEditing = editingColId === col.id;
            const isDeleting = confirmDeleteColId === col.id;
            const isLocked = !!col.isLocked || !col.editable;
            const typeMeta = BITABLE_FIELD_TYPE_META[col.type] || BITABLE_FIELD_TYPE_META.text;
            const isPrimary = col.id === 'code';
            const isAction = col.type === 'action';
            const canDelete = !isAction && !isPrimary;

            return (
              <div
                key={col.id}
                className={`relative flex items-center justify-between px-2 py-1 rounded-lg border transition-all h-9 group ${
                  col.visible
                    ? 'bg-white hover:bg-slate-50/80 border-slate-100 hover:border-slate-200 shadow-2xs'
                    : 'bg-slate-50/60 border-dashed border-slate-200 opacity-60 hover:opacity-90'
                }`}
              >
                {/* 1. Inline Delete Confirmation View */}
                {isDeleting ? (
                  <div className="flex items-center justify-between w-full py-0.5 animate-in fade-in duration-100">
                    <span className="text-[11px] text-rose-600 font-medium truncate">
                      确定删除字段【{col.label}】？
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteColumn?.(col.id);
                          setConfirmDeleteColId(null);
                        }}
                        className="px-2.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-medium cursor-pointer transition-colors"
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteColId(null)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px] cursor-pointer transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : isEditing ? (
                  /* 2. Inline Rename Input View */
                  <div
                    className="flex items-center gap-1.5 w-full py-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingColName}
                      onChange={(e) => setNewEditingColName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(col.id);
                        if (e.key === 'Escape') setEditingColId(null);
                      }}
                      autoFocus
                      placeholder="字段名称"
                      className="flex-1 h-6 px-1.5 text-[11.5px] font-medium bg-white border border-[#005BAC] rounded focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(col.id)}
                      className="w-6 h-6 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer flex items-center justify-center transition-colors"
                      title="保存名称"
                    >
                      <span className="material-symbols-outlined text-[14px]">check</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingColId(null)}
                      className="w-6 h-6 rounded text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center transition-colors"
                      title="取消"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ) : (
                  /* 3. Normal Row Display */
                  <>
                    {/* Checkbox */}
                    <div className="w-8 shrink-0 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => onToggleVisibility(col.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-[#005BAC] focus:ring-0 cursor-pointer"
                        title={col.visible ? '点击隐藏该字段' : '点击显示该字段'}
                      />
                    </div>

                    {/* Field Name */}
                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 px-1.5">
                      <span
                        onClick={() => onToggleVisibility(col.id)}
                        className={`truncate cursor-pointer text-[12px] ${
                          col.visible ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'
                        }`}
                        title={col.label}
                      >
                        {col.label}
                      </span>

                      {col.isCustom && (
                        <span className="text-[10px] px-1 py-0.2 bg-blue-50 text-[#005BAC] border border-blue-200 rounded shrink-0 font-normal">
                          自定义
                        </span>
                      )}
                      {isPrimary && (
                        <span className="text-[10px] px-1 py-0.2 bg-slate-100 text-slate-600 border border-slate-200 rounded shrink-0 font-normal">
                          主键
                        </span>
                      )}
                    </div>

                    {/* Type Badge & Quick Dropdown Selector + Options Trigger */}
                    <div className="w-28 shrink-0 flex items-center gap-1">
                      {!isAction ? (
                        <>
                          <div className="relative flex-1 min-w-0">
                            <div
                              className={`h-6 px-1.5 rounded flex items-center justify-between text-[11px] font-medium border transition-colors ${
                                isLocked
                                  ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-80'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-[#005BAC] hover:border-blue-200 cursor-pointer shadow-2xs'
                              }`}
                              title={isLocked ? '已锁定字段不可更改类型，请先解锁' : '点击切换字段类型'}
                            >
                              <div className="flex items-center gap-1 min-w-0 truncate">
                                <span className="material-symbols-outlined text-[13px] leading-none text-slate-500 shrink-0">
                                  {typeMeta.icon}
                                </span>
                                <span className="truncate">{typeMeta.label}</span>
                              </div>
                              {!isLocked && (
                                <span className="material-symbols-outlined text-[12px] leading-none text-slate-400 shrink-0">
                                  expand_more
                                </span>
                              )}
                            </div>

                            {/* Transparent native select overlay for foolproof menu rendering across all containers */}
                            {!isLocked && (
                              <select
                                value={col.type}
                                disabled={isLocked}
                                onChange={(e) => {
                                  const nextType = e.target.value as BitableFieldType;
                                  if (nextType === 'select' && (!col.options || col.options.length === 0)) {
                                    setOptionsEditingColId(col.id);
                                    setOptionsEditingRaw('选项1, 选项2, 选项3');
                                  } else {
                                    onUpdateColumnType?.(col.id, nextType);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[12px]"
                                title="切换字段类型"
                              >
                                {availableFieldTypes.map((typeKey) => (
                                  <option key={typeKey} value={typeKey}>
                                    {BITABLE_FIELD_TYPE_META[typeKey].label} - {BITABLE_FIELD_TYPE_META[typeKey].desc}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Quick Options configuration button for select fields */}
                          {col.type === 'select' && (
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                if (!isLocked) {
                                  setOptionsEditingColId(col.id);
                                  setOptionsEditingRaw(
                                    (col.options && col.options.length > 0)
                                      ? col.options.map((o) => o.label).join(', ')
                                      : '选项1, 选项2, 选项3'
                                  );
                                }
                              }}
                              className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isLocked
                                  ? 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed'
                                  : 'text-[#005BAC] bg-blue-50 hover:bg-blue-100 border-blue-200 cursor-pointer shadow-2xs'
                              }`}
                              title={isLocked ? '字段已锁定，不可编辑选项' : '配置单选项候选项列表'}
                            >
                              <span className="material-symbols-outlined text-[13px]">tune</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="w-full text-center text-[11px] text-slate-400 font-medium">操作列</span>
                      )}
                    </div>

                    {/* Fixed Action Toolbar: 100% strict alignment across all rows */}
                    <div className="w-[172px] shrink-0 flex items-center justify-end gap-1">
                      {/* 1. Lock column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {!isAction && onToggleColumnLock ? (
                          <button
                            type="button"
                            onClick={() => {
                              onToggleColumnLock(col.id);
                              setActiveTypeMenuColId(null);
                            }}
                            className={`w-6 h-6 rounded transition-all cursor-pointer flex items-center justify-center border shrink-0 ${
                              isLocked
                                ? 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100 shadow-2xs font-bold'
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title={
                              isLocked
                                ? '当前【已锁定受控】（只读保护：禁止修改表格内容、禁止重命名与删除）。点击解锁'
                                : '当前【未锁定】（允许行内编辑与修改）。点击锁定保护此字段'
                            }
                          >
                            <span className={`material-symbols-outlined text-[13px] leading-none ${isLocked ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                              {isLocked ? 'lock' : 'lock_open'}
                            </span>
                          </button>
                        ) : (
                          <div className="w-6 h-6" />
                        )}
                      </div>

                      {/* 2. Freeze column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {!isAction && onToggleColumnFreeze ? (
                          <button
                            type="button"
                            onClick={() => {
                              onToggleColumnFreeze(col.id);
                              setActiveTypeMenuColId(null);
                            }}
                            className={`w-6 h-6 rounded transition-all cursor-pointer flex items-center justify-center border shrink-0 ${
                              col.isFrozen
                                ? 'text-[#005BAC] bg-blue-50 border-blue-300 hover:bg-blue-100 shadow-2xs font-bold'
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title={col.isFrozen ? '已冻结固定在左侧。点击取消冻结' : '冻结固定在左侧（横向滚动时不移出可视区）'}
                          >
                            <span className="material-symbols-outlined text-[13px] leading-none">
                              push_pin
                            </span>
                          </button>
                        ) : (
                          <div className="w-6 h-6" />
                        )}
                      </div>

                      {/* 3. Rename column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {!isAction && !isPrimary && onRenameColumn ? (
                          isLocked ? (
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 cursor-not-allowed shrink-0"
                              title="字段已锁定，不可修改名称"
                            >
                              <span className="material-symbols-outlined text-[13px]">edit</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartRename(col)}
                              className="w-6 h-6 rounded text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 transition-all cursor-pointer flex items-center justify-center shrink-0"
                              title="修改字段名称"
                            >
                              <span className="material-symbols-outlined text-[13px]">edit</span>
                            </button>
                          )
                        ) : (
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-200 cursor-not-allowed shrink-0"
                            title={isAction ? '操作列' : '系统主键不可重命名'}
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                          </div>
                        )}
                      </div>

                      {/* 4. Delete column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {canDelete && onDeleteColumn ? (
                          isLocked ? (
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 cursor-not-allowed shrink-0"
                              title="字段已锁定，不可删除，请先解锁"
                            >
                              <span className="material-symbols-outlined text-[13px]">delete</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteColId(col.id);
                                setActiveTypeMenuColId(null);
                              }}
                              className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer flex items-center justify-center transition-colors shrink-0"
                              title="删除此字段"
                            >
                              <span className="material-symbols-outlined text-[13px]">delete</span>
                            </button>
                          )
                        ) : (
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-200 cursor-not-allowed shrink-0"
                            title={isAction ? '操作列不可删除' : '系统核心主键不可删除'}
                          >
                            <span className="material-symbols-outlined text-[13px]">delete</span>
                          </div>
                        )}
                      </div>

                      {/* 5. Up / Down Move Ordering (fixed w-11 slot) */}
                      <div className="w-11 shrink-0 flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          disabled={originalIndex === 0}
                          onClick={() => onMoveColumn(originalIndex, originalIndex - 1)}
                          className="w-5 h-6 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer flex items-center justify-center transition-colors"
                          title="上移"
                        >
                          <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          disabled={originalIndex === columns.length - 1}
                          onClick={() => onMoveColumn(originalIndex, originalIndex + 1)}
                          className="w-5 h-6 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer flex items-center justify-center transition-colors"
                          title="下移"
                        >
                          <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Select Options Inline Editor Dialog */}
      {optionsEditingColId && (
        <div className="mt-2 p-2.5 bg-blue-50/60 rounded-lg border border-blue-200 animate-in fade-in duration-100">
          <div className="flex items-center justify-between pb-1 text-[11.5px] font-semibold text-[#005BAC]">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">tune</span>
              配置下拉选项
            </span>
            <button
              onClick={() => setOptionsEditingColId(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          </div>
          <div className="text-[10.5px] text-slate-500 mb-1.5">用逗号或换行分隔候选项：</div>
          <input
            type="text"
            value={optionsEditingRaw}
            onChange={(e) => setOptionsEditingRaw(e.target.value)}
            placeholder="例如: 建筑, 结构, 给排水, 电气"
            autoFocus
            className="w-full h-7 px-2 text-[11px] bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
          />
          {/* Options Preview */}
          <div className="flex flex-wrap gap-1 mt-1.5 max-h-14 overflow-y-auto">
            {parseSelectOptions(optionsEditingRaw).map((opt, i) => (
              <span
                key={i}
                className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${opt.color}`}
              >
                {opt.label}
              </span>
            ))}
          </div>
          <div className="flex justify-end gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setOptionsEditingColId(null)}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-700 text-[11px] cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleSaveOptions(optionsEditingColId)}
              className="px-2.5 py-0.5 bg-[#005BAC] hover:bg-[#004785] text-white rounded text-[11px] font-medium cursor-pointer"
            >
              保存选项
            </button>
          </div>
        </div>
      )}

      {/* Add New Field Section */}
      <div className="pt-2.5 mt-1 border-t border-slate-100">
        {!showAddForm ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setConfirmDeleteColId(null);
                setActiveTypeMenuColId(null);
                setOptionsEditingColId(null);
              }}
              className="flex-1 h-7.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#005BAC]/40 bg-blue-50/30 text-[#005BAC] hover:bg-blue-50 hover:border-[#005BAC] text-[11.5px] font-medium transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">add_circle</span>
              <span>新建字段</span>
            </button>

            {onResetColumns && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('确定恢复系统默认字段配置？所有自定义增删与顺序将重置。')) {
                    onResetColumns();
                  }
                }}
                className="h-7.5 px-2.5 flex items-center gap-1 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-[11px] cursor-pointer transition-colors shrink-0"
                title="恢复所有默认列并清空自定义字段"
              >
                <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                <span>恢复默认</span>
              </button>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleAddSubmit}
            className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in duration-100"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-[11.5px] flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#005BAC]">add_box</span>
                新建自定义字段
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>

            {/* Field Name */}
            <div>
              <label className="block text-[10.5px] font-medium text-slate-600 mb-1">
                字段名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="例如: 现场复核人 / 质量评分 / 是否深化完成"
                autoFocus
                className="w-full h-7 px-2 text-[11.5px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#005BAC] focus:border-[#005BAC]"
              />
            </div>

            {/* Field Type Selection */}
            <div>
              <label className="block text-[10.5px] font-medium text-slate-600 mb-1">
                字段类型
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {availableFieldTypes.map((typeKey) => {
                  const meta = BITABLE_FIELD_TYPE_META[typeKey];
                  const isSelected = newFieldType === typeKey;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setNewFieldType(typeKey)}
                      className={`h-7 px-2 flex items-center gap-1.5 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-[#005BAC] text-[#005BAC] font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px] leading-none">
                        {meta.icon}
                      </span>
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Select type, show options input */}
            {newFieldType === 'select' && (
              <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-1.5">
                <label className="block text-[10.5px] font-medium text-slate-600">
                  下拉单选项 (以逗号分隔)
                </label>
                <input
                  type="text"
                  value={newFieldOptionsRaw}
                  onChange={(e) => setNewFieldOptionsRaw(e.target.value)}
                  placeholder="例如: 待审核, 已通过, 需修改"
                  className="w-full h-6.5 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                />
                <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                  {parseSelectOptions(newFieldOptionsRaw).map((opt, i) => (
                    <span
                      key={i}
                      className={`text-[9.5px] px-1.5 py-0.2 rounded border font-medium ${opt.color}`}
                    >
                      {opt.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lock Field Switch */}
            <div className="flex items-center justify-between py-1 px-1 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className={`material-symbols-outlined text-[15px] ${newFieldIsLocked ? 'text-amber-600' : 'text-slate-400'}`}>
                  {newFieldIsLocked ? 'lock' : 'lock_open'}
                </span>
                <span className="text-[11px] text-slate-700">创建后立即锁定保护 (受控只读)</span>
              </div>
              <input
                type="checkbox"
                checked={newFieldIsLocked}
                onChange={(e) => setNewFieldIsLocked(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#005BAC] cursor-pointer"
              />
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-[11px] rounded hover:bg-slate-200/60 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!newFieldName.trim()}
                className="px-3.5 py-1 bg-[#005BAC] hover:bg-[#004785] disabled:opacity-50 text-white rounded-md text-[11.5px] font-medium shadow-2xs cursor-pointer transition-colors"
              >
                确认新建
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
