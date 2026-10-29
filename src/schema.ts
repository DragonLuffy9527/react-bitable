/**
 * 列配置 / 视图的持久化模型（纯函数，无 React 依赖）。
 *
 * 为什么单独抽一层：
 * 列配置有两份来源——代码里的 `defaultColumns`（带 render 回调）和存储里的
 * 用户改动（改名、调宽、隐藏、排序、自定义列）。两者必须按 id 合并，且
 * 「代码升级」时要能判断该不该回落。这套合并逻辑原本只存在于 useBitable 的
 * `loadColumns()` 里，接后端后远端 schema 也要走同一套规则；如果各写一份，
 * 本地与远端就会出现两种行为（典型症状：本地改名生效、换台机器改名丢失）。
 *
 * 这里只做「合并与序列化」，不碰 localStorage，也不发请求。
 */
import type { BitableColumnConfig, BitableViewConfig } from './types';

/** 一份可 JSON 传输的表结构快照 */
export interface BitableSchemaSnapshot {
  /** 列配置。函数型字段（render / resolveFiles）在序列化时已剔除 */
  columns: BitableColumnConfig<any>[];
  views: BitableViewConfig[];
  activeViewId?: string;
  /** 用户删掉的默认列 id：代码升级补回默认列时不能再补回来 */
  deletedColumnIds?: string[];
  /** 显式锁定的列 id。单独存是因为历史版本把 editable:false 误写成 isLocked */
  lockedColumnIds?: string[];
  /** 写入时的结构版本号，读取方据此判断是否需要整体回落到代码定义 */
  schemaVersion?: string;
  /** 更新时间戳，仅用于排查问题 */
  updatedAt?: number;
}

/** 列配置里不能序列化的字段（函数） */
const FUNCTION_FIELDS = ['render', 'resolveFiles'] as const;

/**
 * 去掉列配置里的函数字段。
 * 直接 `JSON.stringify` 也会丢函数，但那样得到的是 `any`，而且漏掉「显式
 * 声明了函数字段」这件事；这里显式剔除，返回类型仍是列配置，调用方不用断言。
 */
export function serializeColumns<T>(columns: BitableColumnConfig<T>[]): BitableColumnConfig<T>[] {
  return columns.map((col) => {
    const copy: Record<string, unknown> = { ...col };
    for (const key of FUNCTION_FIELDS) delete copy[key];
    return copy as unknown as BitableColumnConfig<T>;
  });
}

export interface BuildSchemaOptions<T> {
  columns: BitableColumnConfig<T>[];
  views: BitableViewConfig[];
  activeViewId?: string;
  /** 用户删掉的默认列 id（删除记录不在 columns 里，只能由调用方传入） */
  deletedColumnIds?: string[];
  schemaVersion?: string;
}

/** 把运行时状态压成可传输的快照 */
export function buildSchema<T>({
  columns,
  views,
  activeViewId,
  deletedColumnIds,
  schemaVersion
}: BuildSchemaOptions<T>): BitableSchemaSnapshot {
  const lockedColumnIds = columns.filter((c) => c.isLocked).map((c) => c.id);
  return {
    columns: serializeColumns(columns),
    views,
    activeViewId,
    deletedColumnIds,
    lockedColumnIds: lockedColumnIds.length > 0 ? lockedColumnIds : undefined,
    schemaVersion,
    updatedAt: Date.now()
  };
}

export interface MergeColumnsOptions<T> {
  /** 代码里定义的列（带 render / resolveFiles 等运行时字段） */
  defaultColumns: BitableColumnConfig<T>[];
  /** 用户删掉的默认列 id */
  deletedIds?: Set<string>;
  /** 显式锁定的列 id；为 null 表示「没有独立记录」，此时只信代码默认 */
  lockedIds?: Set<string> | null;
  /**
   * 存下来的结构版本号与当前代码版本不一致。
   * 为 true 时默认列整体回落到代码定义（用户自定义列保留）。
   */
  schemaStale?: boolean;
}

