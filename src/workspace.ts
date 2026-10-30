/**
 * 多表容器（workspace）的注册表模型 —— 纯函数，无 React 依赖。
 *
 * 要解决的问题：`useBitable` 一个实例只服务一张表，`storageKey` 就是它的
 * 命名空间。一个平台页面通常有十几张表，需要「有哪些表、叫什么、什么顺序、
 * 当前在哪张」这一层元信息，而且这份元信息本身也要持久化（用户改了表名、
 * 加了新表、删了旧表，刷新后不能变回去）。
 *
 * 设计取舍：
 * - **代码定义 + 用户改动 = 运行时注册表**。表结构（列、视图、行）本来就由
 *   各自的 `storageKey` 命名空间独立存，这里只管「目录」——顺序、改名、新增、删除。
 * - 用户新建的表要能重建，所以它的 `initialData` / `defaultColumns` / `presetViews`
 *   跟着注册表一起存；列里的 `render` 回调属于代码资产，序列化时剔除
 *   （复用 schema.ts 的 `serializeColumns`）。
 * - 删除代码表只记 id，不删它的 `storageKey` 数据——误删后重新加回来数据还在。
 */
import type { BitableColumnConfig, BitableViewConfig } from './types';
import type { BitableDataSource } from './dataSource';
import { serializeColumns } from './schema';

/** 一张表的完整定义（交给 useBitable 的那一套） */
export interface BitableTableDef<T extends { id: string } = any> {
  id: string;
  /** 侧边栏显示名 */
  label: string;
  /** material symbols 图标名，默认 table_chart */
  icon?: string;
  description?: string;
  initialData: T[];
  defaultColumns: BitableColumnConfig<T>[];
  presetViews: BitableViewConfig[];
  /** 每张表可以接不同的后端 */
  dataSource?: BitableDataSource<T>;
  /** 该表的结构版本号 */
  schemaVersion?: string;
  /** 用户新建的表（代码里没有定义，靠注册表快照重建） */
  isCustom?: boolean;
  /** 所属文件夹 ID，null 或 undefined 表示顶层根目录 */
  folderId?: string | null;
}

/** 文件夹定义：支持多层级嵌套 */
export interface BitableWorkspaceFolder {
  id: string;
  name: string;
  /** 父文件夹 ID，null 或 undefined 表示顶层根目录 */
  parentId?: string | null;
  /** 图标，默认 'folder' */
  icon?: string;
}

/** 可持久化的表定义：函数字段已剔除 */
export interface SerializedTableDef {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  initialData: unknown[];
  defaultColumns: BitableColumnConfig<any>[];
  presetViews: BitableViewConfig[];
  schemaVersion?: string;
  folderId?: string | null;
}

/** 注册表快照，落到 `${workspaceKey}_workspace` */
export interface BitableWorkspaceSnapshot {
  version: 1;
  /** 全部表 id 与文件夹 id 的顺序（代码表 + 自定义表 + 文件夹混排） */
  order: string[];
  /** 用户改过的表名 / 图标 */
  meta: Record<string, { label?: string; icon?: string }>;
  /** 用户删掉的代码表 id */
  deleted: string[];
  /** 用户新建的表 */
  custom: SerializedTableDef[];
  activeTableId?: string;
  /** 文件夹列表 */
  folders?: BitableWorkspaceFolder[];
  /** 表所属文件夹映射：tableId -> folderId (null 表示顶层) */
  tableFolders?: Record<string, string | null>;
  /** 文件夹折叠状态映射：folderId -> boolean (true 为折叠) */
  folderCollapsed?: Record<string, boolean>;
}

export const EMPTY_WORKSPACE_SNAPSHOT: BitableWorkspaceSnapshot = {
  version: 1,
  order: [],
  meta: {},
  deleted: [],
  custom: [],
  folders: [],
  tableFolders: {},
  folderCollapsed: {}
};

