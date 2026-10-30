import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BitableColumnConfig, BitableViewConfig } from './types';
import {
  addFolder as addFolderToSnapshot,
  addTable as addTableToSnapshot,
  createFolderId,
  createTableId,
  moveFolderToFolder as moveFolderInSnapshot,
  moveTable as moveTableInSnapshot,
  moveTableToFolder as moveTableToFolderInSnapshot,
  normalizeSnapshot,
  removeFolder as removeFolderFromSnapshot,
  removeTable as removeTableFromSnapshot,
  renameFolder as renameFolderInSnapshot,
  renameTable as renameTableInSnapshot,
  reorderWorkspaceItems,
  resolveActiveTableId,
  resolveTableRegistry,
  setActiveTable,
  tableStorageKey,
  toggleFolderCollapsed as toggleFolderCollapsedInSnapshot
} from './workspace';
import type {
  BitableTableDef,
  BitableWorkspaceFolder,
  BitableWorkspaceSnapshot
} from './workspace';

export interface UseBitableWorkspaceOptions {
  /** workspace 命名空间，所有表都存在 `${workspaceKey}_${tableId}` 下 */
  workspaceKey: string;
  /** 代码里定义的表。用户改名/排序/删除都记在快照里，不改这个数组 */
  tables: BitableTableDef[];
  /** 首次进入时想打开哪张表（快照里没有有效记录时用） */
  initialActiveTableId?: string;
}

export interface UseBitableWorkspaceResult {
  /** 合并后的表目录（已应用用户的顺序、改名、增删、所属文件夹） */
  tables: BitableTableDef[];
  activeTableId: string;
  activeTable: BitableTableDef | undefined;
  /** 当前表对应的 storageKey，直接传给 useBitable */
  activeStorageKey: string;
  /** 任意表的 storageKey */
  getStorageKey: (tableId: string) => string;
  /** 跨表关联数据解析器（传递给 useBitable 或 BitableTable） */
  getLinkedTableData: (tableId: string) => {
    id?: string;
    label?: string;
    columns: BitableColumnConfig<any>[];
    data: any[];
  } | undefined;
  setActiveTableId: (tableId: string) => void;
  /** 新建表并自动切过去，返回新表 id */
  addTable: (input: {
    label: string;
    icon?: string;
    description?: string;
    initialData?: any[];
    defaultColumns?: BitableColumnConfig<any>[];
    presetViews?: BitableViewConfig[];
    folderId?: string | null;
  }) => string;
  renameTable: (tableId: string, label: string) => void;
  /** 删除表。不删该表的 localStorage 数据，误删后加回来数据还在 */
  removeTable: (tableId: string) => boolean;
  moveTable: (fromIndex: number, toIndex: number) => void;
  /** 把代码里删掉的表恢复回来（只对代码定义的表有效） */
  restoreTable: (tableId: string) => void;

  // —— 文件夹与多层级分组 ——
  folders: BitableWorkspaceFolder[];
  folderCollapsed: Record<string, boolean>;
  addFolder: (input: { name: string; parentId?: string | null; icon?: string }) => string;
  renameFolder: (folderId: string, name: string) => void;
  removeFolder: (folderId: string) => void;
  toggleFolderCollapsed: (folderId: string) => void;
  moveTableToFolder: (tableId: string, targetFolderId: string | null) => void;
  moveFolderToFolder: (folderId: string, targetFolderId: string | null) => void;
  reorderItems: (dragId: string, targetId: string, position: 'before' | 'after') => void;
}

