import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  BitableColumnConfig,
  BitableViewConfig,
  BitableViewType,
  BitableFilterRule,
  BitableSortRule,
  BitableColorRule,
  BitableDensity,
  BitableGroupRule,
  BitableFieldType,
  BitableSelectOption
} from './types';
import { BitableFieldConfigPopover } from './BitableFieldConfigPopover';
import { BitableFilterPopover } from './BitableFilterPopover';
import { BitableSortPopover } from './BitableSortPopover';
import { BitableGroupPopover } from './BitableGroupPopover';
import { BitableDensityPopover } from './BitableDensityPopover';
import { BitableColorRulePopover } from './BitableColorRulePopover';
import { BitableViewConfigPopover } from './BitableViewConfigPopover';

interface BitableToolbarProps<T> {
  columns: BitableColumnConfig<T>[];
  activeView: BitableViewConfig;
  totalViews?: number;
  isMasterView?: boolean;
  onAddRecord: () => void;
  onDeleteRecord?: () => void;
  /** 点击「导入表格」按钮：通常打开 BitableImportDialog，不传则不显示该按钮 */
  onImport?: () => void;
  /** 点击「导出」菜单项：导出当前视图（已筛选/排序后）的全部记录 */
  onExport?: (format: 'csv' | 'xlsx') => void;
  selectedRecordCount?: number;
  // Undo / Redo（Ctrl+Z / Ctrl+Shift+Z），不传则不显示
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string;
  redoLabel?: string;
  // View operations
  onRenameView?: (newName: string) => void;
  onDuplicateView?: () => void;
  onResetView?: () => void;
  onDeleteView?: () => void;
  onUpdateViewConfig?: (updates: Partial<BitableViewConfig>) => void;
  // Field operations
  onToggleColumnVisibility: (colId: string) => void;
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
  // Filter operations
  onUpdateFilterRules: (rules: BitableFilterRule[]) => void;
  onUpdateFilterLogic: (logic: 'AND' | 'OR') => void;
  // Sort operations
  onUpdateSortRules: (rules: BitableSortRule[]) => void;
  // Group operations
  onSelectGroupField?: (fieldId: string | null) => void;
  onUpdateGroupRules?: (rules: BitableGroupRule[]) => void;
  isAllGroupsCollapsed?: boolean;
  onToggleAllGroupsCollapse?: () => void;
  // Density operations
  onSelectDensity: (density: BitableDensity) => void;
  // Color rules
  onUpdateColorRules: (rules: BitableColorRule[]) => void;
  // Search
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  // Extra right side actions
  extraActions?: React.ReactNode;
}

type ActivePopoverType = 'field' | 'view' | 'filter' | 'group' | 'sort' | 'density' | 'color' | null;