/** 生成表 id：时间戳 + 随机后缀，避免同一毫秒内连点两次撞号 */
export function createTableId(prefix = 'tbl'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 生成文件夹 id */
export function createFolderId(prefix = 'fld'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 每张表自己的 localStorage 命名空间 */
export function tableStorageKey(workspaceKey: string, tableId: string): string {
  return `${workspaceKey}_${tableId}`;
}

export function serializeTableDef(def: BitableTableDef): SerializedTableDef {
  return {
    id: def.id,
    label: def.label,
    icon: def.icon,
    description: def.description,
    initialData: def.initialData as unknown[],
    defaultColumns: serializeColumns(def.defaultColumns),
    presetViews: def.presetViews,
    schemaVersion: def.schemaVersion,
    folderId: def.folderId
  };
}

export function deserializeTableDef(saved: SerializedTableDef): BitableTableDef {
  return {
    id: saved.id,
    label: saved.label,
    icon: saved.icon,
    description: saved.description,
    initialData: (saved.initialData ?? []) as any[],
    defaultColumns: saved.defaultColumns ?? [],
    presetViews: saved.presetViews ?? [],
    schemaVersion: saved.schemaVersion,
    folderId: saved.folderId,
    isCustom: true
  };
}

/** 校验从 localStorage / 后端读出来的快照，坏数据一律当空处理 */
export function normalizeSnapshot(raw: unknown): BitableWorkspaceSnapshot {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WORKSPACE_SNAPSHOT };
  const s = raw as Partial<BitableWorkspaceSnapshot>;
  return {
    version: 1,
    order: Array.isArray(s.order) ? s.order.filter((x): x is string => typeof x === 'string') : [],
    meta: s.meta && typeof s.meta === 'object' ? s.meta : {},
    deleted: Array.isArray(s.deleted) ? s.deleted.filter((x): x is string => typeof x === 'string') : [],
    custom: Array.isArray(s.custom) ? s.custom.filter((x) => x && typeof x.id === 'string') : [],
    activeTableId: typeof s.activeTableId === 'string' ? s.activeTableId : undefined,
    folders: Array.isArray(s.folders)
      ? s.folders.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
      : [],
    tableFolders: s.tableFolders && typeof s.tableFolders === 'object' ? s.tableFolders : {},
    folderCollapsed: s.folderCollapsed && typeof s.folderCollapsed === 'object' ? s.folderCollapsed : {}
  };
}

/**
 * 把「代码定义的表」与「用户改动」合成运行时注册表。
 *
 * 顺序规则：以 `order` 为准；`order` 里没提到的代码表按代码顺序追加到末尾
 * （这样代码新增表后老用户也能看到，而不是被旧快照挡住）。
 */
export function resolveTableRegistry(
  codeTables: BitableTableDef[],
  snapshot: BitableWorkspaceSnapshot
): BitableTableDef[] {
  const deleted = new Set(snapshot.deleted);
  const byId = new Map<string, BitableTableDef>();

  codeTables.forEach((t) => {
    if (!deleted.has(t.id)) byId.set(t.id, t);
  });
  snapshot.custom.forEach((ser) => {
    if (!deleted.has(ser.id) && !byId.has(ser.id)) byId.set(ser.id, deserializeTableDef(ser));
  });

  const ordered: BitableTableDef[] = [];
  const used = new Set<string>();
  snapshot.order.forEach((id) => {
    const def = byId.get(id);
    if (def && !used.has(id)) {
      ordered.push(def);
      used.add(id);
    }
  });
  codeTables.forEach((t) => {
    if (byId.has(t.id) && !used.has(t.id)) {
      ordered.push(byId.get(t.id)!);
      used.add(t.id);
    }
  });
  // 自定义表不在 order 里（理论上不该发生）也要兜住
  snapshot.custom.forEach((ser) => {
    const def = byId.get(ser.id);
    if (def && !used.has(ser.id)) {
      ordered.push(def);
      used.add(ser.id);
    }
  });

  return ordered.map((t) => {
    const patch = snapshot.meta[t.id];
    const folderId = snapshot.tableFolders?.[t.id] ?? t.folderId ?? null;
    return {
      ...t,
      label: patch?.label ?? t.label,
      icon: patch?.icon ?? t.icon,
      folderId
    };
  });
}

/** 当前激活的表：快照里的 id 还有效就用它，否则回落到第一张 */
export function resolveActiveTableId(
  tables: BitableTableDef[],
  snapshot: BitableWorkspaceSnapshot
): string {
  if (snapshot.activeTableId && tables.some((t) => t.id === snapshot.activeTableId)) {
    return snapshot.activeTableId;
  }
  return tables[0]?.id ?? '';
}

export function setActiveTable(
  snapshot: BitableWorkspaceSnapshot,
  tableId: string
): BitableWorkspaceSnapshot {
  return { ...snapshot, activeTableId: tableId };
}

/** 改名：代码表记进 meta（不污染代码定义），自定义表直接改 */
export function renameTable(
  snapshot: BitableWorkspaceSnapshot,
  tableId: string,
  label: string
): BitableWorkspaceSnapshot {
  const trimmed = label.trim();
  if (!trimmed) return snapshot;
  const custom = snapshot.custom.map((t) => (t.id === tableId ? { ...t, label: trimmed } : t));
  const isCustom = snapshot.custom.some((t) => t.id === tableId);
  if (isCustom) return { ...snapshot, custom };
  return {
    ...snapshot,
    meta: { ...snapshot.meta, [tableId]: { ...snapshot.meta[tableId], label: trimmed } }
  };
}

/** 新增自定义表：追加到末尾并设为当前表 */
export function addTable(
  snapshot: BitableWorkspaceSnapshot,
  def: BitableTableDef
): BitableWorkspaceSnapshot {
  const serialized = serializeTableDef(def);
  const tableFolders = {
    ...(snapshot.tableFolders ?? {}),
    ...(def.folderId !== undefined ? { [def.id]: def.folderId } : {})
  };
  return {
    ...snapshot,
    order: [...snapshot.order.filter((id) => id !== def.id), def.id],
    custom: [...snapshot.custom.filter((t) => t.id !== def.id), serialized],
    deleted: snapshot.deleted.filter((id) => id !== def.id),
    tableFolders,
    activeTableId: def.id
  };
}

/**
 * 删除表。
 * - 代码表：记进 `deleted`（下次解析时过滤掉），重新加回只需把 id 从 deleted 移除；
 * - 自定义表：从 custom 与 order 里摘掉；
 * - **不删该表 storageKey 下的数据**，误删可恢复。
 */
export function removeTable(
  snapshot: BitableWorkspaceSnapshot,
  tableId: string
): BitableWorkspaceSnapshot {
  const isCustom = snapshot.custom.some((t) => t.id === tableId);
  const next: BitableWorkspaceSnapshot = {
    ...snapshot,
    order: snapshot.order.filter((id) => id !== tableId),
    custom: snapshot.custom.filter((t) => t.id !== tableId),
    deleted: isCustom ? snapshot.deleted : Array.from(new Set([...snapshot.deleted, tableId]))
  };
  const { [tableId]: _dropped, ...restMeta } = next.meta;
  const { [tableId]: _droppedTblFolder, ...restTableFolders } = next.tableFolders ?? {};
  return {
    ...next,
    meta: restMeta,
    tableFolders: restTableFolders,
    activeTableId: next.activeTableId === tableId ? undefined : next.activeTableId
  };
}

/** 移动表位置（侧边栏拖拽 / 上移下移都走它） */
export function moveTable(
  snapshot: BitableWorkspaceSnapshot,
  fromIndex: number,
  toIndex: number,
  currentOrder: string[]
): BitableWorkspaceSnapshot {
  const order = [...currentOrder];
  if (fromIndex < 0 || fromIndex >= order.length) return snapshot;
  const target = Math.max(0, Math.min(order.length - 1, toIndex));
  const [moved] = order.splice(fromIndex, 1);
  order.splice(target, 0, moved);
  return { ...snapshot, order };
}

// ==========================================
// 文件夹与多层级分组逻辑 (Folder & Hierarchy)
// ==========================================

/** 新建文件夹 */
export function addFolder(
  snapshot: BitableWorkspaceSnapshot,
  input: { name: string; parentId?: string | null; icon?: string }
): { snapshot: BitableWorkspaceSnapshot; folderId: string } {
  const folderId = createFolderId();
  const trimmedName = input.name.trim() || '新建文件夹';
  const newFolder: BitableWorkspaceFolder = {
    id: folderId,
    name: trimmedName,
    parentId: input.parentId ?? null,
    icon: input.icon || 'folder'
  };

  const folders = [...(snapshot.folders ?? []), newFolder];
  const order = [...snapshot.order, folderId];

  return {
    snapshot: {
      ...snapshot,
      folders,
      order
    },
    folderId
  };
}

/** 重命名文件夹 */
export function renameFolder(
  snapshot: BitableWorkspaceSnapshot,
  folderId: string,
  name: string
): BitableWorkspaceSnapshot {
  const trimmed = name.trim();
  if (!trimmed) return snapshot;
  const folders = (snapshot.folders ?? []).map((f) =>
    f.id === folderId ? { ...f, name: trimmed } : f
  );
  return { ...snapshot, folders };
}

/**
 * 删除文件夹。
 * 为避免误删数据：
 * - 其包含的子文件夹及数据表，会自动提升到被删除文件夹的上一层（父级或顶层）；
 * - 移出 folder 集合与折叠状态。
 */
export function removeFolder(
  snapshot: BitableWorkspaceSnapshot,
  folderId: string
): BitableWorkspaceSnapshot {
  const currentFolder = (snapshot.folders ?? []).find((f) => f.id === folderId);
  const targetParentId = currentFolder?.parentId ?? null;

  // 子文件夹提升到上一级
  const folders = (snapshot.folders ?? [])
    .filter((f) => f.id !== folderId)
    .map((f) => (f.parentId === folderId ? { ...f, parentId: targetParentId } : f));

  // 文件夹下的表提升到上一级
  const tableFolders = { ...(snapshot.tableFolders ?? {}) };
  Object.keys(tableFolders).forEach((tblId) => {
    if (tableFolders[tblId] === folderId) {
      tableFolders[tblId] = targetParentId;
    }
  });

  const order = snapshot.order.filter((id) => id !== folderId);
  const { [folderId]: _dropped, ...restCollapsed } = snapshot.folderCollapsed ?? {};

  return {
    ...snapshot,
    folders,
    tableFolders,
    order,
    folderCollapsed: restCollapsed
  };
}

/** 折叠 / 展开文件夹 */
export function toggleFolderCollapsed(
  snapshot: BitableWorkspaceSnapshot,
  folderId: string
): BitableWorkspaceSnapshot {
  const prev = snapshot.folderCollapsed?.[folderId] ?? false;
  return {
    ...snapshot,
    folderCollapsed: {
      ...(snapshot.folderCollapsed ?? {}),
      [folderId]: !prev
    }
  };
}

/** 检查 targetFolderId 是否是 folderId 或其后代子文件夹（避免自环嵌套） */
export function isFolderDescendant(
  folders: BitableWorkspaceFolder[],
  folderId: string,
  targetFolderId: string
): boolean {
  if (folderId === targetFolderId) return true;
  let cursor = folders.find((f) => f.id === targetFolderId);
  for (let i = 0; i < 50; i += 1) {
    if (!cursor || !cursor.parentId) break;
    if (cursor.parentId === folderId) return true;
    cursor = folders.find((f) => f.id === cursor!.parentId);
  }
  return false;
}

/** 将表移动到指定文件夹（targetFolderId 为 null 时移到顶层） */
export function moveTableToFolder(
  snapshot: BitableWorkspaceSnapshot,
  tableId: string,
  targetFolderId: string | null
): BitableWorkspaceSnapshot {
  const tableFolders = {
    ...(snapshot.tableFolders ?? {}),
    [tableId]: targetFolderId
  };
  return { ...snapshot, tableFolders };
}

/** 将文件夹移动到指定父文件夹下（targetFolderId 为 null 时移到顶层） */
export function moveFolderToFolder(
  snapshot: BitableWorkspaceSnapshot,
  folderId: string,
  targetFolderId: string | null
): BitableWorkspaceSnapshot {
  if (targetFolderId && isFolderDescendant(snapshot.folders ?? [], folderId, targetFolderId)) {
    return snapshot; // 阻止嵌套进自身或子孙文件夹
  }
  const folders = (snapshot.folders ?? []).map((f) =>
    f.id === folderId ? { ...f, parentId: targetFolderId } : f
  );
  return { ...snapshot, folders };
}

/**
 * 拖拽排序：将某个 item（数据表或文件夹）移至目标 item 之前或之后
 */
export function reorderWorkspaceItems(
  snapshot: BitableWorkspaceSnapshot,
  dragId: string,
  targetId: string,
  position: 'before' | 'after'
): BitableWorkspaceSnapshot {
  if (!dragId || !targetId || dragId === targetId) return snapshot;
  const currentOrder = [...snapshot.order];
  const fromIdx = currentOrder.indexOf(dragId);
  if (fromIdx < 0) return snapshot;

  currentOrder.splice(fromIdx, 1);
  const targetIdx = currentOrder.indexOf(targetId);
  const insertIdx = targetIdx < 0
    ? currentOrder.length
    : position === 'before'
    ? targetIdx
    : targetIdx + 1;

  currentOrder.splice(insertIdx, 0, dragId);
  return { ...snapshot, order: currentOrder };
}
