/**
 * 数据源适配层（纯 TS，无 React 依赖）。
 *
 * 目标：让 `useBitable` 从「只能存 localStorage」变成「能接后端」，
 * 同时不改变任何本地用法——不传 dataSource 时行为与以前完全一致。
 *
 * 设计取舍：**写后同步（write-behind）+ 差分**，而不是在每个 mutation 里埋回调。
 * 好处是所有写入口（行内编辑、拖拽填充、粘贴、导入、撤销重做、批量删）
 * 自动被覆盖，不需要逐个接线；代价是同步粒度是「一次数据快照」，
 * 所以用 300ms 防抖把连续操作合成一批。
 */
import type { BitableSchemaSnapshot } from './schema';

export type BitableSyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BitableSyncState {
  status: BitableSyncStatus;
  /** 还没写成功的改动处数（0 表示已同步） */
  pending: number;
  error?: string;
  lastSyncedAt?: number;
}

export interface BitableRowPatch<T> {
  rowId: string;
  patch: Partial<T>;
}

/**
 * 只需要实现用得到的方法：
 * 只读场景只写 loadRows，允许新增但不允许删除时省略 deleteRows。
 * 未实现的方法会被跳过（不是报错），便于渐进接入。
 */
export interface BitableDataSource<T> {
  loadRows(): Promise<T[]>;
  createRows?(rows: T[]): Promise<void>;
  updateRows?(patches: BitableRowPatch<T>[]): Promise<void>;
  deleteRows?(rowIds: string[]): Promise<void>;
  /**
   * 表结构（列配置 + 视图）读写，可选。
   *
   * 不实现时列与视图只存在本机 localStorage——同一台机器刷新不丢，
   * 换台机器/换个人看到的就是代码默认列。实现后结构以远端为准，
   * 多人才能看到同一套字段与页签。
   *
   * 注意：远端返回的是「用户改动」，不是完整列配置。代码里的 render 回调、
   * 类型专属外观不会（也不该）走网络，落回运行时状态时会按 id 合并。
   */
  loadSchema?(): Promise<BitableSchemaSnapshot | null>;
  saveSchema?(schema: BitableSchemaSnapshot): Promise<void>;
}

export interface RowDiff<T> {
  added: T[];
  updated: BitableRowPatch<T>[];
  removed: string[];
  /** 变更处数，用于「还有 N 处未同步」提示 */
  total: number;
}

/** 稳定序列化：只用于判断「这一行有没有变」，不参与业务逻辑 */
function serialize(value: unknown): string {
  return JSON.stringify(value);
}

export function snapshotRows<T extends { id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(row.id, row));
  return map;
}

/**
 * 比较基线快照与最新数据，得出新增 / 修改 / 删除。
 *
 * patch 只带真正变化的字段（不含 id），这样后端可以按字段做合并，
 * 也避免「改了一格却整行覆盖」把别人的并发修改冲掉。
 */
export function diffRows<T extends { id: string }>(
  baseline: Map<string, T>,
  rows: T[]
): RowDiff<T> {
  const diff: RowDiff<T> = { added: [], updated: [], removed: [], total: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    seen.add(row.id);
    const prev = baseline.get(row.id);
    if (!prev) {
      diff.added.push(row);
      continue;
    }
    if (serialize(prev) === serialize(row)) continue;

    const patch: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(prev as object), ...Object.keys(row as object)]);
    for (const key of keys) {
      if (key === 'id') continue;
      const a = (prev as Record<string, unknown>)[key];
      const b = (row as Record<string, unknown>)[key];
      if (serialize(a) !== serialize(b)) patch[key] = b;
    }
    if (Object.keys(patch).length > 0) {
      diff.updated.push({ rowId: row.id, patch: patch as Partial<T> });
    }
  }

  baseline.forEach((_row, id) => {
    if (!seen.has(id)) diff.removed.push(id);
  });

  diff.total = diff.added.length + diff.updated.length + diff.removed.length;
  return diff;
}