/**
 * 把存储里的列配置合并到代码定义上。
 *
 * 规则（与历史行为一致，改动前请先想清楚会影响谁）：
 * - 代码里已经没有的默认列：丢弃。否则 render 找不到，会渲染成一列空白；
 * - 用户自定义列：保留（除非被删除）；
 * - 代码新增的默认列：追加到末尾（除非被删除）；
 * - 改名以存储为准；类型以存储为准；用户改过类型时，代码里那份类型专属的
 *   render 必须失效，否则展示层还是旧外观、编辑器和展示各说各话；
 * - `editable` 只信代码（是否可编辑是产品规则，不是用户偏好）；
 * - `isLocked` 优先信独立记录，没有独立记录时只信代码默认。
 */
export function mergeColumns<T>(
  saved: BitableColumnConfig<T>[] | null | undefined,
  { defaultColumns, deletedIds, lockedIds, schemaStale }: MergeColumnsOptions<T>
): BitableColumnConfig<T>[] {
  const deleted = deletedIds ?? new Set<string>();
  const list = Array.isArray(saved) ? saved : [];

  if (list.length === 0) {
    return defaultColumns.filter((d) => !deleted.has(d.id));
  }

  // 结构升级：默认列整体回落到代码定义，只保留用户自定义列
  if (schemaStale) {
    const customs = list.filter((c) => c.isCustom && !deleted.has(c.id));
    return [...defaultColumns.filter((d) => !deleted.has(d.id)), ...customs];
  }

  const existingIds = new Set(list.map((c) => c.id));
  const missingDefaults = defaultColumns.filter((d) => !existingIds.has(d.id) && !deleted.has(d.id));

  const merged = list
    .filter(
      (col) =>
        !deleted.has(col.id) &&
        // 代码侧已经删掉/替换掉的默认列不能再留着
        (col.isCustom || defaultColumns.some((d) => d.id === col.id))
    )
    .map((col) => {
      const original = defaultColumns.find((d) => d.id === col.id);
      const isLocked = lockedIds ? lockedIds.has(col.id) : original?.isLocked ?? false;
      const isEditable = original?.editable ?? true;
      const resolvedLabel = col.label || original?.label || '';
      const resolvedType = col.type || original?.type || 'text';
      const typeChangedByUser = !!original && resolvedType !== original.type;

      return {
        ...original,
        ...col,
        label: resolvedLabel,
        isLocked,
        editable: isEditable,
        type: resolvedType,
        render: typeChangedByUser ? undefined : original?.render,
        options: col.options || original?.options
      };
    });

  return [...merged, ...missingDefaults];
}

/** 单个视图的兜底字段（老数据缺字段时补齐） */
export function normalizeView(v: BitableViewConfig): BitableViewConfig {
  return {
    ...v,
    viewType: v.viewType || 'grid',
    scope: v.scope || 'collaborative',
    isLocked: !!v.isLocked,
    hiddenFieldIds: Array.isArray(v.hiddenFieldIds) ? v.hiddenFieldIds : [],
    groupRules:
      v.groupRules && v.groupRules.length > 0
        ? v.groupRules
        : v.groupByFieldId
          ? [{ id: 'rule-legacy', fieldId: v.groupByFieldId, direction: 'asc' as const }]
          : []
  };
}

/** 历史版本里「总表」用过这些名字，识别出来并统一成第 0 个页签 */
const LEGACY_MASTER_NAMES = ['总表', '全部图纸总表', '全部版本总表', '全部 PS 文件'];

/** 预设视图：补兜底字段，并强制第 0 个是协作视图 */
export function normalizePresetViews(presets: BitableViewConfig[]): BitableViewConfig[] {
  const normalized = presets.map(normalizeView);
  if (normalized.length > 0) {
    normalized[0] = { ...normalized[0], scope: 'collaborative' };
  }
  return normalized;
}

/**
 * 合并存储里的视图列表：兜底字段 + 把「总表」提到第一位。
 * 存储为空时回落到预设。
 */
export function mergeViews(
  saved: BitableViewConfig[] | null | undefined,
  presets: BitableViewConfig[]
): BitableViewConfig[] {
  const list = Array.isArray(saved) ? saved : [];
  if (list.length === 0) return normalizePresetViews(presets);

  const parsed = list.map((v) => ({ ...v }));
  const masterPreset = presets[0];
  if (masterPreset) {
    const masterIdx = parsed.findIndex(
      (v) => v.id === masterPreset.id || LEGACY_MASTER_NAMES.includes(v.name)
    );
    if (masterIdx >= 0) {
      const masterItem = { ...parsed[masterIdx], name: '总表', icon: 'grid_on' };
      parsed.splice(masterIdx, 1);
      parsed.unshift(masterItem);
    } else {
      parsed.unshift({ ...masterPreset, name: '总表', icon: 'grid_on' });
    }
  }

  const normalized = parsed.map(normalizeView);
  // 系统总表固定为协作视图，历史数据若被存成个人视图则强制纠回
  if (normalized.length > 0) {
    normalized[0] = { ...normalized[0], scope: 'collaborative' };
  }
  return normalized;
}

