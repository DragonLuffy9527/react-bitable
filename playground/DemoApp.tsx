import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BitableTable,
  BitableToolbar,
  BitableViewTabs,
  BitableImportDialog,
  BitableWorkspaceSidebar,
  BitableIcon,
  createMemoryDataSource,
  useBitable,
  useBitableWorkspace,
  type BitableColorRule,
  type BitableFilterRule,
  type BitableGroupRule,
  type BitableSortRule,
  type BitableTableDef
} from 'react-bitable';
import { presetTables, type TaskRow } from './fixtures';

export function DemoApp() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 多表容器 Workspace
  const workspace = useBitableWorkspace({
    workspaceKey: 'react-bitable-demo-ws',
    tables: presetTables
  });

  const activeTable = workspace.activeTable ?? workspace.tables[0];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f8f9fc] text-[#0b1c30]">
      {/* 顶部全局顶栏 */}
      <header className="border-b border-slate-200 bg-white shrink-0 z-10 shadow-2xs">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold tracking-tight flex items-center gap-1.5">
              <span>react-bitable</span>
              <span className="text-[11px] font-medium text-[#005BAC] bg-[#eff6fc] border border-[#bfdbfe] rounded px-1.5 py-0.5">
                playground
              </span>
            </h1>
            <span className="text-slate-300">|</span>
            <p className="text-xs text-slate-500 hidden md:block">
              类飞书多维表格的 React 组件库 · 一份数据，六种视图 · 多表工作区与持久化
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
              <BitableIcon name="table_chart" className="text-sm text-[#005BAC]" />
              <span>当前表：<strong className="text-slate-800">{activeTable?.label}</strong></span>
            </span>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
              onClick={() => {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('react-bitable-demo-ws'))
                  .forEach((k) => localStorage.removeItem(k));
                location.reload();
              }}
              title="清除所有工作区与表格的 localStorage 数据"
            >
              清空工作区缓存
            </button>
          </div>
        </div>
      </header>

      {/* 主体：左侧多表侧边栏 + 右侧表格内容 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <BitableWorkspaceSidebar
          tables={workspace.tables}
          activeTableId={workspace.activeTableId}
          onSelectTable={(id) => {
            workspace.setActiveTableId(id);
            const t = workspace.tables.find((item) => item.id === id);
            if (t) showToast(`已切换到数据表【${t.label}】`);
          }}
          onAddTable={(input) => {
            const id = workspace.addTable(input);
            showToast(`已创建新表【${input.label}】`);
            return id;
          }}
          onRenameTable={(id, label) => {
            workspace.renameTable(id, label);
            showToast(`数据表已更名为【${label}】`);
          }}
          onRemoveTable={(id) => {
            const t = workspace.tables.find((item) => item.id === id);
            const ok = workspace.removeTable(id);
            if (ok) {
              showToast(`已删除数据表【${t?.label ?? id}】`);
            } else {
              showToast('至少保留一张数据表');
            }
            return ok;
          }}
          onMoveTable={(from, to) => {
            workspace.moveTable(from, to);
            showToast('已调整数据表排序');
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          workspaceTitle="研发项目工作区"
          workspaceIcon="space_dashboard"
          folders={workspace.folders}
          folderCollapsed={workspace.folderCollapsed}
          onAddFolder={(input) => {
            const id = workspace.addFolder(input);
            const parent = input.parentId
              ? workspace.folders.find((f) => f.id === input.parentId)
              : null;
            showToast(
              parent
                ? `已在【${parent.name}】下创建子文件夹【${input.name}】`
                : `已创建文件夹【${input.name}】`
            );
            return id;
          }}
          onRenameFolder={(id, name) => {
            workspace.renameFolder(id, name);
            showToast(`文件夹已更名为【${name}】`);
          }}
          onRemoveFolder={(id) => {
            const f = workspace.folders.find((item) => item.id === id);
            workspace.removeFolder(id);
            showToast(`已删除文件夹【${f?.name ?? id}】`);
          }}
          onToggleFolderCollapse={(id) => {
            workspace.toggleFolderCollapsed(id);
          }}
          onMoveTableToFolder={(tableId, folderId) => {
            workspace.moveTableToFolder(tableId, folderId);
            const folder = workspace.folders.find((f) => f.id === folderId);
            showToast(folder ? `已将表格移入【${folder.name}】` : '已将表格移至根目录');
          }}
          onMoveFolderToFolder={(folderId, targetFolderId) => {
            workspace.moveFolderToFolder(folderId, targetFolderId);
            const target = workspace.folders.find((f) => f.id === targetFolderId);
            showToast(target ? `已移动到【${target.name}】子目录` : '已移至根目录');
          }}
          onReorderItems={(dragId, targetId, position) => {
            workspace.reorderItems(dragId, targetId, position);
          }}
        />

        {/* 右侧活动表主容器 */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden p-3 sm:p-4 bg-slate-50/50">
          {activeTable ? (
            <TableHost
              key={workspace.activeStorageKey}
              tableDef={activeTable}
              storageKey={workspace.activeStorageKey}
              showToast={showToast}
              getLinkedTableData={workspace.getLinkedTableData}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              请选择或创建一张数据表
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-md bg-slate-900/90 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-lg animate-in fade-in duration-150">
          {toast}
        </div>
      )}
    </div>
  );
}