export interface SyncQueue<T extends { id: string }> {
  /** 重置基线（加载完成 / 手动重载时调用），不会触发写入 */
  reset(rows: T[]): void;
  /** 提交最新快照，内部防抖后做 diff 并批量写 */
  push(rows: T[]): void;
  /** 立刻刷出（页面卸载前或「立即重试」时用） */
  flush(): Promise<void>;
  getState(): BitableSyncState;
  dispose(): void;
}

/**
 * 同步队列：把「数据快照流」变成「后端写请求」。
 *
 * 失败时**不丢改动**：基线停在旧值，`latest` 保留最新快照，
 * 调用 flush() 即可重试同一批 diff。
 */
export function createSyncQueue<T extends { id: string }>(options: {
  source: BitableDataSource<T>;
  debounceMs?: number;
  onStateChange?: (state: BitableSyncState) => void;
}): SyncQueue<T> {
  const { source, debounceMs = 300, onStateChange } = options;

  let baseline = new Map<string, T>();
  let latest: T[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let disposed = false;
  let state: BitableSyncState = { status: 'ready', pending: 0 };

  const emit = (next: Partial<BitableSyncState>) => {
    state = { ...state, ...next };
    if (!disposed) onStateChange?.(state);
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = async (): Promise<void> => {
    if (disposed || flushing || latest === null) return;
    clearTimer();

    const rows = latest;
    const diff = diffRows(baseline, rows);
    if (diff.total === 0) {
      latest = null;
      emit({ pending: 0, status: 'ready' });
      return;
    }

    flushing = true;
    emit({ pending: diff.total });
    try {
      if (diff.added.length > 0 && source.createRows) await source.createRows(diff.added);
      if (diff.updated.length > 0 && source.updateRows) await source.updateRows(diff.updated);
      if (diff.removed.length > 0 && source.deleteRows) await source.deleteRows(diff.removed);

      baseline = snapshotRows(rows);
      latest = null;
      emit({ status: 'ready', pending: 0, error: undefined, lastSyncedAt: Date.now() });
    } catch (err) {
      // 基线保持不动，latest 留着，下次 flush 会重发同一批
      emit({ status: 'error', pending: diff.total, error: err instanceof Error ? err.message : String(err) });
    } finally {
      flushing = false;
      // flush 期间又来了新快照，补一次
      if (latest !== null && state.status !== 'error') schedule();
    }
  };

  const schedule = () => {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(() => {
      void run();
    }, debounceMs);
  };

  return {
    reset(rows: T[]) {
      clearTimer();
      baseline = snapshotRows(rows);
      latest = null;
      emit({ status: 'ready', pending: 0, error: undefined });
    },
    push(rows: T[]) {
      if (disposed) return;
      latest = rows;
      emit({ pending: diffRows(baseline, rows).total });
      schedule();
    },
    flush() {
      return run();
    },
    getState() {
      return state;
    },
    dispose() {
      disposed = true;
      clearTimer();
    }
  };
}

/**
 * REST 适配器：约定最朴素的资源式接口，改后端时优先覆盖这层而不是改组件。
 *
 *   GET    {baseUrl}              → T[] 或 { data: T[] }
 *   POST   {baseUrl}              → body: T[]（批量新增）
 *   PATCH  {baseUrl}/{id}         → body: Partial<T>（逐行，只带变化的字段）
 *   DELETE {baseUrl}/{id}
 *   GET    {schemaUrl}            → BitableSchemaSnapshot | null
 *   PUT    {schemaUrl}            → body: BitableSchemaSnapshot（整份覆盖）
 *
 * 不传 schemaUrl 时不提供结构读写，列与视图继续只存本机。
 */
export function createRestDataSource<T extends { id: string }>(options: {
  baseUrl: string;
  headers?: Record<string, string> | (() => Record<string, string>);
  fetchImpl?: typeof fetch;
  /** 把后端返回的行映射成表格行（字段改名、扁平化嵌套时用） */
  mapRow?: (raw: unknown) => T;
  /** 表结构读写地址；不传则不启用结构同步 */
  schemaUrl?: string;
}): BitableDataSource<T> {
  const { baseUrl, headers, mapRow, schemaUrl } = options;
  const doFetch = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!doFetch) throw new Error('createRestDataSource 需要 fetch：请在 options.fetchImpl 传入');

  const resolveHeaders = (): Record<string, string> => {
    const base = typeof headers === 'function' ? headers() : headers;
    return { 'Content-Type': 'application/json', ...(base || {}) };
  };

  const request = async (url: string, init?: RequestInit): Promise<unknown> => {
    const res = await doFetch(url, { ...init, headers: { ...resolveHeaders(), ...(init?.headers as Record<string, string>) } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`请求失败 ${res.status} ${res.statusText}${text ? `：${text.slice(0, 200)}` : ''}`);
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  };

  return {
    async loadRows() {
      const payload = await request(baseUrl);
      const list = Array.isArray(payload)
        ? payload
        : (payload as { data?: unknown[] } | null)?.data ?? [];
      return (list as unknown[]).map((raw) => (mapRow ? mapRow(raw) : (raw as T)));
    },
    async createRows(rows) {
      await request(baseUrl, { method: 'POST', body: JSON.stringify(rows) });
    },
    async updateRows(patches) {
      await Promise.all(
        patches.map((p) =>
          request(`${baseUrl}/${encodeURIComponent(p.rowId)}`, {
            method: 'PATCH',
            body: JSON.stringify(p.patch)
          })
        )
      );
    },
    async deleteRows(rowIds) {
      await Promise.all(
        rowIds.map((id) =>
          request(`${baseUrl}/${encodeURIComponent(id)}`, { method: 'DELETE' })
        )
      );
    },
    ...(schemaUrl
      ? {
          async loadSchema() {
            const payload = await request(schemaUrl);
            if (!payload || typeof payload !== 'object') return null;
            // 兼容 { data: schema } 的信封格式
            const body = payload as { data?: BitableSchemaSnapshot } & BitableSchemaSnapshot;
            return body.data && Array.isArray(body.data.columns) ? body.data : body;
          },
          async saveSchema(schema: BitableSchemaSnapshot) {
            await request(schemaUrl, { method: 'PUT', body: JSON.stringify(schema) });
          }
        }
      : {})
  };
}

/**
 * 内存数据源：本地演示与单测用，可注入延迟模拟真实网络。
 * 也可以当「离线队列」的落点——先写内存，联网后再 flush 到真实后端。
 */
export function createMemoryDataSource<T extends { id: string }>(
  seed: T[] = [],
  options: { latency?: number; failRate?: number } = {}
): BitableDataSource<T> & { current(): T[]; currentSchema(): BitableSchemaSnapshot | null } {
  const { latency = 0, failRate = 0 } = options;
  let rows: T[] = seed.map((r) => ({ ...r }));
  /** 表结构也存一份，用来演示「换台机器还是同一套列」 */
  let schema: BitableSchemaSnapshot | null = null;

  const wait = () =>
    new Promise<void>((resolve, reject) => {
      const done = () => (Math.random() < failRate ? reject(new Error('模拟网络失败')) : resolve());
      latency > 0 ? setTimeout(done, latency) : done();
    });

  return {
    current: () => rows.map((r) => ({ ...r })),
    currentSchema: () => (schema ? JSON.parse(JSON.stringify(schema)) : null),
    async loadRows() {
      await wait();
      return rows.map((r) => ({ ...r }));
    },
    async createRows(created) {
      await wait();
      rows = [...rows, ...created.map((r) => ({ ...r }))];
    },
    async updateRows(patches) {
      await wait();
      const byId = new Map(patches.map((p) => [p.rowId, p.patch]));
      rows = rows.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r));
    },
    async deleteRows(ids) {
      await wait();
      const drop = new Set(ids);
      rows = rows.filter((r) => !drop.has(r.id));
    },
    async loadSchema() {
      await wait();
      return schema ? JSON.parse(JSON.stringify(schema)) : null;
    },
    async saveSchema(next) {
      await wait();
      schema = JSON.parse(JSON.stringify(next));
    }
  };
}