export interface ApplySchemaOptions<T> {
  defaultColumns: BitableColumnConfig<T>[];
  presetViews: BitableViewConfig[];
  /** 当前代码的结构版本号 */
  schemaVersion?: string;
}

export interface ResolvedSchema<T> {
  columns: BitableColumnConfig<T>[];
  views: BitableViewConfig[];
  activeViewId: string;
}

/**
 * 把远端 schema 落到运行时状态。
 * 与本地读取共用 mergeColumns / mergeViews，保证「本地改名」和「远端改名」行为一致。
 */
export function applySchema<T>(
  schema: BitableSchemaSnapshot,
  { defaultColumns, presetViews, schemaVersion }: ApplySchemaOptions<T>
): ResolvedSchema<T> {
  const schemaStale =
    !!schema.schemaVersion && !!schemaVersion && schema.schemaVersion !== schemaVersion;

  const columns = mergeColumns(schema.columns as BitableColumnConfig<T>[], {
    defaultColumns,
    deletedIds: new Set(schema.deletedColumnIds ?? []),
    lockedIds: schema.lockedColumnIds ? new Set(schema.lockedColumnIds) : null,
    schemaStale
  });

  const views = schemaStale ? presetViews.map((v) => ({ ...v })) : mergeViews(schema.views, presetViews);

  const activeViewId =
    schema.activeViewId && views.some((v) => v.id === schema.activeViewId)
      ? schema.activeViewId
      : views[0]?.id || 'all';

  return { columns, views, activeViewId };
}

// ==================== 结构写回（防抖 + 去重） ====================

export interface SchemaSaver {
  /** 推送一份新快照；与上次内容相同则跳过（避免「刚应用远端 schema 又原样存回去」） */
  push: (schema: BitableSchemaSnapshot) => void;
  /** 立刻写回（切换页面 / 关闭前） */
  flush: () => void;
  /** 把基线设成给定快照，不触发写入 */
  reset: (schema: BitableSchemaSnapshot | null) => void;
  dispose: () => void;
}

export interface CreateSchemaSaverOptions {
  save: (schema: BitableSchemaSnapshot) => Promise<void>;
  debounceMs?: number;
  onError?: (error: Error) => void;
}

/**
 * 结构写回器。
 *
 * 与行数据的同步队列不同，这里不做差分——列与视图是「整体配置」，
 * 后端按整份覆盖即可（PATCH 一份 JSON），没必要逐字段比对。
 * 但要做**内容去重**：应用远端 schema 会触发 state 变化，如果不去重就会
 * 立刻把同一份内容再写回去，形成无意义的往返。
 */
export function createSchemaSaver({
  save,
  debounceMs = 600,
  onError
}: CreateSchemaSaverOptions): SchemaSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: BitableSchemaSnapshot | null = null;
  let baseline: string | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = () => {
    clearTimer();
    const next = latest;
    if (!next || disposed) return;
    // 只比对「有意义」的字段：updatedAt 每次都不同，不能参与比较
    const { updatedAt: _ignored, ...rest } = next;
    const json = JSON.stringify(rest);
    if (json === baseline) return;
    baseline = json;
    void Promise.resolve(save(next)).catch((err: unknown) => {
      // 写失败把基线清掉，下一次改动会重试整份
      baseline = null;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  };

  return {
    push(schema) {
      if (disposed) return;
      latest = schema;
      clearTimer();
      timer = setTimeout(run, debounceMs);
    },
    flush: run,
    reset(schema) {
      clearTimer();
      latest = schema;
      if (!schema) {
        baseline = null;
        return;
      }
      const { updatedAt: _ignored, ...rest } = schema;
      baseline = JSON.stringify(rest);
    },
    dispose() {
      disposed = true;
      clearTimer();
      latest = null;
    }
  };
}
