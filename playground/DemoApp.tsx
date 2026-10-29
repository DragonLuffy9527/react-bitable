import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BitableTable,
  BitableToolbar,
  BitableViewTabs,
  BitableImportDialog,
  useBitable,
  type BitableColorRule,
  type BitableFilterRule,
  type BitableGroupRule,
  type BitableSortRule
} from 'react-bitable';
import { defaultColumns, initialTasks, presetViews, type TaskRow } from './fixtures';

export function DemoApp() {
  const [toast, setToast] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const {
    data,
    groupedData,
    columns,
    viewColumns,
    views,
    activeView,
    activeViewId,
    processedData,
    isMasterView,
    collapsedGroups,
    toggleGroupCollapse,
    isAllGroupsCollapsed,
    toggleAllGroupsCollapse,
    handleSelectView,
    handleCreateView,
    handleDeleteView,
    renameView,
    duplicateView,
    resetActiveView,
    updateViewConfig,
    toggleColumnVisibility,
    moveColumn,
    moveColumnById,
    addCustomColumn,
    deleteColumn,
    toggleColumnLock,
    toggleColumnFreeze,
    updateColumnType,
    resetColumns,
    renameColumn,
    setFilterRules,
    setFilterLogic,
    setSortRules,
    setGroupByFieldId,
    setGroupRules,
    setDensity,
    setColorRules,
    updateCell,
    updateCells,
    addRow,
    deleteRow,
    deleteRows,
    insertRow,
    duplicateRow,
    detachRow,
    moveRow,
    resizeColumn,
    searchQuery,
    setSearchQuery,
    importTable,
    exportView,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel
  } = useBitable<TaskRow>({
    storageKey: 'react-bitable-playground',
    initialData: initialTasks,
    defaultColumns,
    presetViews,
    // 字段表结构版本号：改了 defaultColumns 的 id/类型后调大它，
    // 老浏览器里存的旧列配置会被重置
    schemaVersion: 'demo-1',
    // 撤销 / 重做执行后的提示，接到自己的 toast
    onHistoryToast: (message) => showToast(message)
  });

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => Object.keys(checkedIds).filter((id) => checkedIds[id]).length,
    [checkedIds]
  );

  const handleToggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleSelectAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) data.forEach((row) => (next[row.id] = true));
    setCheckedIds(next);
  };

  const handleAddRecord = () => {
    addRow({ status: '待开始', priority: 'P2' } as Partial<TaskRow>);
    showToast('已新增一条记录');
  };

  const handleInsertRow = (
    anchorRowId: string | null,
    position: 'above' | 'below' | 'child'
  ) => {
    const row = insertRow(anchorRowId, position);
    if (row) {
      setFocusRowId(row.id);
      showToast(position === 'child' ? '已插入子记录' : '已插入记录');
    }
  };

  const handleDuplicateRow = (rowId: string) => {
    const copy = duplicateRow(rowId);
    if (copy) {
      setFocusRowId(copy.id);
      showToast('已复制记录');
    }
  };

  const handleMoveRow = (dragId: string, targetId: string, position: 'before' | 'after' | 'child') => {
    const result = moveRow(dragId, targetId, position);
    showToast(result.message || (result.ok ? '顺序已更新' : '移动失败'));
  };

  const colLabel = (id: string) => columns.find((c) => c.id === id)?.label || id;

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#0b1c30]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1680px] px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[19px] font-bold tracking-tight">
                react-bitable
                <span className="ml-2 align-middle text-[11px] font-medium text-[#005BAC] bg-[#eff6fc] border border-[#bfdbfe] rounded px-1.5 py-0.5">
                  playground
                </span>
              </h1>
              <p className="mt-1 text-[12.5px] text-slate-500">
                类飞书多维表格的 React 组件库 · 一份数据，六种视图 · 全部状态自动持久化到 localStorage
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-code-num">
                {data.length} 条记录
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-code-num">
                {views.length} 个视图
              </span>
              <button
                type="button"
                className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
                onClick={() => {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith('react-bitable-playground'))
                    .forEach((k) => localStorage.removeItem(k));
                  location.reload();
                }}
              >
                清空本地缓存
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-5 py-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
          <BitableViewTabs
            views={views}
            activeViewId={activeViewId}
            onSelectView={(vId) => {
              handleSelectView(vId);
              const name = views.find((v) => v.id === vId)?.name;
              showToast(`已切换至【${name}】`);
            }}
            onCreateView={(name, viewType) => {
              handleCreateView(name, viewType);
              showToast(`已新建视图【${name}】`);
            }}
            onDeleteView={(vId) => {
              const ok = handleDeleteView(vId);
              showToast(ok ? '已删除视图' : '主视图不可删除');
            }}
            onDuplicateView={(vId) => {
              const dup = duplicateView(vId);
              showToast(`已复制为【${dup.name}】`);
            }}
            onUpdateViewConfig={(vId, updates) => {
              updateViewConfig(vId, updates);
              showToast('视图配置已更新');
            }}
          />

          <div className="mt-2.5">
            <BitableToolbar
              columns={viewColumns}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="搜索编号 / 标题 / 负责人…"
              activeView={activeView}
              totalViews={views.length}
              isMasterView={isMasterView}
              onAddRecord={handleAddRecord}
              onImport={() => setImportOpen(true)}
              onExport={(format) => {
                exportView(format);
                showToast(
                  `已导出当前视图为 ${format.toUpperCase()}（${
                    processedData.length
                  } 条记录，仅可见列）`
                );
              }}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              undoLabel={undoLabel}
              redoLabel={redoLabel}
              selectedRecordCount={selectedCount}
              onDeleteRecord={() => {
                const ids = Object.keys(checkedIds).filter((id) => checkedIds[id]);
                if (ids.length === 0) {
                  showToast('请先勾选要删除的记录');
                  return;
                }
                deleteRows(ids);
                setCheckedIds({});
                showToast(`已删除 ${ids.length} 条记录`);
              }}
              onRenameView={(newName) => {
                renameView(activeViewId, newName);
                showToast(`视图已更名为【${newName}】`);
              }}
              onDuplicateView={() => {
                const dup = duplicateView(activeViewId);
                showToast(`已复制为【${dup.name}】`);
              }}
              onResetView={() => {
                resetActiveView();
                showToast('当前视图配置已重置');
              }}
              onDeleteView={() => {
                const ok = handleDeleteView(activeViewId);
                showToast(ok ? '已删除当前视图' : '主视图不可删除');
              }}
              onUpdateViewConfig={(updates) => {
                updateViewConfig(activeViewId, updates);
                showToast('视图配置已更新');
              }}
              onToggleColumnVisibility={toggleColumnVisibility}
              onMoveColumn={moveColumn}
              onAddCustomColumn={(col) => {
                addCustomColumn(col);
                showToast(`已新增字段【${col.label}】`);
              }}
              onRenameColumn={(colId, newName) => {
                renameColumn(colId, newName);
                showToast(`字段已更名为【${newName}】`);
              }}
              onDeleteColumn={(colId) => {
                const ok = deleteColumn(colId);
                showToast(ok ? `已删除字段【${colLabel(colId)}】` : '受控字段无法删除');
              }}
              onToggleColumnLock={(colId) => {
                const willLock = !columns.find((c) => c.id === colId)?.isLocked;
                toggleColumnLock(colId);
                showToast(`字段【${colLabel(colId)}】已${willLock ? '锁定' : '解锁'}`);
              }}
              onToggleColumnFreeze={toggleColumnFreeze}
              onUpdateColumnType={(colId, newType) => {
                updateColumnType(colId, newType);
                showToast(`字段【${colLabel(colId)}】类型已更新`);
              }}
              onResetColumns={() => {
                resetColumns();
                showToast('已恢复默认字段');
              }}
              onUpdateFilterRules={(rules: BitableFilterRule[]) => {
                setFilterRules(rules);
                showToast('筛选条件已更新');
              }}
              onUpdateFilterLogic={(logic) => {
                setFilterLogic(logic);
                showToast(`筛选逻辑已切换为 ${logic}`);
              }}
              onUpdateSortRules={(rules: BitableSortRule[]) => {
                setSortRules(rules);
                showToast('排序规则已更新');
              }}
              onSelectGroupField={setGroupByFieldId}
              onUpdateGroupRules={(rules: BitableGroupRule[]) => {
                setGroupRules(rules);
                showToast('分组规则已更新');
              }}
              isAllGroupsCollapsed={isAllGroupsCollapsed}
              onToggleAllGroupsCollapse={toggleAllGroupsCollapse}
              onSelectDensity={setDensity}
              onUpdateColorRules={(rules: BitableColorRule[]) => {
                setColorRules(rules);
                showToast('染色规则已更新');
              }}
              extraActions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-hint="演示按钮"
                    className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
                    onClick={() => showToast('extraActions 可挂任意业务按钮')}
                  >
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    <span className="tb-label">自定义操作</span>
                  </button>
                </div>
              }
            />
          </div>

          <div className="mt-2.5">
            <BitableTable
              columns={viewColumns}
              groupedData={groupedData}
              viewType={activeView.viewType}
              viewConfig={activeView}
              collapsedGroups={collapsedGroups}
              onToggleGroupCollapse={toggleGroupCollapse}
              selectedRowId={selectedRowId}
              onSelectRow={(row) => setSelectedRowId(row.id)}
              checkedIds={checkedIds}
              onToggleCheck={handleToggleCheck}
              onToggleSelectAll={handleToggleSelectAll}
              density={activeView.density}
              colorRules={activeView.colorRules}
              onUpdateCell={(rowId, fieldId, value) => {
                updateCell(rowId, fieldId, value);
                showToast(`已保存：${colLabel(fieldId)} → ${value}`);
              }}
              onUpdateCells={(updates, label) => {
                updateCells(updates, label);
                showToast(label ?? `已更新 ${updates.length} 格`);
              }}
              onCopyCells={(info) => {
                showToast(`已复制 ${info.rows}×${info.columns} 个单元格，可直接粘贴到 Excel`);
              }}
              onSelectRows={(ids) => {
                // Shift+点击的范围勾选：把勾选集整体替换为这批行
                const next: Record<string, boolean> = {};
                ids.forEach((id) => (next[id] = true));
                setCheckedIds(next);
                showToast(`已选中 ${ids.length} 行`);
              }}
              onCreateRow={(values) => {
                addRow(values as Partial<TaskRow>);
                showToast('表单已提交，新增 1 条记录');
              }}
              onDeleteRow={(rowId) => {
                deleteRow(rowId);
                showToast('已删除记录');
              }}
              onToggleColumnLock={(colId) => {
                toggleColumnLock(colId);
                showToast(`字段【${colLabel(colId)}】锁定状态已切换`);
              }}
              onRenameColumn={(colId, newName) => {
                renameColumn(colId, newName);
                showToast(`字段已更名为【${newName}】`);
              }}
              onReorderColumns={(dragId, targetId) => {
                moveColumnById(dragId, targetId);
                showToast(`【${colLabel(dragId)}】已移动到【${colLabel(targetId)}】前`);
              }}
              onResizeColumn={(colId, width) => {
                resizeColumn(colId, width);
                showToast(`【${colLabel(colId)}】列宽 ${Math.round(width)}px`);
              }}
              onInsertRow={handleInsertRow}
              onDuplicateRow={handleDuplicateRow}
              onMoveRow={handleMoveRow}
              onDetachRow={(rowId) => {
                detachRow(rowId);
                showToast('已解除父子层级');
              }}
              scrollToRowId={focusRowId}
              emptyText="暂无符合条件的记录"
            />
          </div>
        </div>

        <p className="mt-3 text-center text-[11.5px] text-slate-400">
          交互提示：表头可拖拽换列 / 拖右边线改列宽；行号悬停可删除；行首方格可拖拽建立父子记录；右键行可插入复制。
        </p>
      </main>

      {importOpen && (
        <BitableImportDialog<TaskRow>
          open={importOpen}
          onClose={() => setImportOpen(false)}
          existingColumns={columns}
          onImport={({ mode, columns: importedColumns, rows, sheetName }) => {
            const res = importTable({
              columns: importedColumns,
              rows: rows as TaskRow[],
              mode
            });
            setCheckedIds({});
            showToast(
              mode === 'append'
                ? `已从「${sheetName}」追加 ${res.rows} 条记录`
                : `已导入「${sheetName}」：${res.columns} 个字段 / ${res.rows} 条记录`
            );
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-md bg-slate-900/90 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