export const BitableToolbar = <T,>({
  columns,
  activeView,
  totalViews = 1,
  isMasterView = false,
  onAddRecord,
  onDeleteRecord,
  onImport,
  onExport,
  selectedRecordCount = 0,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  undoLabel = '',
  redoLabel = '',
  onRenameView,
  onDuplicateView,
  onResetView,
  onDeleteView,
  onUpdateViewConfig,
  onToggleColumnVisibility,
  onMoveColumn,
  onAddCustomColumn,
  onRenameColumn,
  onDeleteColumn,
  onToggleColumnLock,
  isLockProtectedColumn,
  onToggleColumnFreeze,
  onUpdateColumnType,
  onResetColumns,
  onUpdateFilterRules,
  onUpdateFilterLogic,
  onUpdateSortRules,
  onSelectGroupField,
  onUpdateGroupRules,
  isAllGroupsCollapsed,
  onToggleAllGroupsCollapse,
  onSelectDensity,
  onUpdateColorRules,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  extraActions
}: BitableToolbarProps<T>) => {
  const [activePopover, setActivePopover] = useState<ActivePopoverType>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 窄屏自适应：按工具栏自身宽度分三档，保证任何窗口下都尽量只占一行，
  // 且绝不会因为折行而压住表头（容器已改为 min-h + 自动高度）。
  //   full    ≥ FULL_MIN      ：完整文字
  //   compact ≥ COMPACT_MIN   ：次要工具只留图标（保留「添加记录」文字）
  //   ultra   <  COMPACT_MIN  ：全部图标化，搜索框折叠为放大镜按钮
  // 用容器宽度而非视口宽度判断，侧栏折叠/展开、窗口缩放都能正确响应。
  const [density, setDensity] = useState<'full' | 'compact' | 'ultra'>('full');
  const [searchExpanded, setSearchExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const FULL_MIN = 1420;
    const COMPACT_MIN = 840;
    const sync = (width: number) => {
      setDensity((prev) => {
        // 每档之间留 40px 回滞区间，避免临界宽度反复抖动
        const next: 'full' | 'compact' | 'ultra' =
          width >= FULL_MIN
            ? 'full'
            : width >= COMPACT_MIN
            ? 'compact'
            : 'ultra';
        if (prev === 'full' && next === 'compact' && width > FULL_MIN - 40) return prev;
        if (prev === 'compact' && next === 'full' && width < FULL_MIN + 40) return prev;
        if (prev === 'compact' && next === 'ultra' && width > COMPACT_MIN - 40) return prev;
        if (prev === 'ultra' && next === 'compact' && width < COMPACT_MIN + 40) return prev;
        return next;
      });
    };
    sync(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) sync(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 文字标签统一用 .tb-label，由 index.css 按 data-density 隐藏；
  // 页面通过 extraActions 追加的按钮只要把文字包进 .tb-label 即可自动跟随。
  const labelCls = 'tb-label';
  const showSearchInput = density !== 'ultra' || searchExpanded || !!searchQuery;

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const togglePopover = (type: ActivePopoverType) => {
    setActivePopover((prev) => (prev === type ? null : type));
  };

  const visibleColumnCount = columns.filter((c) => c.visible).length;
  const filterCount = activeView.filterRules.length;
  const sortCount = activeView.sortRules.length;
  const groupCount =
    activeView.groupRules && activeView.groupRules.length > 0
      ? activeView.groupRules.length
      : activeView.groupByFieldId
      ? 1
      : 0;
  const colorRuleCount = activeView.colorRules.length;

  const isFieldActive = activePopover === 'field' || visibleColumnCount < columns.length;
  const isViewActive = activePopover === 'view';
  const isFilterActive = filterCount > 0 || activePopover === 'filter';
  const isGroupActive = groupCount > 0 || activePopover === 'group';
  const isSortActive = sortCount > 0 || activePopover === 'sort';
  const isDensityActive = activePopover === 'density';
  const isColorActive = colorRuleCount > 0 || activePopover === 'color';

  // ===== 工具条按视图类型差异化（对齐飞书多维表）=====
  // 表格：全量工具；看板/画册/甘特：卡片/横道形态没有「行高」「填色」；
  // 日历：只在月历上排布，不需要分组；表单：纯录入页，只要字段/视图配置。
  const vt: BitableViewType = activeView.viewType || 'grid';
  const showRecordActions = vt !== 'form'; // 添加记录 / 删除记录
  const showFilter = vt !== 'form';
  const showGroup = vt === 'grid' || vt === 'kanban' || vt === 'gallery' || vt === 'gantt';
  const showSort = vt !== 'form';
  const showDensity = vt === 'grid';
  const showColor = vt === 'grid';

  // 切换视图类型后，若当前弹层对应的按钮已被隐藏，立即关闭，避免弹层悬空
  useEffect(() => {
    setActivePopover((prev) => {
      if (!prev) return prev;
      if (prev === 'density' && !showDensity) return null;
      if (prev === 'color' && !showColor) return null;
      if (prev === 'group' && !showGroup) return null;
      if (prev === 'sort' && !showSort) return null;
      if (prev === 'filter' && !showFilter) return null;
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vt]);

  return (
    <div
      ref={toolbarRef}
      className="bitable-toolbar min-h-10 bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex items-center justify-between gap-2 shadow-2xs select-none relative text-[12px]"
      data-density={density}
    >
      {/* Left tool actions matching user's screenshot & Feishu Bitable standard */}
      <div className="flex items-center gap-x-1.5 gap-y-1.5 flex-wrap flex-1 min-w-0">
        {/* + 添加记录 */}
        {showRecordActions && (
          <button
            type="button"
            onClick={onAddRecord}
            className="h-7 px-2.5 flex items-center gap-1 rounded bg-[#005BAC] text-white hover:bg-[#004785] font-medium text-[12px] shadow-xs cursor-pointer transition-all active:scale-95 shrink-0"
            title="在表格新增一行可编辑记录"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">add</span>
            <span className="tb-label-strong">添加记录</span>
          </button>
        )}

        {/* 🗑️ 删除记录 */}
        {showRecordActions && onDeleteRecord && (
          <button
            type="button"
            onClick={onDeleteRecord}
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded font-medium text-[12px] transition-all cursor-pointer border shrink-0 ${
              selectedRecordCount > 0
                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 shadow-2xs font-bold'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
            }`}
            title={
              selectedRecordCount > 0
                ? `点击批量删除已勾选的 ${selectedRecordCount} 条记录`
                : '删除记录（请勾选表格左侧复选框，或悬停在行号上直接删除单行）'
            }
          >
            <span className={`material-symbols-outlined text-[15px] leading-none ${
              selectedRecordCount > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}>
              delete
            </span>
            <span className={labelCls}>删除记录</span>
            {selectedRecordCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-rose-200/80 text-rose-900 rounded font-bold">
                {selectedRecordCount}
              </span>
            )}
          </button>
        )}

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* ⬆ 导入表格（Excel / CSV） */}
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="h-7 px-2 tb-tight flex items-center gap-1 rounded font-medium text-[12px] transition-all cursor-pointer border bg-white hover:bg-slate-50 text-slate-600 border-slate-200 shrink-0"
            title="上传 Excel / CSV，自动识别字段类型并导入为多维表"
          >
            <span className="material-symbols-outlined text-[15px] leading-none text-slate-400">
              upload_file
            </span>
            <span className={labelCls}>导入表格</span>
          </button>
        )}

        {/* ⬇ 导出（Excel / CSV） */}
        {onExport && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className={`h-7 px-2 tb-tight flex items-center gap-1 rounded font-medium text-[12px] transition-all cursor-pointer border shrink-0 ${
                exportOpen
                  ? 'bg-blue-50 text-[#005BAC] border-[#005BAC]/40'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title="把当前视图（已筛选 / 排序 / 分组后的记录）导出为 Excel 或 CSV"
            >
              <span className="material-symbols-outlined text-[15px] leading-none text-slate-400">
                download
              </span>
              <span className={labelCls}>导出</span>
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 text-[12px]">
                  <button
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      onExport('xlsx');
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] text-emerald-600">
                      table_view
                    </span>
                    <span className="flex-1">导出为 Excel</span>
                    <span className="text-[10px] text-slate-400 font-mono">.xlsx</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      onExport('csv');
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] text-sky-600">
                      description
                    </span>
                    <span className="flex-1">导出为 CSV</span>
                    <span className="text-[10px] text-slate-400 font-mono">.csv</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ↶ 撤销 / ↷ 重做（Ctrl+Z / Ctrl+Shift+Z） */}
        {onUndo && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                canUndo
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer'
                  : 'bg-white text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title={canUndo ? `撤销：${undoLabel}（Ctrl+Z）` : '没有可撤销的操作'}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">undo</span>
            </button>
            {onRedo && (
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                  canRedo
                    ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer'
                    : 'bg-white text-slate-300 border-slate-100 cursor-not-allowed'
                }`}
                title={canRedo ? `重做：${redoLabel}（Ctrl+Shift+Z）` : '没有可重做的操作'}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">redo</span>
              </button>
            )}
          </div>
        )}

        {/* ⚙ 字段配置 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('field')}
            data-hint="字段配置"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isFieldActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                isFieldActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              settings
            </span>
            <span className={labelCls}>字段配置</span>
            {visibleColumnCount < columns.length && (
              <span className="text-[10.5px] px-1 bg-blue-100 text-[#005BAC] rounded font-bold">
                {visibleColumnCount}/{columns.length}
              </span>
            )}
          </button>
          {activePopover === 'field' && (
            <BitableFieldConfigPopover
              columns={columns}
              onToggleVisibility={onToggleColumnVisibility}
              onMoveColumn={onMoveColumn}
              onAddCustomColumn={onAddCustomColumn}
              onRenameColumn={onRenameColumn}
              onDeleteColumn={onDeleteColumn}
              onToggleColumnLock={onToggleColumnLock}
              isLockProtectedColumn={isLockProtectedColumn}
              onToggleColumnFreeze={onToggleColumnFreeze}
              onUpdateColumnType={onUpdateColumnType}
              onResetColumns={onResetColumns}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>

        {/* ◧ 视图配置 (飞书标准) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('view')}
            data-hint="视图配置"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isViewActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                isViewActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              tune
            </span>
            <span className={labelCls}>视图配置</span>
            {activeView.viewType && activeView.viewType !== 'grid' && (
              <span className="px-1.5 py-0.2 bg-blue-100/70 text-[#005BAC] rounded text-[10px] font-bold">
                {activeView.viewType === 'kanban'
                  ? '看板'
                  : activeView.viewType === 'gallery'
                  ? '画册'
                  : activeView.viewType === 'calendar'
                  ? '日历'
                  : activeView.viewType === 'form'
                  ? '表单'
                  : '甘特'}
              </span>
            )}
          </button>
          {activePopover === 'view' && (
            <BitableViewConfigPopover
              activeView={activeView}
              totalViews={totalViews}
              isMasterView={isMasterView || activeView.name === '总表'}
              columns={columns}
              onRenameView={onRenameView || (() => {})}
              onUpdateViewConfig={onUpdateViewConfig}
              onDuplicateView={onDuplicateView || (() => {})}
              onResetView={onResetView || (() => {})}
              onDeleteView={onDeleteView || (() => {})}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>

        {/* Y 筛选 */}
        {showFilter && (
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('filter')}
            data-hint="筛选"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isFilterActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none ${
                isFilterActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              filter_alt
            </span>
            {filterCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#005BAC] text-white text-[10.5px] rounded-full font-bold">
                {filterCount}
              </span>
            )}
            <span className={labelCls}>筛选</span>
          </button>
          {activePopover === 'filter' && (
            <BitableFilterPopover
              columns={columns}
              filterRules={activeView.filterRules}
              filterLogic={activeView.filterLogic}
              onUpdateRules={onUpdateFilterRules}
              onUpdateLogic={onUpdateFilterLogic}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>
        )}

        {/* ⊞ 多条件分组 (飞书标准) */}
        {showGroup && (
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('group')}
            data-hint="分组"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isGroupActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none ${
                isGroupActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              grid_view
            </span>
            {groupCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#005BAC] text-white text-[10.5px] rounded-full font-bold">
                {groupCount}
              </span>
            )}
            <span className={labelCls}>分组</span>
          </button>
          {activePopover === 'group' && (
            <BitableGroupPopover
              columns={columns}
              groupRules={activeView.groupRules}
              groupByFieldId={activeView.groupByFieldId}
              onUpdateGroupRules={(rules) => {
                if (onUpdateGroupRules) {
                  onUpdateGroupRules(rules);
                } else if (onSelectGroupField) {
                  onSelectGroupField(rules.length > 0 ? rules[0].fieldId : null);
                }
              }}
              onSelectGroupField={onSelectGroupField}
              isAllCollapsed={isAllGroupsCollapsed}
              onToggleAllCollapse={onToggleAllGroupsCollapse}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>
        )}

        {/* ⇅ 排序 */}
        {showSort && (
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('sort')}
            data-hint="排序"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isSortActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none ${
                isSortActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              swap_vert
            </span>
            {sortCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#005BAC] text-white text-[10.5px] rounded-full font-bold">
                {sortCount}
              </span>
            )}
            <span className={labelCls}>排序</span>
          </button>
          {activePopover === 'sort' && (
            <BitableSortPopover
              columns={columns}
              sortRules={activeView.sortRules}
              onUpdateRules={onUpdateSortRules}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>
        )}

        {/* ⇕ 行高 */}
        {showDensity && (
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('density')}
            data-hint="行高"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isDensityActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                isDensityActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              height
            </span>
            <span className={labelCls}>行高</span>
          </button>
          {activePopover === 'density' && (
            <BitableDensityPopover
              density={activeView.density}
              onSelectDensity={onSelectDensity}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>
        )}

        {/* ◈ 填色 */}
        {showColor && (
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('color')}
            data-hint="条件填色"
            className={`h-7 px-2 tb-tight flex items-center gap-1 rounded text-[12px] font-medium transition-colors cursor-pointer border ${
              isColorActive
                ? 'bg-blue-50 text-[#005BAC] border-blue-200 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none ${
                isColorActive ? 'text-[#005BAC]' : 'text-slate-500'
              }`}
            >
              palette
            </span>
            {colorRuleCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#005BAC] text-white text-[10.5px] rounded-full font-bold">
                {colorRuleCount}
              </span>
            )}
            <span className={labelCls}>填色</span>
          </button>
          {activePopover === 'color' && (
            <BitableColorRulePopover
              columns={columns}
              colorRules={activeView.colorRules}
              onUpdateRules={onUpdateColorRules}
              onClose={() => setActivePopover(null)}
            />
          )}
        </div>
        )}

        {/* 视图状态徽标：锁定状态已由页签上的锁形图标表达，这里不再重复渲染「已锁定」 */}
        {activeView.scope === 'personal' && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10.5px] font-medium">
            <span className="material-symbols-outlined text-[12px]">person</span>
            个人视图
          </span>
        )}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 🔍 多维表格通用搜索框 (Universal Search Box)；极窄档折叠为放大镜按钮；表单视图不提供搜索 */}
        {vt !== 'form' && (showSearchInput ? (
          <div className="relative flex items-center">
            <span className="material-symbols-outlined text-[15px] text-slate-400 absolute left-2 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onBlur={() => {
                if (!searchQuery) setSearchExpanded(false);
              }}
              autoFocus={density === 'ultra'}
              placeholder={searchPlaceholder || '搜索表格数据...'}
              className={`h-7 ${
                density === 'full' ? 'w-32 sm:w-44' : density === 'compact' ? 'w-28' : 'w-40'
              } pl-7 pr-6 rounded border border-slate-200 bg-slate-50/70 hover:bg-white focus:bg-white text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]/20 transition-all shadow-2xs`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 flex items-center justify-center p-0.5 rounded cursor-pointer"
                title="清空搜索"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            data-hint="搜索台账数据"
            className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 bg-slate-50/70 hover:bg-white text-slate-500 hover:text-[#005BAC] cursor-pointer transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
          </button>
        ))}

        {/* Toggle all groups collapse if grouped */}
        {showGroup && groupCount > 0 && onToggleAllGroupsCollapse && (
          <button
            type="button"
            onClick={onToggleAllGroupsCollapse}
            className="h-7 px-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-[11.5px] font-medium cursor-pointer transition-colors"
            title={isAllGroupsCollapsed ? '一键展开所有分组' : '一键折叠所有分组'}
          >
            <span className="material-symbols-outlined text-[14px] text-slate-500">
              {isAllGroupsCollapsed ? 'unfold_more' : 'unfold_less'}
            </span>
            <span className={labelCls}>{isAllGroupsCollapsed ? '全部展开' : '全部折叠'}</span>
          </button>
        )}

        {extraActions}
      </div>
    </div>
  );
};