interface TableHostProps {
  tableDef: BitableTableDef;
  storageKey: string;
  showToast: (msg: string) => void;
  getLinkedTableData?: (targetTableId: string) => any;
}

function TableHost({ tableDef, storageKey, showToast, getLinkedTableData }: TableHostProps) {
  // 模拟后端：默认不接，点工具栏「接入模拟后端」才启用
  const [backendOn, setBackendOn] = useState(false);
  const backendRef = useRef<ReturnType<typeof createMemoryDataSource<any>> | null>(null);
  const dataRef = useRef<any[]>([]);
  const dataSource = backendOn ? backendRef.current ?? undefined : undefined;
  const [importOpen, setImportOpen] = useState(false);

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  const {
    data,
    groupedData,
    columns,
    viewColumns,
    views,
    activeView,
    activeViewId,
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
    insertRows,
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
    redoLabel,
    syncState,
    reloadFromSource,
    flushSync
  } = useBitable<any>({
    storageKey,
    initialData: tableDef.initialData,
    defaultColumns: tableDef.defaultColumns,
    presetViews: tableDef.presetViews,
    schemaVersion: tableDef.schemaVersion ?? 'v1',
    onHistoryToast: showToast,
    dataSource,
    getLinkedTableData,
    onSyncStateChange: (state) => {
      if (state.status === 'error') showToast(`同步失败：${state.error}`);
    }
  });

  dataRef.current = data;

  const toggleBackend = () => {
    if (backendOn) {
      backendRef.current = null;
      setBackendOn(false);
      showToast('已断开模拟后端，回到纯本地模式');
      return;
    }
    backendRef.current = createMemoryDataSource<any>(dataRef.current, { latency: 260 });
    setBackendOn(true);
    showToast('已接入模拟后端（260ms 延迟）：行数据与字段配置都会同步过去');
  };

  const syncTone =
    syncState.status === 'error'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : syncState.status === 'loading'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : syncState.pending > 0
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const syncLabel =
    syncState.status === 'error'
      ? '同步失败'
      : syncState.status === 'loading'
      ? '加载中…'
      : syncState.pending > 0
      ? `待同步 ${syncState.pending}`
      : '已同步';
  const syncIcon =
    syncState.status === 'error'
      ? 'cloud_off'
      : syncState.status === 'loading' || syncState.pending > 0
      ? 'cloud_sync'
      : 'cloud_done';

  const syncActions = (
    <div className="flex items-center gap-1.5">
      {backendOn && (
        <>
          <span
            className={`h-7 px-2 flex items-center gap-1 rounded border text-[11.5px] font-medium ${syncTone}`}
            title={
              syncState.error
                ? syncState.error
                : syncState.lastSyncedAt
                ? `上次同步 ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
                : '等待同步'
            }
          >
            <BitableIcon name={syncIcon as any} className="text-[14px] leading-none" />
            <span>{syncLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              void reloadFromSource();
              showToast('已从模拟后端重新拉取（验证往返一致）');
            }}
            className="h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11.5px] text-slate-600 cursor-pointer"
            title="从模拟后端重新拉取：能拉回来就说明写入确实落库了"
          >
            重新拉取
          </button>
          {syncState.status === 'error' && (
            <button
              type="button"
              onClick={() => void flushSync()}
              className="h-7 px-2 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11.5px] text-rose-700 cursor-pointer"
            >
              重试
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={toggleBackend}
        className={`h-7 px-2 rounded border text-[11.5px] cursor-pointer ${
          backendOn
            ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
            : 'border-[#005BAC]/40 bg-blue-50/60 hover:bg-blue-50 text-[#005BAC] font-medium'
        }`}
        title="演示数据源适配层：启用后行数据经 diff + 防抖写回，字段配置与视图整份覆盖"
      >
        {backendOn ? '断开后端' : '接入模拟后端'}
      </button>
    </div>
  );

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
    if (checked) data.forEach((row: any) => (next[row.id] = true));
    setCheckedIds(next);
  };

  const handleAddRecord = (count: number = 1, anchorRowId?: string | null) => {
    let targetAnchor = anchorRowId;
    if (targetAnchor === undefined) {
      const checkedList = Object.keys(checkedIds).filter((id) => checkedIds[id]);
      if (checkedList.length > 0) {
        const checkedSet = new Set(checkedList);
        for (let i = data.length - 1; i >= 0; i -= 1) {
          if (checkedSet.has(data[i].id)) {
            targetAnchor = data[i].id;
            break;
          }
        }
      } else if (selectedRowId && data.some((r: any) => r.id === selectedRowId)) {
        targetAnchor = selectedRowId;
      } else {
        targetAnchor = null;
      }
    }

    const primaryCol = columns[0];
    const inserted = insertRows(count, targetAnchor, 'below', (idx) => {
      if (!primaryCol) return {};
      return { [primaryCol.id]: `新记录 ${data.length + 1 + idx}` };
    });

    if (inserted && inserted.length > 0) {
      setFocusRowId(inserted[0].id);
      setSelectedRowId(inserted[0].id);
      showToast(
        targetAnchor
          ? `已在所选行后添加 ${count} 条记录`
          : `已在末尾添加 ${count} 条记录`
      );
    }
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
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* 视图页签 */}
      <BitableViewTabs
        views={views}
        activeViewId={activeViewId}
        onSelectView={(id) => {
          handleSelectView(id);
          const v = views.find((item) => item.id === id);
          if (v) showToast(`已切换到视图【${v.name}】`);
        }}
        onCreateView={(name, type) => {
          handleCreateView(name, type);
          showToast(`已创建视图【${name}】`);
        }}
        onRenameView={(id, newName) => {
          renameView(id, newName);
          showToast(`视图已更名为【${newName}】`);
        }}
        onDuplicateView={(id) => {
          const dup = duplicateView(id);
          showToast(`已复制为【${dup.name}】`);
        }}
        onDeleteView={(id) => {
          const ok = handleDeleteView(id);
          showToast(ok ? '已删除视图' : '主视图不可删除');
        }}
        onUpdateViewConfig={(id, updates) => {
          updateViewConfig(id, updates);
          showToast('视图配置已更新');
        }}
      />

      {/* 工具栏 */}
      <div className="px-3 pt-2">
        <BitableToolbar
          columns={columns}
          activeView={activeView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddRecord={handleAddRecord}
          onImport={() => setImportOpen(true)}
          onExport={(format) => {
            exportView(format);
            showToast(`已导出当前视图为 .${format}`);
          }}
          selectedRecordCount={selectedCount}
          selectedRowId={selectedRowId}
          selectedRowIds={Object.keys(checkedIds).filter((id) => checkedIds[id])}
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
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          extraActions={
            <div className="flex items-center gap-2">
              {syncActions}
              <button
                type="button"
                className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
                onClick={() => showToast('extraActions 支持插入业务定制按钮')}
              >
                <BitableIcon name="bolt" className="text-[14px]" />
                <span className="tb-label">快捷操作</span>
              </button>
            </div>
          }
        />
      </div>

      {/* 主表格渲染视图 */}
      <div className="flex-1 min-h-0 mt-2 px-3 pb-3">
        <BitableTable
          fillHeight
          columns={viewColumns}
          groupedData={groupedData}
          getLinkedTableData={getLinkedTableData}
          viewType={activeView.viewType}
          viewConfig={activeView}
          onUpdateViewConfig={(updates) => updateViewConfig(activeView.id, updates)}
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
          onPasteCells={(info) => {
            const truncated =
              info.rows < info.sourceRows || info.columns < info.sourceColumns
                ? `（剪贴板 ${info.sourceRows}×${info.sourceColumns}，超出部分已忽略）`
                : '';
            const skipped = info.skipped > 0 ? `，跳过 ${info.skipped} 个锁定格` : '';
            showToast(`已粘贴 ${info.rows}×${info.columns} 格${skipped}${truncated}`);
          }}
          onSelectRows={(ids) => {
            const next: Record<string, boolean> = {};
            ids.forEach((id) => (next[id] = true));
            setCheckedIds(next);
            showToast(`已选中 ${ids.length} 行`);
          }}
          onCreateRow={(values) => {
            addRow(values);
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

      {importOpen && (
        <BitableImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          existingColumns={columns}
          onImport={({ mode, columns: importedColumns, rows, sheetName }) => {
            const res = importTable({
              columns: importedColumns,
              rows,
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
    </div>
  );
}
