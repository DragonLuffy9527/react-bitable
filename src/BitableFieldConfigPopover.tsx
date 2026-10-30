import React, { useState, useMemo } from 'react';
import {
  BitableColumnConfig,
  BitableFieldType,
  BitableSelectOption,
  BITABLE_FIELD_TYPE_META
} from './types';
import { BitableIcon } from './BitableIcon';

interface BitableFieldConfigPopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  onToggleVisibility: (colId: string) => void;
  onMoveColumn: (dragIndex: number, hoverIndex: number) => void;
  onAddCustomColumn: (col: Omit<BitableColumnConfig<T>, 'visible'>) => void;
  onRenameColumn?: (colId: string, newLabel: string) => void;
  onDeleteColumn?: (colId: string) => void;
  onToggleColumnLock?: (colId: string) => void;
  /** 后端固定字段判定：命中的已锁定列锁图标显示红色（不可解锁），见 wiki/13 §13.18 */
  isLockProtectedColumn?: (colId: string) => boolean;
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
  isLockProtectedColumn,
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

  // Handle batch visibility（全选：当前视图全部字段显示；不提供「全隐」——隐藏字段总是个别操作）
  const handleShowAll = () => {
    columns.forEach((col) => {
      if (!col.visible) {
        onToggleVisibility(col.id);
      }
    });
  };

  const handleStartRename = (col: BitableColumnConfig<T>) => {
    // 主键（id === 'code'）允许改名，仅 type=action 与显式锁定的字段不可改名
    if (!onRenameColumn || col.isLocked) return;
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
    // 单选与多选共用同一份候选项目录
    const parsedOptions =
      newFieldType === 'select' || newFieldType === 'multiSelect'
        ? parseSelectOptions(newFieldOptionsRaw)
        : undefined;

    // 按类型给一个能装下内容的最小列宽，避免新建后立刻出现省略号
    const minWidth =
      newFieldType === 'date'
        ? '120px'
        : newFieldType === 'number'
        ? '100px'
        : newFieldType === 'boolean'
        ? '96px'
        : newFieldType === 'progress'
        ? '140px'
        : newFieldType === 'rating'
        ? '130px'
        : newFieldType === 'currency'
        ? '120px'
        : newFieldType === 'email'
        ? '180px'
        : newFieldType === 'phone'
        ? '140px'
        : newFieldType === 'multiSelect'
        ? '168px'
        : newFieldType === 'user' || newFieldType === 'group'
        ? '176px'
        : newFieldType === 'url'
        ? '184px'
        : '140px';

    onAddCustomColumn({
      id: fieldId,
      label: trimmed,
      type: newFieldType,
      minWidth,
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
    // 候选项目录对「单选 / 多选」通用，保存时不能把多选列打回单选
    const targetType: BitableFieldType =
      columns.find((c) => c.id === colId)?.type === 'multiSelect' ? 'multiSelect' : 'select';
    if (onUpdateColumnType && parsed.length > 0) {
      onUpdateColumnType(colId, targetType, parsed);
    }
    setOptionsEditingColId(null);
  };

  /**
   * 可新建/可切换的字段类型，顺序对齐飞书多维表的「常规」分组。
   * 本平台**不提供**「公式」与「查找引用」（都需要后端解析引擎，纯前端只能造假数据）；
   * `action`（后台字段）由后台程序产生，也不在可选项中。
   */
  const availableFieldTypes: BitableFieldType[] = [
    'text',
    'number',
    'select',
    'multiSelect',
    'date',
    'progress',
    'rating',
    'currency',
    'email',
    'phone',
    'user',
    'group',
    'attachment',
    'boolean',
    'url',
    'badge'
  ];

  return (
    <div className="absolute left-0 top-full mt-1.5 w-[560px] max-h-[calc(100vh-90px)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-3.5 select-none text-slate-800 text-[12px] animate-in fade-in zoom-in-95 duration-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-[#005BAC] flex items-center justify-center font-bold">
            <BitableIcon name="tune" className="text-[16px]" />
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
          <BitableIcon name="close" className="text-[16px] block" />
        </button>
      </div>

      {/* Feature Guide Banner */}
      <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <BitableIcon name="security" className="text-[15px] text-amber-700 shrink-0" />
          <span className="text-[11px] text-amber-900 truncate">
            <strong>操作提示：</strong>点击 <span className="font-semibold text-amber-800">🔒</span> 切换锁定保护，点击 <span className="font-semibold text-[#005BAC]">📌</span> 冻结固定，点击 <span className="font-semibold text-slate-700">✎</span> 重命名，点击 <span className="font-semibold text-rose-600">🗑️</span> 删除
          </span>
        </div>
      </div>

      {/* Search & Batch Actions */}
      <div className="py-2 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <BitableIcon
            name="search"
            className="text-[15px] text-slate-400 absolute left-2 top-1.5 pointer-events-none"
          />
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
              <BitableIcon name="cancel" className="text-[14px]" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleShowAll}
            className="h-7 px-2 text-[11px] text-slate-600 hover:text-[#005BAC] hover:bg-blue-50 rounded border border-slate-200 cursor-pointer transition-colors"
            title="全部在本视图显示"
          >
            全选
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
            // 改名只受「显式锁定」约束：editable:false 只代表单元格只读（如系统主键），
            // 不应连带封掉改名入口，否则用户会看到灰铅笔却不知原因。
            const isRenameBlocked = !!col.isLocked;
            // 「锁定」按钮只反映管理员是否显式加锁（主键只读 ≠ 已锁定）
            const isHardLocked = !!col.isLocked;
            // 三态锁图标：红 = 后端固定字段（不可解锁），黄 = 普通锁定，灰 = 未锁定
            const isLockProtected = isHardLocked && !!isLockProtectedColumn?.(col.id);
            const typeMeta = BITABLE_FIELD_TYPE_META[col.type] || BITABLE_FIELD_TYPE_META.text;
            const isPrimary = col.id === 'code';
            const isAction = col.type === 'action';
            const canDelete = !isAction && !isPrimary;
            // 改类型：显式锁定 or 主键（图号规则依赖文本型）；只读单元格字段仍可改类型
            const isTypeLocked = isHardLocked || isPrimary;

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
                      <BitableIcon name="check" className="text-[14px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingColId(null)}
                      className="w-6 h-6 rounded text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center transition-colors"
                      title="取消"
                    >
                      <BitableIcon name="close" className="text-[14px]" />
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
                        title={col.visible ? '在当前视图隐藏该字段（不影响其他视图）' : '在当前视图显示该字段'}
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
                    <div className="w-36 shrink-0 flex items-center gap-1">
                      {!isAction ? (
                        <>
                          <div className="relative flex-1 min-w-0">
                            <div
                              className={`h-6 px-1.5 rounded flex items-center justify-between text-[11px] font-medium border transition-colors ${
                                isTypeLocked
                                  ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-80'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-[#005BAC] hover:border-blue-200 cursor-pointer shadow-2xs'
                              }`}
                              title={
                                isPrimary
                                  ? '主键字段类型固定为文本（图号规则与台账匹配依赖它），不可更改'
                                  : isHardLocked
                                  ? '已锁定字段不可更改类型，请先解锁'
                                  : '点击切换字段类型'
                              }
                            >
                              <div className="flex items-center gap-1 min-w-0 truncate">
                                <BitableIcon
                                  name={typeMeta.icon as any}
                                  className="text-[13px] leading-none text-slate-500 shrink-0"
                                />
                                <span className="truncate">{typeMeta.label}</span>
                              </div>
                              {!isTypeLocked && (
                                <BitableIcon
                                  name="expand_more"
                                  className="text-[12px] leading-none text-slate-400 shrink-0"
                                />
                              )}
                            </div>

                            {/* Transparent native select overlay for foolproof menu rendering across all containers */}
                            {!isTypeLocked && (
                              <select
                                value={col.type}
                                disabled={isTypeLocked}
                                onChange={(e) => {
                                  const nextType = e.target.value as BitableFieldType;
                                  // 切到单选时立刻生效：updateColumnType 会按该列现有数据的去重值
                                  // 自动建选项并配好色，用户点完就能看到彩色胶囊。
                                  // （旧逻辑只弹选项编辑器、不真正改类型，用户不填选项就永远还是文本列）
                                  onUpdateColumnType?.(col.id, nextType);
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

                          {/* Quick Options configuration button for select / multiSelect fields */}
                          {(col.type === 'select' || col.type === 'multiSelect') && (
                            <button
                              type="button"
                              disabled={isTypeLocked}
                              onClick={() => {
                                if (!isTypeLocked) {
                                  setOptionsEditingColId(col.id);
                                  setOptionsEditingRaw(
                                    (col.options && col.options.length > 0)
                                      ? col.options.map((o) => o.label).join(', ')
                                      : '选项1, 选项2, 选项3'
                                  );
                                }
                              }}
                              className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isTypeLocked
                                  ? 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed'
                                  : 'text-[#005BAC] bg-blue-50 hover:bg-blue-100 border-blue-200 cursor-pointer shadow-2xs'
                              }`}
                              title={isTypeLocked ? '字段已锁定，不可编辑选项' : '配置候选项列表（单选 / 多选通用）'}
                            >
                              <BitableIcon name="tune" className="text-[13px]" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span
                          className="w-full h-6 rounded flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 cursor-help"
                          title="后台字段：由后台程序参与计算与匹配（附件解析、图纸关联、操作入口），类型由程序决定，前端不可修改"
                        >
                          <BitableIcon name="dns" className="text-[12px] leading-none shrink-0" />
                          <span className="truncate">后台字段</span>
                        </span>
                      )}
                    </div>

                    {/* Fixed Action Toolbar: 100% strict alignment across all rows */}
                    <div className="w-[172px] shrink-0 flex items-center justify-end gap-1">
                      {/* 1. Lock column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {onToggleColumnLock ? (
                          <button
                            type="button"
                            onClick={() => {
                              onToggleColumnLock(col.id);
                              setActiveTypeMenuColId(null);
                            }}
                            className={`w-6 h-6 rounded transition-all cursor-pointer flex items-center justify-center border shrink-0 ${
                              isLockProtected
                                ? 'text-red-700 bg-red-50 border-red-300 hover:bg-red-100 shadow-2xs font-bold'
                                : isHardLocked
                                ? 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100 shadow-2xs font-bold'
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title={
                              isLockProtected
                                ? '系统固定字段（识别来源），列定义受保护，不可解锁，也不可修改表中数据'
                                : isHardLocked
                                ? '当前【已锁定受控】（只读保护：禁止修改表格内容、禁止重命名与删除）。点击解锁'
                                : isPrimary
                                ? '当前【未锁定】。主键字段本身不可删除、类型固定，但可改名；点击可加锁保护'
                                : isAction
                                ? '当前【未锁定】。按钮列不支持行内编辑，但可改名称、可冻结；点击锁定可保护其名称'
                                : '当前【未锁定】（允许行内编辑与修改）。点击锁定保护此字段'
                            }
                          >
                            <BitableIcon
                              name={isHardLocked ? 'lock' : 'lock_open'}
                              className={`text-[13px] leading-none ${isLockProtected ? 'text-red-700 font-bold' : isHardLocked ? 'text-amber-700 font-bold' : 'text-slate-400'}`}
                            />
                          </button>
                        ) : (
                          <div className="w-6 h-6" />
                        )}
                      </div>

                      {/* 2. Freeze column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {onToggleColumnFreeze ? (
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
                            <BitableIcon name="push_pin" className="text-[13px] leading-none" />
                          </button>
                        ) : (
                          <div className="w-6 h-6" />
                        )}
                      </div>

                      {/* 3. Rename column (w-7 shrink-0)（主键允许改名，仅禁止删除） */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {onRenameColumn ? (
                          isRenameBlocked ? (
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 cursor-not-allowed shrink-0"
                              title="字段已锁定，不可修改名称（点击左侧锁图标可解锁）"
                            >
                              <BitableIcon name="edit" className="text-[13px]" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartRename(col)}
                              className="w-6 h-6 rounded text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 transition-all cursor-pointer flex items-center justify-center shrink-0"
                              title={isPrimary ? '修改字段名称（主键可改名，但不可删除）' : '修改字段名称'}
                            >
                              <BitableIcon name="edit" className="text-[13px]" />
                            </button>
                          )
                        ) : (
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-200 cursor-not-allowed shrink-0"
                            title="当前页面未提供字段改名能力"
                          >
                            <BitableIcon name="edit" className="text-[13px]" />
                          </div>
                        )}
                      </div>

                      {/* 4. Delete column (w-7 shrink-0) */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {canDelete && onDeleteColumn ? (
                          isHardLocked ? (
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 cursor-not-allowed shrink-0"
                              title="字段已锁定，不可删除，请先解锁"
                            >
                              <BitableIcon name="delete" className="text-[13px]" />
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
                              <BitableIcon name="delete" className="text-[13px]" />
                            </button>
                          )
                        ) : (
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-200 cursor-not-allowed shrink-0"
                            title={isAction ? '后台字段不可删除（后台程序依赖此列做计算与匹配）' : '系统核心主键不可删除'}
                          >
                            <BitableIcon name="delete" className="text-[13px]" />
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
                          <BitableIcon name="arrow_upward" className="text-[13px]" />
                        </button>
                        <button
                          type="button"
                          disabled={originalIndex === columns.length - 1}
                          onClick={() => onMoveColumn(originalIndex, originalIndex + 1)}
                          className="w-5 h-6 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer flex items-center justify-center transition-colors"
                          title="下移"
                        >
                          <BitableIcon name="arrow_downward" className="text-[13px]" />
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
              <BitableIcon name="tune" className="text-[14px]" />
              配置下拉选项
            </span>
            <button
              onClick={() => setOptionsEditingColId(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <BitableIcon name="close" className="text-[13px]" />
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
              <BitableIcon name="add_circle" className="text-[15px]" />
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
                <BitableIcon name="restart_alt" className="text-[13px]" />
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
                <BitableIcon name="add_box" className="text-[15px] text-[#005BAC]" />
                新建自定义字段
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <BitableIcon name="close" className="text-[14px]" />
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

            {/* Field Type Selection（下拉选择，避免平铺把确认按钮挤出弹层） */}
            <div>
              <label className="block text-[10.5px] font-medium text-slate-600 mb-1">
                字段类型
              </label>
              <div className="relative">
                <div className="h-7 px-2 flex items-center justify-between text-[11px] font-medium bg-white border border-slate-200 rounded-md pointer-events-none">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <BitableIcon
                      name={BITABLE_FIELD_TYPE_META[newFieldType].icon as any}
                      className="text-[14px] leading-none text-[#005BAC] shrink-0"
                    />
                    <span className="truncate text-slate-800">
                      {BITABLE_FIELD_TYPE_META[newFieldType].label}
                    </span>
                  </div>
                  <BitableIcon
                    name="expand_more"
                    className="text-[13px] leading-none text-slate-400 shrink-0"
                  />
                </div>
                {/* 透明原生 select 覆盖：与行内「类型与选项」同款，跨容器渲染最稳 */}
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as BitableFieldType)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[12px]"
                  title="选择字段类型"
                >
                  {availableFieldTypes.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>
                      {BITABLE_FIELD_TYPE_META[typeKey].label} - {BITABLE_FIELD_TYPE_META[typeKey].desc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* If Select / MultiSelect type, show options input */}
            {(newFieldType === 'select' || newFieldType === 'multiSelect') && (
              <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-1.5">
                <label className="block text-[10.5px] font-medium text-slate-600">
                  候选项 (以逗号分隔，{newFieldType === 'multiSelect' ? '可多选' : '单选'})
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
                <BitableIcon
                  name={newFieldIsLocked ? 'lock' : 'lock_open'}
                  className={`text-[15px] ${newFieldIsLocked ? 'text-amber-600' : 'text-slate-400'}`}
                />
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