/** 新表的默认结构：编号 + 名称 + 状态 + 创建时间，够用又不喧宾夺主 */
export function createDefaultTableContent(): {
  initialData: any[];
  defaultColumns: BitableColumnConfig<any>[];
  presetViews: BitableViewConfig[];
} {
  return {
    initialData: [],
    defaultColumns: [
      { id: 'name', label: '名称', type: 'text', visible: true, editable: true, required: true },
      {
        id: 'status',
        label: '状态',
        type: 'select',
        visible: true,
        editable: true,
        options: [
          { label: '待开始', value: '待开始', color: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: '进行中', value: '进行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: '已完成', value: '已完成', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        ]
      },
      { id: 'createdAt', label: '创建时间', type: 'date', visible: true, editable: true }
    ],
    presetViews: [
      {
        id: 'all',
        name: '总表',
        icon: 'grid_on',
        viewType: 'grid',
        scope: 'collaborative',
        filterLogic: 'AND',
        filterRules: [],
        sortRules: [],
        groupByFieldId: null,
        density: 'medium',
        colorRules: [],
        visibleColumnIds: ['name', 'status', 'createdAt'],
        columnOrder: ['name', 'status', 'createdAt']
      }
    ]
  };
}

/**
 * 多表容器的目录层。
 *
 * 它只负责「有哪些表 / 叫什么 / 什么顺序 / 当前在哪张」，每张表的行、列、视图
 * 仍由 `useBitable` 按各自的 `storageKey` 独立管理。这样：
 * - 不需要把 `useBitable` 改成类 / 外部 store，hook 规则也不会因为表的增删被破坏；
 * - 切表就是换 `storageKey`，`useBitable` 已有的重置逻辑直接复用；
 * - 每张表可以接不同的 `dataSource`。
 */
export function useBitableWorkspace({
  workspaceKey,
  tables: codeTables,
  initialActiveTableId
}: UseBitableWorkspaceOptions): UseBitableWorkspaceResult {
  const storageKey = `${workspaceKey}_workspace`;

  const readSnapshot = useCallback((): BitableWorkspaceSnapshot => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (raw) return normalizeSnapshot(JSON.parse(raw));
    } catch {
      // ignore
    }
    return normalizeSnapshot(null);
  }, [storageKey]);

  const [snapshot, setSnapshot] = useState<BitableWorkspaceSnapshot>(readSnapshot);

  // 换 workspace 时整体重读（与 useBitable 的 storageKey 重置同一套思路）
  const prevKeyRef = useRef(storageKey);
  useEffect(() => {
    if (prevKeyRef.current === storageKey) return;
    prevKeyRef.current = storageKey;
    setSnapshot(readSnapshot());
  }, [storageKey, readSnapshot]);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(snapshot));
      }
    } catch {
      // ignore
    }
  }, [snapshot, storageKey]);

  const resolved = useMemo(() => resolveTableRegistry(codeTables, snapshot), [codeTables, snapshot]);

  const activeTableId = useMemo(() => {
    const bySnapshot = resolveActiveTableId(resolved, snapshot);
    if (bySnapshot) return bySnapshot;
    if (initialActiveTableId && resolved.some((t) => t.id === initialActiveTableId)) {
      return initialActiveTableId;
    }
    return resolved[0]?.id ?? '';
  }, [resolved, snapshot, initialActiveTableId]);

  const activeTable = useMemo(
    () => resolved.find((t) => t.id === activeTableId),
    [resolved, activeTableId]
  );

  const setActiveTableId = useCallback((tableId: string) => {
    setSnapshot((prev) => setActiveTable(prev, tableId));
  }, []);

  const addTable = useCallback(
    (input: Parameters<UseBitableWorkspaceResult['addTable']>[0]): string => {
      const content = createDefaultTableContent();
      const id = createTableId();
      const def: BitableTableDef = {
        id,
        label: input.label.trim() || '未命名表',
        icon: input.icon ?? 'table_chart',
        description: input.description,
        initialData: input.initialData ?? content.initialData,
        defaultColumns: input.defaultColumns ?? content.defaultColumns,
        presetViews: input.presetViews ?? content.presetViews,
        folderId: input.folderId,
        isCustom: true
      };
      setSnapshot((prev) => addTableToSnapshot(prev, def));
      return id;
    },
    []
  );

  const renameTable = useCallback((tableId: string, label: string) => {
    setSnapshot((prev) => renameTableInSnapshot(prev, tableId, label));
  }, []);

  const removeTable = useCallback(
    (tableId: string): boolean => {
      // 最后一张表不允许删：容器没有「零张表」的状态
      if (resolved.length <= 1) return false;
      setSnapshot((prev) => removeTableFromSnapshot(prev, tableId));
      return true;
    },
    [resolved.length]
  );

  const moveTable = useCallback(
    (fromIndex: number, toIndex: number) => {
      const currentOrder = resolved.map((t) => t.id);
      setSnapshot((prev) => moveTableInSnapshot(prev, fromIndex, toIndex, currentOrder));
    },
    [resolved]
  );

  const restoreTable = useCallback((tableId: string) => {
    setSnapshot((prev) => ({
      ...prev,
      deleted: prev.deleted.filter((id) => id !== tableId)
    }));
  }, []);

  const addFolder = useCallback(
    (input: { name: string; parentId?: string | null; icon?: string }): string => {
      let createdId = '';
      setSnapshot((prev) => {
        const res = addFolderToSnapshot(prev, input);
        createdId = res.folderId;
        return res.snapshot;
      });
      return createdId;
    },
    []
  );

  const renameFolder = useCallback((folderId: string, name: string) => {
    setSnapshot((prev) => renameFolderInSnapshot(prev, folderId, name));
  }, []);

  const removeFolder = useCallback((folderId: string) => {
    setSnapshot((prev) => removeFolderFromSnapshot(prev, folderId));
  }, []);

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setSnapshot((prev) => toggleFolderCollapsedInSnapshot(prev, folderId));
  }, []);

  const moveTableToFolder = useCallback((tableId: string, targetFolderId: string | null) => {
    setSnapshot((prev) => moveTableToFolderInSnapshot(prev, tableId, targetFolderId));
  }, []);

  const moveFolderToFolder = useCallback((folderId: string, targetFolderId: string | null) => {
    setSnapshot((prev) => moveFolderInSnapshot(prev, folderId, targetFolderId));
  }, []);

  const reorderItems = useCallback(
    (dragId: string, targetId: string, position: 'before' | 'after') => {
      setSnapshot((prev) => reorderWorkspaceItems(prev, dragId, targetId, position));
    },
    []
  );

  const getStorageKey = useCallback(
    (tableId: string) => tableStorageKey(workspaceKey, tableId),
    [workspaceKey]
  );

  const getLinkedTableData = useCallback(
    (targetTableId: string) => {
      const def = resolved.find((t) => t.id === targetTableId);
      if (!def) return undefined;

      const key = tableStorageKey(workspaceKey, targetTableId);
      let data = def.initialData;
      let columns = def.defaultColumns;

      try {
        if (typeof localStorage !== 'undefined') {
          const savedData = localStorage.getItem(`${key}_data`);
          if (savedData) data = JSON.parse(savedData);
          const savedCols = localStorage.getItem(`${key}_columns`);
          if (savedCols) columns = JSON.parse(savedCols);
        }
      } catch {
        // 容错降级使用初始定义
      }

      return {
        id: def.id,
        label: def.label,
        columns,
        data
      };
    },
    [resolved, workspaceKey]
  );

  return {
    tables: resolved,
    activeTableId,
    activeTable,
    activeStorageKey: tableStorageKey(workspaceKey, activeTableId),
    getStorageKey,
    getLinkedTableData,
    setActiveTableId,
    addTable,
    renameTable,
    removeTable,
    moveTable,
    restoreTable,
    folders: snapshot.folders ?? [],
    folderCollapsed: snapshot.folderCollapsed ?? {},
    addFolder,
    renameFolder,
    removeFolder,
    toggleFolderCollapsed,
    moveTableToFolder,
    moveFolderToFolder,
    reorderItems
  };
}
