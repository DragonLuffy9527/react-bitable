import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  BitableColumnConfig,
  BitableViewConfig,
  BitableFilterRule,
  BitableSortRule,
  BitableColorRule,
  BitableDensity,
  BitableGroupRule,
  BitableGroupSection,
  BitableViewType,
  BitableViewScope,
  BitableFieldType,
  BitableSelectOption
} from './types';
import { toValueList } from './cellValue';

/**
 * 自动补的「父级记录」字段 id。
 * 父子记录需要一格存放父行主键，不能占用主字段（会覆盖图号/编号并让层级成环），
 * 所以拖拽建立子记录时自动补这个隐藏字段。
 */
const PARENT_FIELD_ID = 'parentRecordKey';

/**
 * 单选项配色盘。文本列改成单选时，按现有数据的去重值自动建选项并依次取色，
 * 这样「改成单选」立刻就能看到每种状态各自的底色，不用手填一遍选项。
 * 与 BitableFieldConfigPopover.parseSelectOptions 用同一套色阶，保持一致观感。
 */
export const SELECT_OPTION_PALETTE = [
  'bg-blue-50 text-[#005BAC] border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-rose-50 text-rose-700 border-rose-200'
];

interface UseBitableOptions<T> {
  storageKey: string;
  initialData: T[];
  defaultColumns: BitableColumnConfig<T>[];
  presetViews: BitableViewConfig[];
  onDataChange?: (data: T[]) => void;
  /**
   * 字段表结构版本号。代码侧统一调整字段命名/顺序/类型后把它改一下，
   * 老浏览器里存的列配置会被重置为代码定义（用户自定义列保留），
   * 避免「代码改了名、界面上还是旧列名」。
   */
  schemaVersion?: string;
  /** 撤销 / 重做的即时反馈（一般直接传页面的 onShowToast） */
  onHistoryToast?: (message: string) => void;
  /**
   * 把页面持有的勾选集（Excel 式行多选：Ctrl 点选 / Shift 范围选 / 复选框 / 全选）
   * 注册进撤销历史：传入后勾选变化会自动进栈，撤销/重做会同步还原勾选。
   */
  selectionState?: {
    checkedIds: Record<string, boolean>;
    setCheckedIds: (next: Record<string, boolean>) => void;
  };
}

/** 一步撤销的快照：只有三个数组引用，靠不可变更新的结构性共享复用内存 */
interface BitableHistoryEntry<T> {
  data: T[];
  columns: BitableColumnConfig<T>[];
  views: BitableViewConfig[];
  label: string;
  /** 页面注册的勾选集快照（未注册 selectionState 时为 undefined，还原时跳过） */
  checkedIds?: Record<string, boolean>;
}

export function useBitable<T extends { id: string }>({
  storageKey,
  initialData,
  defaultColumns,
  presetViews,
  onDataChange,
  schemaVersion,
  onHistoryToast,
  selectionState
}: UseBitableOptions<T>) {
  /**
   * 1. Data state
   *
   * 三个台账页都用 `storageKey` 带上 `activeSite.id`，切地盘时 key 会变。
   * 早期版本只在挂载时读一次 localStorage，导致切地盘后表格仍显示上一个地盘的行，
   * 甚至把两个地盘的行混在一起。这里把读取逻辑抽成函数，
   * 并在 storageKey 变化时整体重置（见下方 useEffect）。
   */
  const loadData = (): T[] => {
    try {
      /**
       * schemaVersion 同时也是「内置示例数据」的版本号：
       * 版本号变了说明代码里的初始数据（Mock 行）已经换过，
       * 此时必须整体回落到 initialData，否则老浏览器会一直显示上一版的行内容。
       * 版本号一致时保留用户的行内编辑。
       */
      const savedSchema = localStorage.getItem(`${storageKey}_schema_version`);
      if (schemaVersion && savedSchema !== schemaVersion) {
        return initialData;
      }

      const savedData = localStorage.getItem(`${storageKey}_data`);
      if (savedData) {
        const parsed: T[] = JSON.parse(savedData);
        // 代码侧新增字段时，用 initialData 按 id 补齐老数据里缺失的键（只填空缺，不覆盖已填内容）
        const byId = new Map(initialData.map((row) => [row.id, row]));
        return parsed.map((row) => {
          const base = byId.get(row.id);
          if (!base) return row;
          let patched = row;
          for (const key of Object.keys(base as object)) {
            if (!(key in (row as object))) {
              patched = { ...patched, [key]: (base as Record<string, unknown>)[key] };
            }
          }
          return patched;
        });
      }
    } catch {
      // ignore
    }
    return initialData;
  };

  const [data, setData] = useState<T[]>(loadData);

  /**
   * 3. 增量并入：上传归档 / 新增版本会在上层 state 里追加新行，
   *    而本 hook 只在挂载时读一次 initialData，所以这里把「挂载之后才出现的 id」并入表格。
   *    用 ref 记录已知 id，避免用户删掉的行被再次补回来。
   */
  const knownIdsRef = useRef<Set<string>>(new Set(initialData.map((row) => row.id)));
  useEffect(() => {
    const known = knownIdsRef.current;
    const incoming = initialData.filter((row) => !known.has(row.id));
    if (incoming.length === 0) return;
    incoming.forEach((row) => known.add(row.id));
    setData((prev) => {
      const existing = new Set(prev.map((row) => row.id));
      const fresh = incoming.filter((row) => !existing.has(row.id));
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });
  }, [initialData]);

  // 2. Custom & Active Columns
  const loadColumns = (): BitableColumnConfig<T>[] => {
    try {
      const savedDeleted = localStorage.getItem(`${storageKey}_deleted_col_ids`);
      const deletedIds = new Set<string>(savedDeleted ? JSON.parse(savedDeleted) : []);

      const savedCols = localStorage.getItem(`${storageKey}_columns`);
      if (savedCols) {
        const parsed: BitableColumnConfig<T>[] = JSON.parse(savedCols);

        // 锁定状态以独立 key 为准（见下方持久化 effect）；该 key 不存在时（首次升级/老数据）
        // 才回退到列 schema 的 isLocked。这样旧版写进 `_columns` 的错误 isLocked 不再生效。
        const savedLockedIds = localStorage.getItem(`${storageKey}_locked_col_ids`);
        const lockedIds: Set<string> | null = savedLockedIds ? new Set(JSON.parse(savedLockedIds)) : null;

        // 字段表结构升级：整体回落到代码定义的列（保留用户自定义列与删除记录）
        const savedSchema = localStorage.getItem(`${storageKey}_schema_version`);
        if (schemaVersion && savedSchema !== schemaVersion) {
          const customs = parsed.filter((c) => c.isCustom && !deletedIds.has(c.id));
          return [...defaultColumns, ...customs];
        }

        // Merge with code defaults: keep user renamed labels for editable/custom fields, while preserving code render functions and locking admin fields
        const existingIds = new Set(parsed.map((c) => c.id));
        const missingDefaults = defaultColumns.filter(
          (d) => !existingIds.has(d.id) && !deletedIds.has(d.id)
        );
        const merged: BitableColumnConfig<T>[] = [
          ...parsed
            .filter(
              (col) =>
                !deletedIds.has(col.id) &&
                // 代码侧已经删掉/替换掉的默认列（如被「图纸附件」替换的 actions）
                // 不能再留着，否则 original 找不到 render，会渲染成一列空白
                (col.isCustom || defaultColumns.some((d) => d.id === col.id))
            )
            .map((col) => {
              const original = defaultColumns.find((d) => d.id === col.id);
              // isLocked 只表达「管理员是否显式加锁」，editable 只表达「单元格是否可编辑」。
              // 首次升级（无 _locked_col_ids）时只信代码默认，**不读** _columns 里的 isLocked——
              // 那是旧版把 editable:false 推导出来的脏值，读了会立刻被写进新 key 永久固化。
              const isLocked = lockedIds
                ? lockedIds.has(col.id)
                : (original?.isLocked ?? false);
              const isEditable = original?.editable ?? true;
              const isCustom = !!col.isCustom;
              // 名称以已保存的 label 为准：改名入口只受显式锁定约束（见 renameColumn），
              // 因此 localStorage 里的 label 一定是合法值，不再按 editable 回落到代码默认名。
              const resolvedLabel = col.label || original?.label || '';
              const resolvedType = col.type || original?.type || 'text';
              // 用户把字段类型改掉后，代码里那份原类型专属的 render 必须失效——
              // 否则展示层仍走旧外观（文本列改单选后单元格还是纯灰字、选项配色不生效），
              // 而且编辑器和展示会各说各话。判断依据是「存下来的 type 与代码默认 type 不同」。
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
            }),
          ...missingDefaults
        ];
        return merged;
      }
    } catch {
      // ignore
    }
    return defaultColumns;
  };

  const [columns, setColumns] = useState<BitableColumnConfig<T>[]>(loadColumns);

  // 3. Views state
  const loadViews = (): BitableViewConfig[] => {
    try {
      // schemaVersion 变化时视图整体回落到代码预设：
      // 否则被删除/更名的旧页签会永远残留在 localStorage（2026-10-28 修复：旧页签不随版本升级消失）
      if (schemaVersion) {
        const savedSchemaForViews = localStorage.getItem(`${storageKey}_schema_version`);
        if (savedSchemaForViews && savedSchemaForViews !== schemaVersion) {
          localStorage.removeItem(`${storageKey}_views`);
          localStorage.removeItem(`${storageKey}_active_view_id`);
          return presetViews.map((v) => ({ ...v }));
        }
      }
      const savedViews = localStorage.getItem(`${storageKey}_views`);
      if (savedViews) {
        let parsed: BitableViewConfig[] = JSON.parse(savedViews);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const masterPreset = presetViews[0];
          if (masterPreset) {
            // Find existing master tab or legacy names
            const masterIdx = parsed.findIndex(
              (v) =>
                v.id === masterPreset.id ||
                v.name === '总表' ||
                v.name === '全部图纸总表' ||
                v.name === '全部版本总表' ||
                v.name === '全部 PS 文件'
            );
            if (masterIdx >= 0) {
              const masterItem = { ...parsed[masterIdx], name: '总表', icon: 'grid_on' };
              parsed.splice(masterIdx, 1);
              parsed.unshift(masterItem);
            } else {
              parsed.unshift({ ...masterPreset, name: '总表', icon: 'grid_on' });
            }
          }
          const normalized = parsed.map((v) => ({
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
          }));
          // 系统总表固定为协作视图，历史数据若被存成个人视图则强制纠回
          if (normalized.length > 0) {
            normalized[0] = { ...normalized[0], scope: 'collaborative' };
          }
          return normalized;
        }
      }
    } catch {
      // ignore
    }
    const presetNormalized = presetViews.map((v) => ({
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
    }));
    // 系统总表固定为协作视图
    if (presetNormalized.length > 0) {
      presetNormalized[0] = { ...presetNormalized[0], scope: 'collaborative' };
    }
    return presetNormalized;
  };

  const [views, setViews] = useState<BitableViewConfig[]>(loadViews);

  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadActiveViewId = (): string => {
    try {
      const savedActive = localStorage.getItem(`${storageKey}_active_view_id`);
      if (savedActive) {
        return savedActive;
      }
    } catch {
      // ignore
    }
    return presetViews[0]?.id || 'all';
  };

  const [activeViewId, setActiveViewId] = useState<string>(loadActiveViewId);

  // ==================== 撤销 / 重做 ====================
  /**
   * 快照式历史记录。
   *
   * 本 hook 里所有写操作都是不可变更新（`[...prev]` + `{...row}`，从不原地改行对象），
   * 所以一步快照只要存 data / columns / views 三个数组引用即可，
   * 与上一版共享未改动的行对象，50~60 步撤销栈几乎不占额外内存。
   *
   * 采用「监听引用变化」而不是在每个 mutator 里手写 pushHistory：
   * 后者要在 20 多个写入口逐个补一行，漏一处就出现「这一步撤销不了」的死角；
   * 现在新增写操作会自动进栈。
   */
  const HISTORY_LIMIT = 60;
  const undoStackRef = useRef<BitableHistoryEntry<T>[]>([]);
  const redoStackRef = useRef<BitableHistoryEntry<T>[]>([]);
  // 勾选集用 ref 取最新值，避免快照 effect 因闭包过期拿到旧勾选
  const selectionStateRef = useRef(selectionState);
  selectionStateRef.current = selectionState;
  const lastSnapshotRef = useRef<BitableHistoryEntry<T>>({
    data,
    columns,
    views,
    checkedIds: selectionState?.checkedIds,
    label: '编辑记录'
  });
  /** 下一个被记入历史的操作名（由各 mutator 进来先 markHistory） */
  const pendingLabelRef = useRef<string>('编辑记录');
  /** 切地盘重置状态时不要记一步历史 */
  const skipHistoryRef = useRef(false);
  const [, bumpHistory] = useState(0);

  const markHistory = (label: string) => {
    pendingLabelRef.current = label;
  };

  useEffect(() => {
    const selIds = selectionStateRef.current?.checkedIds;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      undoStackRef.current = [];
      redoStackRef.current = [];
      lastSnapshotRef.current = { data, columns, views, checkedIds: selIds, label: '切换地盘' };
      pendingLabelRef.current = '编辑记录';
      bumpHistory((v) => v + 1);
      return;
    }

    const prev = lastSnapshotRef.current;
    const dataChanged = prev.data !== data || prev.columns !== columns || prev.views !== views;
    const selectionChanged = !!selectionStateRef.current && prev.checkedIds !== selIds;
    if (!dataChanged && !selectionChanged) return;

    // 纯勾选变化（无数据改动）也记一步，操作名固定为「勾选记录」；
    // 与数据改动同一次批量更新发生时（如批量删除后清空勾选）合并为一步。
    const label = dataChanged ? pendingLabelRef.current : '勾选记录';
    undoStackRef.current.push({
      data: prev.data,
      columns: prev.columns,
      views: prev.views,
      checkedIds: prev.checkedIds,
      label
    });
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
    lastSnapshotRef.current = { data, columns, views, checkedIds: selIds, label };
    pendingLabelRef.current = '编辑记录';
    // 让工具栏的「撤销/重做」可用态跟着刷新
    bumpHistory((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, columns, views, selectionState?.checkedIds]);

  const applySnapshot = (snapshot: BitableHistoryEntry<T>) => {
    // 先更新基线引用，回填动作本身就不会再被记成一步新的历史
    lastSnapshotRef.current = snapshot;
    setData(snapshot.data);
    setColumns(snapshot.columns);
    setViews(snapshot.views);
    // 同步还原页面勾选集（仅当页面注册了 selectionState 且快照里带勾选）
    const sel = selectionStateRef.current;
    if (sel && snapshot.checkedIds !== undefined) {
      sel.setCheckedIds(snapshot.checkedIds);
    }
    bumpHistory((v) => v + 1);
  };

  /** 撤销一步，返回被撤销操作的名称（无历史时返回 null） */
  const undo = (): string | null => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return null;
    redoStackRef.current.push({ ...lastSnapshotRef.current });
    applySnapshot(snapshot);
    return snapshot.label || '操作';
  };

  /** 重做一步，返回被重做操作的名称（无可重做时返回 null） */
  const redo = (): string | null => {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return null;
    undoStackRef.current.push({ ...lastSnapshotRef.current });
    applySnapshot(snapshot);
    return snapshot.label || '操作';
  };

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const undoLabel = undoStackRef.current[undoStackRef.current.length - 1]?.label || '';
  const redoLabel = redoStackRef.current[redoStackRef.current.length - 1]?.label || '';

  // 快捷键：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做
  const undoActionRef = useRef(undo);
  undoActionRef.current = undo;
  const redoActionRef = useRef(redo);
  redoActionRef.current = redo;
  const historyToastRef = useRef(onHistoryToast);
  historyToastRef.current = onHistoryToast;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;

      // 输入框 / 多行文本里让浏览器原生撤销生效，不抢快捷键
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (
        el &&
        (el.isContentEditable ||
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT')
      ) {
        return;
      }

      const label = isRedo ? redoActionRef.current() : undoActionRef.current();
      if (!label) return;
      e.preventDefault();
      historyToastRef.current?.(`${isRedo ? '已重做' : '已撤销'}：${label}`);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // ==================== 撤销 / 重做（end） ====================

  /**
   * 切换地盘（storageKey 变化）时整体重置表格状态。
   *
   * 不重置的话，上一个地盘的行、列配置、视图与分组都会留在界面上，
   * 表现为「切到铜锣湾后仍显示启德的 A-101，行数是两地之和」。
   * 这里按新的 storageKey 重新读取各自的 localStorage 缓存，
   * 没有缓存时回落到代码定义的默认值。
   */
  const prevStorageKeyRef = useRef(storageKey);
  useEffect(() => {
    if (prevStorageKeyRef.current === storageKey) return;
    prevStorageKeyRef.current = storageKey;
    // 换地盘是「换一本书」，不能算作可撤销的一步
    skipHistoryRef.current = true;
    setData(loadData());
    setColumns(loadColumns());
    setViews(loadViews());
    setActiveViewId(loadActiveViewId());
    setSearchQuery('');
    // 已知 id 集合也要跟着换，否则增量并入逻辑会把新地盘的行追加到旧行后面
    knownIdsRef.current = new Set(initialData.map((row) => row.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Current active view configuration
  const activeView = useMemo(() => {
    return views.find((v) => v.id === activeViewId) || views[0] || presetViews[0];
  }, [views, activeViewId, presetViews]);

  // Check if current view is the protected master view ("总表")
  const isMasterView = useMemo(() => {
    return activeViewId === views[0]?.id || activeView?.name === '总表';
  }, [activeViewId, views, activeView]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}_data`, JSON.stringify(data));
      onDataChange?.(data);
    } catch {
      // ignore
    }
  }, [data, storageKey, onDataChange]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}_columns`, JSON.stringify(columns.map(({ render, ...rest }) => rest)));
      if (schemaVersion) {
        localStorage.setItem(`${storageKey}_schema_version`, schemaVersion);
      }
    } catch {
      // ignore
    }
  }, [columns, storageKey, schemaVersion]);

  /**
   * 锁定状态单独持久化到 `_locked_col_ids`。
   * 历史原因：旧版把 editable:false 推导成 isLocked:true 写进了 `_columns`，
   * 导致主键/图名等系统字段在老浏览器里永远是「已锁定」，点解锁刷新又变回锁。
   * 现在列 schema 里的 isLocked 只作为初始值，运行时以这个 id 集合为准。
   */
  useEffect(() => {
    try {
      const lockedIds = columns.filter((c) => c.isLocked).map((c) => c.id);
      localStorage.setItem(`${storageKey}_locked_col_ids`, JSON.stringify(lockedIds));
    } catch {
      // ignore
    }
  }, [columns, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}_views`, JSON.stringify(views));
    } catch {
      // ignore
    }
  }, [views, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}_active_view_id`, activeViewId);
    } catch {
      // ignore
    }
  }, [activeViewId, storageKey]);

  // Update active view helper
  const updateActiveView = useCallback(
    (updater: (prev: BitableViewConfig) => BitableViewConfig) => {
      setViews((prevViews) => {
        return prevViews.map((v) => {
          if (v.id === activeViewId) {
            return updater(v);
          }
          return v;
        });
      });
    },
    [activeViewId]
  );

  // 4. View Operations
  const handleSelectView = (viewId: string) => {
    setActiveViewId(viewId);
  };

  const handleCreateView = (name: string, viewType: BitableViewType = 'grid') => {
    markHistory(`新建视图 ${name}`);
    const newViewId = `view_${Date.now()}`;
    const iconMap: Record<BitableViewType, string> = {
      grid: 'table_chart',
      kanban: 'view_kanban',
      gallery: 'image',
      gantt: 'waterfall_chart',
      calendar: 'calendar_month',
      form: 'description'
    };
    const newView: BitableViewConfig = {
      ...activeView,
      id: newViewId,
      name: name || `自定义视图 ${views.length + 1}`,
      viewType,
      icon: iconMap[viewType] || 'table_chart',
      scope: 'collaborative',
      isLocked: false,
      pinned: undefined // 新视图不继承固定卡属性（2026-10-28 修复：复制总表后删除菜单消失）
    };
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newViewId);
    return newView;
  };

  const updateViewConfig = (viewId: string, updates: Partial<BitableViewConfig>) => {
    markHistory('修改视图配置');
    setViews((prev) =>
      prev.map((v, idx) => {
        if (v.id !== viewId) return v;
        const isMaster = idx === 0 || v.name === '总表';
        // 系统总表固定为协作视图，忽略任何改为个人视图的请求
        if (isMaster && updates.scope === 'personal') {
          return { ...v, ...updates, scope: 'collaborative' };
        }
        return { ...v, ...updates };
      })
    );
  };

  const setViewType = (type: BitableViewType) => {
    markHistory('修改视图类型');
    const iconMap: Record<BitableViewType, string> = {
      grid: 'table_chart',
      kanban: 'view_kanban',
      gallery: 'image',
      gantt: 'waterfall_chart',
      calendar: 'calendar_month',
      form: 'description'
    };
    updateActiveView((prev) => ({
      ...prev,
      viewType: type,
      icon: prev.id === 'all' ? 'grid_on' : iconMap[type] || prev.icon
    }));
  };

  const setViewScope = (scope: BitableViewScope) => {
    // 系统总表固定为协作视图
    if (isMasterView && scope === 'personal') return;
    markHistory('切换视图范围');
    updateActiveView((prev) => ({ ...prev, scope }));
  };

  const toggleViewLock = () => {
    markHistory(activeView?.isLocked ? '解锁视图' : '锁定视图');
    updateActiveView((prev) => ({ ...prev, isLocked: !prev.isLocked }));
  };

  const handleDeleteView = (viewId: string): boolean => {
    const targetIndex = views.findIndex((v) => v.id === viewId);
    if (targetIndex === 0 || views[targetIndex]?.name === '总表' || views[targetIndex]?.pinned) {
      return false; // The first tab "总表" and pinned views cannot be deleted
    }
    if (views.length <= 1) return false;
    markHistory(`删除视图 ${views[targetIndex]?.name || ''}`);
    const remaining = views.filter((v) => v.id !== viewId);
    setViews(remaining);
    if (activeViewId === viewId) {
      setActiveViewId(remaining[0].id);
    }
    return true;
  };

  const renameView = (viewId: string, newName: string) => {
    const targetIndex = views.findIndex((v) => v.id === viewId);
    if (targetIndex === 0 || views[targetIndex]?.name === '总表' || views[targetIndex]?.pinned) {
      return; // The "总表" and pinned view names cannot be modified
    }
    // 已锁定视图禁止重命名：锁定保护覆盖「配置 + 名称」，与视图页签/视图配置弹层的入口口径一致
    if (views[targetIndex]?.isLocked) {
      return;
    }
    markHistory(`视图改名 ${newName}`);
    setViews((prev) =>
      prev.map((v) => (v.id === viewId ? { ...v, name: newName } : v))
    );
  };

  const duplicateView = (viewId: string) => {
    const target = views.find((v) => v.id === viewId) || activeView;
    const newId = `view_${Date.now()}`;
    const newView: BitableViewConfig = {
      ...target,
      id: newId,
      name: `${target.name} (副本)`,
      pinned: undefined // 副本不继承固定卡属性（2026-10-28 修复：复制固定视图后删除菜单消失）
    };
    markHistory(`复制视图 ${target.name}`);
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newId);
    return newView;
  };

  // 5. Column Operations
  /**
   * 当前视图生效的隐藏字段集合（视图级显隐，飞书式：一个视图隐藏不影响其他视图）。
   * 全局 col.visible 仍保留，用于系统级隐藏字段（如「父级记录」）与历史数据兼容。
   */
  const hiddenFieldIdSet = useMemo(
    () => new Set(activeView?.hiddenFieldIds ?? []),
    [activeView]
  );

  /** 传给表格 / 工具栏的列：把视图级隐藏字段覆盖成 visible:false，展示层零改动 */
  const viewColumns = useMemo(
    () =>
      hiddenFieldIdSet.size === 0
        ? columns
        : columns.map((c) =>
            hiddenFieldIdSet.has(c.id) ? { ...c, visible: false } : c
          ),
    [columns, hiddenFieldIdSet]
  );

  /**
   * 切换字段显隐（字段配置弹层的「显示」勾选）。
   * 语义是**当前视图**粒度：
   * - 取消勾选 → 把字段加入当前视图 hiddenFieldIds（其他视图不受影响）；
   * - 勾选 → 从当前视图隐藏清单移除；若该字段同时被全局隐藏（历史数据 / 系统字段），
   *   则一并恢复全局可见，保证「勾上就能看到」。
   */
  const toggleColumnVisibility = (columnId: string) => {
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;
    const effectiveVisible = col.visible && !hiddenFieldIdSet.has(columnId);
    markHistory(effectiveVisible ? `在当前视图隐藏字段 ${col.label}` : `在当前视图显示字段 ${col.label}`);
    if (effectiveVisible) {
      updateActiveView((prev) => ({
        ...prev,
        hiddenFieldIds: [...(prev.hiddenFieldIds ?? []), columnId]
      }));
    } else {
      updateActiveView((prev) => ({
        ...prev,
        hiddenFieldIds: (prev.hiddenFieldIds ?? []).filter((id) => id !== columnId)
      }));
      if (!col.visible) {
        setColumns((prev) =>
          prev.map((c) => (c.id === columnId ? { ...c, visible: true } : c))
        );
      }
    }
  };

  const moveColumn = (dragIndex: number, hoverIndex: number) => {
    markHistory('调整字段顺序');
    setColumns((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(hoverIndex, 0, removed);
      return next;
    });
  };

  /**
   * 按列 id 移动列（表头拖拽排序用）。
   * 与 moveColumn 的区别：调用方只知道「拖的是哪列、落到哪列」，不需要自己算下标，
   * 因此隐藏列、列增删都不会算错位置。
   */
  const moveColumnById = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    markHistory('调整字段顺序');
    setColumns((prev) => {
      const from = prev.findIndex((c) => c.id === dragId);
      const to = prev.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };

  const addCustomColumn = (newCol: Omit<BitableColumnConfig<T>, 'visible'>) => {
    markHistory(`新增字段 ${newCol.label}`);
    setColumns((prev) => [
      ...prev,
      {
        ...newCol,
        visible: true,
        isCustom: true,
        editable: newCol.isLocked ? false : (newCol.editable ?? true)
      }
    ]);
  };

  const deleteColumn = (columnId: string): boolean => {
    const target = columns.find((c) => c.id === columnId);
    if (!target) return false;
    // System action column, primary code column, or locked column cannot be deleted
    if (target.type === 'action' || target.isLocked || target.id === 'code') {
      return false;
    }

    markHistory(`删除字段 ${target.label}`);
    setColumns((prev) => prev.filter((c) => c.id !== columnId));

    try {
      const savedDeleted = localStorage.getItem(`${storageKey}_deleted_col_ids`);
      const deletedSet = new Set<string>(savedDeleted ? JSON.parse(savedDeleted) : []);
      deletedSet.add(columnId);
      localStorage.setItem(`${storageKey}_deleted_col_ids`, JSON.stringify(Array.from(deletedSet)));
    } catch {
      // ignore
    }

    // Also remove from views filter/sort/group rules
    setViews((prevViews) =>
      prevViews.map((v) => ({
        ...v,
        filterRules: (v.filterRules || []).filter((r) => r.fieldId !== columnId),
        sortRules: (v.sortRules || []).filter((s) => s.fieldId !== columnId),
        groupRules: (v.groupRules || []).filter((g) => g.fieldId !== columnId),
        groupByFieldId: v.groupByFieldId === columnId ? null : v.groupByFieldId,
        hiddenFieldIds: (v.hiddenFieldIds || []).filter((id) => id !== columnId)
      }))
    );

    return true;
  };

  const toggleColumnLock = (columnId: string) => {
    const col = columns.find((c) => c.id === columnId);
    markHistory(col ? (col.isLocked ? `解锁字段 ${col.label}` : `锁定字段 ${col.label}`) : '调整字段锁定');
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        // action 列（附件/操作按钮）同样允许加锁：加锁只影响能否改名，不影响按钮渲染。
        const nextLocked = !col.isLocked;
        return {
          ...col,
          isLocked: nextLocked
          // 不写 editable：单元格可编辑性由代码定义，锁定只叠加在 isLocked 上
        };
      })
    );
  };

  const updateColumnType = (
    columnId: string,
    newType: BitableFieldType,
    options?: BitableSelectOption[]
  ) => {
    // 锁定字段不可改类型：与 setState 内部的守卫同口径，避免留下幽灵操作标签
    const targetCol = columns.find((c) => c.id === columnId);
    if (!targetCol || targetCol.isLocked) return;
    markHistory(`修改字段类型 ${targetCol.label}`);
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        if (col.isLocked) return col; // Locked fields cannot change type

        const defaultSelectOptions = [
          { label: '选项1', value: '选项1', color: 'bg-blue-50 text-[#005BAC] border-blue-200' },
          { label: '选项2', value: '选项2', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: '选项3', value: '选项3', color: 'bg-slate-100 text-slate-700 border-slate-200' }
        ];

        // 类型真的变了：必须丢掉原类型专属的自定义 render。
        // EditableCell 会先判 `column.render` 直接返回，保留它会让展示层永远走旧外观——
        // 典型症状：文本列改成单选后，单元格还是纯灰字、选项配色完全不生效。
        const typeChanged = col.type !== newType;

        // 单选 / 多选共用候选项：切过去时若调用方没给选项、列上也没有选项，
        // 就用现有数据里的去重值自动建选项，让「改成单选/多选」立刻能看到各自的配色。
        const needsOptions = newType === 'select' || newType === 'multiSelect';
        const derivedOptions = (() => {
          if (!needsOptions || (options && options.length > 0)) return [];
          if (col.options && col.options.length > 0) return [];
          const seen: string[] = [];
          data.forEach((row) => {
            const raw = (row as Record<string, unknown>)[columnId];
            // 用 toValueList 而不是 String(raw)：多选/人员列的值是数组，
            // String(['建筑','结构']) 会变成 "建筑,结构" 这种半截字符串。
            toValueList(raw).forEach((v) => {
              if (v && !seen.includes(v)) seen.push(v);
            });
          });
          return seen.slice(0, 12).map((v, idx) => ({
            label: v,
            value: v,
            color: SELECT_OPTION_PALETTE[idx % SELECT_OPTION_PALETTE.length]
          }));
        })();

        const next: BitableColumnConfig<T> = {
          ...col,
          type: newType,
          options: needsOptions
            ? options && options.length > 0
              ? options
              : col.options && col.options.length > 0
              ? col.options
              : derivedOptions.length > 0
              ? derivedOptions
              : defaultSelectOptions
            : col.options
        };
        if (typeChanged) delete next.render;
        return next;
      })
    );
  };

  const updateColumnConfig = (columnId: string, updates: Partial<BitableColumnConfig<T>>) => {
    markHistory('修改字段配置');
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, ...updates } : col))
    );
  };

  const resetColumns = () => {
    try {
      localStorage.removeItem(`${storageKey}_deleted_col_ids`);
      localStorage.removeItem(`${storageKey}_columns`);
      localStorage.removeItem(`${storageKey}_locked_col_ids`);
    } catch {
      // ignore
    }
    markHistory('重置字段配置');
    setColumns(defaultColumns);
  };

  const toggleColumnFreeze = (columnId: string) => {
    const col = columns.find((c) => c.id === columnId);
    markHistory(col ? (col.isFrozen ? '取消冻结字段' : '冻结字段') : '调整字段冻结');
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, isFrozen: !col.isFrozen } : col))
    );
  };

  const renameColumn = (columnId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    markHistory(`字段改名 ${trimmed}`);
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        // 显式锁定的字段不可改名；其余字段（含主键、只读单元格的系统字段）均允许改 label。
        // id 不变，行数据、图号规则、各页映射都按 id 走，改显示名不影响业务。
        if (col.isLocked) return col;
        return { ...col, label: trimmed };
      })
    );
  };

  // 6. Filter Operations
  const setFilterRules = (rules: BitableFilterRule[]) => {
    markHistory('修改筛选条件');
    updateActiveView((prev) => ({ ...prev, filterRules: rules }));
  };

  const setFilterLogic = (logic: 'AND' | 'OR') => {
    markHistory('修改筛选逻辑');
    updateActiveView((prev) => ({ ...prev, filterLogic: logic }));
  };

  // 7. Sort Operations
  const setSortRules = (rules: BitableSortRule[]) => {
    markHistory('修改排序规则');
    updateActiveView((prev) => ({ ...prev, sortRules: rules }));
  };

  // 8. Group Operations
  const setGroupRules = (rules: BitableGroupRule[]) => {
    markHistory('修改分组');
    updateActiveView((prev) => ({
      ...prev,
      groupRules: rules,
      groupByFieldId: rules.length > 0 ? rules[0].fieldId : null
    }));
  };

  const setGroupByFieldId = (fieldId: string | null) => {
    markHistory(fieldId ? '按字段分组' : '取消分组');
    updateActiveView((prev) => ({
      ...prev,
      groupByFieldId: fieldId,
      groupRules: fieldId ? [{ id: `group_${Date.now()}`, fieldId, direction: 'asc' }] : []
    }));
  };

  // 9. Density Operations
  const setDensity = (density: BitableDensity) => {
    markHistory('调整行密度');
    updateActiveView((prev) => ({ ...prev, density }));
  };

  // 10. Color Rules Operations
  const setColorRules = (colorRules: BitableColorRule[]) => {
    markHistory('修改颜色规则');
    updateActiveView((prev) => ({ ...prev, colorRules }));
  };

  // 11. Row Operations (Inline Editing)
  const updateCell = (rowId: string, fieldId: string, value: any) => {
    markHistory(`修改单元格 ${fieldId}`);
    setData((prev) =>
      prev.map((item) => {
        if (item.id === rowId) {
          return {
            ...item,
            [fieldId]: value
          };
        }
        return item;
      })
    );
  };

  /**
   * 批量写单元格（拖拽填充用）。
   * 一次 setData 合并所有行，撤销时是**一步**；逐格调 updateCell 会变成 N 步，
   * 用户要按 N 次 Ctrl+Z 才能退回去，所以填充必须走这里。
   */
  const updateCells = (updates: { rowId: string; fieldId: string; value: any }[]) => {
    if (updates.length === 0) return;
    markHistory(`填充 ${updates.length} 行`);
    const patchByRow = new Map<string, Record<string, any>>();
    updates.forEach(({ rowId, fieldId, value }) => {
      const patch = patchByRow.get(rowId) || {};
      patch[fieldId] = value;
      patchByRow.set(rowId, patch);
    });
    setData((prev) =>
      prev.map((item) => {
        const patch = patchByRow.get(item.id);
        return patch ? ({ ...item, ...patch } as T) : item;
      })
    );
  };

  const addRow = (initialValues?: Partial<T>) => {
    markHistory('新增记录');
    const newId = `row_${Date.now()}`;
    const newRow = {
      id: newId,
      ...initialValues
    } as T;
    setData((prev) => [newRow, ...prev]);
    return newRow;
  };

  const deleteRow = (rowId: string) => {
    markHistory('删除记录');
    setData((prev) => prev.filter((item) => item.id !== rowId));
  };

  const deleteRows = (rowIds: string[]) => {
    if (rowIds.length === 0) return;
    markHistory(rowIds.length > 1 ? `批量删除 ${rowIds.length} 条记录` : '删除记录');
    const idSet = new Set(rowIds);
    setData((prev) => prev.filter((item) => !idSet.has(item.id)));
  };

  // —— 11.1 行级结构操作（插入空白行 / 复制行 / 拖拽排序 / 父子记录 / 列宽） ——

  /** 主字段（第一个可见非后台字段）：父子记录用它作为父记录的引用键 */
  const primaryFieldId = useMemo(
    () => columns.find((c) => c.visible && c.type !== 'action')?.id,
    [columns]
  );

  /** 当前视图生效的父级字段（父子记录开关打开且配置了字段时才有值） */
  const parentFieldId = useMemo(
    () =>
      activeView?.parentChildEnabled && activeView?.parentFieldId
        ? activeView.parentFieldId
        : null,
    [activeView]
  );

  const rowKeyValue = (row: T): string => {
    const key = primaryFieldId ? String((row as any)[primaryFieldId] ?? '').trim() : '';
    return key || row.id;
  };

  /**
   * 取当前视图可用的父级字段。
   *
   * 父子记录需要一个「记录父级引用」的字段，它 **不能** 是主字段本身
   * （否则把 A-103 的父级写成 A-101 时，会覆盖掉它自己的图号，层级直接成环）。
   * 所以：视图里已配置了非主字段的父级字段就复用，否则自动补一个隐藏的
   * 「父级记录」文本字段并把视图的父子记录开关打开。
   */
  const ensureParentField = (): string => {
    if (parentFieldId && parentFieldId !== primaryFieldId) return parentFieldId;
    if (!columns.some((c) => c.id === PARENT_FIELD_ID)) {
      setColumns((prev) => [
        ...prev,
        {
          id: PARENT_FIELD_ID,
          label: '父级记录',
          type: 'text' as BitableFieldType,
          width: '120px',
          minWidth: '100px',
          visible: false,
          editable: true,
          isCustom: true,
          sortable: false,
          filterable: true,
          groupable: false,
          description: '父子记录：填写父记录的主键值（如图号 A-101），本行即成为其子记录'
        }
      ]);
    }
    updateActiveView((prev) => ({
      ...prev,
      parentChildEnabled: true,
      parentFieldId: PARENT_FIELD_ID
    }));
    return PARENT_FIELD_ID;
  };

  /**
   * 生成一条真正的空白记录。
   * 数组型字段（附件、版本历史等）给空数组，避免自定义渲染取 `.map` 时炸掉；
   * 其余字段留空，单元格显示占位符，用户双击即可录入。
   */
  const makeBlankRow = (values?: Partial<T>): T => {
    const template = (data[0] || initialData[0]) as Record<string, any> | undefined;
    const base: Record<string, any> = {
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    };
    if (template) {
      Object.keys(template).forEach((key) => {
        if (Array.isArray(template[key])) base[key] = [];
      });
    }
    return { ...base, ...values } as T;
  };

  /**
   * 插入空白记录。anchorRowId 为空时追加到表尾；
   * position='child' 时同时把新行挂到锚点行下面（自动开启父子记录）。
   */
  const insertRow = (
    anchorRowId: string | null,
    position: 'above' | 'below' | 'child' = 'below',
    values?: Partial<T>
  ): T => {
    markHistory(position === 'child' ? '插入子记录' : '插入记录');
    const newRow = makeBlankRow(values);
    const anchor = anchorRowId ? data.find((r) => r.id === anchorRowId) : undefined;

    /**
     * 主字段若是管理员配置的锁定列（如「图纸编号」），表格里无法手动录入，
     * 空白行会变成无法识别的记录。这里补一个占位编号，其余字段保持空白。
     */
    const primaryCol = columns.find((c) => c.id === primaryFieldId);
    const primaryLocked = !!primaryCol && (!!primaryCol.isLocked || primaryCol.editable === false);
    if (primaryFieldId && primaryLocked && (newRow as any)[primaryFieldId] === undefined) {
      const used = new Set(data.map((r) => String((r as any)[primaryFieldId] ?? '').trim()));
      let serial = data.length + 1;
      let candidate = `新建-${String(serial).padStart(3, '0')}`;
      while (used.has(candidate)) {
        serial += 1;
        candidate = `新建-${String(serial).padStart(3, '0')}`;
      }
      (newRow as any)[primaryFieldId] = candidate;
    }

    if (position === 'child' && anchor) {
      const fieldId = ensureParentField();
      (newRow as any)[fieldId] = rowKeyValue(anchor);
    }

    setData((prev) => {
      const next = [...prev];
      if (!anchorRowId) {
        next.push(newRow);
        return next;
      }
      const idx = next.findIndex((r) => r.id === anchorRowId);
      if (idx < 0) {
        next.push(newRow);
        return next;
      }
      next.splice(position === 'above' ? idx : idx + 1, 0, newRow);
      return next;
    });

    return newRow;
  };

  /** 复制某行到其下方（含所有字段值，仅换新 id） */
  const duplicateRow = (rowId: string): T | null => {
    const source = data.find((r) => r.id === rowId);
    if (!source) return null;
    markHistory('复制记录');
    const copy = {
      ...(source as any),
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    } as T;
    setData((prev) => {
      const next = [...prev];
      const idx = next.findIndex((r) => r.id === rowId);
      next.splice(idx < 0 ? next.length : idx + 1, 0, copy);
      return next;
    });
    return copy;
  };

  /** 解除某行的父级关系（移出层级，回到顶层） */
  const detachRow = (rowId: string): boolean => {
    const fieldId = parentFieldId;
    if (!fieldId) return false;
    markHistory('移出父级层级');
    setData((prev) =>
      prev.map((item) => (item.id === rowId ? ({ ...item, [fieldId]: '' } as T) : item))
    );
    return true;
  };

  /**
   * 拖拽调整行位置 / 建立父子记录。
   * - before / after：与目标行同级，跟随目标的父级，插入到目标上下方
   * - child：把被拖行挂到目标行下面（视图未开启父子记录时自动开启）
   */
  const moveRow = (
    dragId: string,
    targetId: string,
    position: 'before' | 'after' | 'child'
  ): { ok: boolean; message: string } => {
    if (!dragId || !targetId || dragId === targetId) {
      return { ok: false, message: '不能拖到记录自身' };
    }

    markHistory(position === 'child' ? '建立父子记录' : '调整行顺序');

    // 父级字段：复用视图已配置的字段；拖拽成子记录时若未配置则自动补一个
    const hierarchyFieldId =
      position === 'child'
        ? ensureParentField()
        : parentFieldId && parentFieldId !== primaryFieldId
        ? parentFieldId
        : null;

    // 父子引用可能存的是行 id，也可能存的是主字段值（图号 / 编号），先建双向索引
    const byValue = new Map<string, T>();
    data.forEach((row) => {
      byValue.set(row.id, row);
      const key = primaryFieldId ? String((row as any)[primaryFieldId] ?? '').trim() : '';
      if (key) byValue.set(key, row);
    });
    const parentValueOf = (row?: T) =>
      row && hierarchyFieldId ? String((row as any)[hierarchyFieldId] ?? '').trim() : '';

    // 禁止把行拖到自己的子孙下面，否则层级成环
    let cursor = targetId;
    for (let i = 0; i < 50; i += 1) {
      const node = byValue.get(cursor);
      const parentValue = parentValueOf(node);
      if (!parentValue) break;
      const parentNode = byValue.get(parentValue);
      if (!parentNode) break;
      if (parentNode.id === dragId) {
        return { ok: false, message: '不能把记录拖到自己的子记录里' };
      }
      cursor = parentNode.id;
    }

    const from = data.findIndex((r) => r.id === dragId);
    const target = data.find((r) => r.id === targetId);
    if (from < 0 || !target) return { ok: false, message: '记录不存在' };

    const dragged = data[from];
    const updated = { ...dragged } as any;
    const next = [...data];
    next.splice(from, 1);
    const targetIdx = next.findIndex((r) => r.id === targetId);
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;

    if (hierarchyFieldId) {
      if (position === 'child') {
        updated[hierarchyFieldId] = rowKeyValue(target);
      } else {
        // 同级排序：跟随目标的父级，保证拖到哪一层就留在哪一层
        updated[hierarchyFieldId] = parentValueOf(target);
      }
    }

    next.splice(insertIdx, 0, updated as T);
    setData(next);

    if (position === 'child') {
      return { ok: true, message: '已建立父子记录，父行可展开/折叠子记录' };
    }
    if (activeView.sortRules.length > 0) {
      return { ok: true, message: '已调整底层顺序（当前视图启用了排序，清除排序后即可看到拖拽结果）' };
    }
    return { ok: true, message: position === 'before' ? '已移至目标行上方' : '已移至目标行下方' };
  };

  /** 拖动表头边线调整列宽（同时写 width 与 minWidth，避免被旧的 minWidth 卡住） */
  const resizeColumn = (columnId: string, width: number) => {
    const px = Math.max(80, Math.round(width));
    markHistory('调整列宽');
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, width: `${px}px`, minWidth: `${px}px` } : col
      )
    );
  };

  // Reset to presets
  const resetActiveView = () => {
    const defaultPreset = presetViews.find((v) => v.id === activeViewId) || presetViews[0];
    updateActiveView(() => ({ ...defaultPreset }));
  };

  // 12. Computation Pipeline: Filter -> Sort -> Group
  const processedData = useMemo(() => {
    let result = [...data];

    // (0) 全局关键词搜索 (Search Query Filter across all fields)
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (trimmedQuery) {
      result = result.filter((row) => {
        return Object.entries(row).some(([key, val]) => {
          if (val === undefined || val === null) return false;
          if (typeof val === 'object') return false;
          return String(val).toLowerCase().includes(trimmedQuery);
        });
      });
    }

    // (1) Filter
    if (activeView.filterRules.length > 0) {
      result = result.filter((row) => {
        const matches = activeView.filterRules.map((rule) => {
          const val = (row as any)[rule.fieldId];
          const strVal = val !== undefined && val !== null ? String(val).toLowerCase() : '';
          const targetVal = rule.value.toLowerCase().trim();

          switch (rule.operator) {
            case 'contains':
              return strVal.includes(targetVal);
            case 'not_contains':
              return !strVal.includes(targetVal);
            case 'equals':
              return strVal === targetVal;
            case 'not_equals':
              return strVal !== targetVal;
            case 'starts_with':
              return strVal.startsWith(targetVal);
            case 'is_empty':
              return strVal === '';
            case 'is_not_empty':
              return strVal !== '';
            default:
              return true;
          }
        });

        if (activeView.filterLogic === 'AND') {
          return matches.every(Boolean);
        } else {
          return matches.some(Boolean);
        }
      });
    }

    // (2) Sort
    if (activeView.sortRules.length > 0) {
      result.sort((a, b) => {
        for (const rule of activeView.sortRules) {
          const valA = (a as any)[rule.fieldId];
          const valB = (b as any)[rule.fieldId];

          if (valA === valB) continue;
          if (valA === undefined || valA === null) return 1;
          if (valB === undefined || valB === null) return -1;

          let cmp = 0;
          if (typeof valA === 'number' && typeof valB === 'number') {
            cmp = valA - valB;
          } else {
            cmp = String(valA).localeCompare(String(valB), 'zh-CN');
          }

          return rule.direction === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return result;
  }, [data, searchQuery, activeView.filterRules, activeView.filterLogic, activeView.sortRules]);

  // (3) Multi-level Hierarchical Grouping
  const groupedData = useMemo<BitableGroupSection<T>[]>(() => {
    const rules: BitableGroupRule[] =
      activeView.groupRules && activeView.groupRules.length > 0
        ? activeView.groupRules
        : activeView.groupByFieldId
        ? [{ id: 'rule-legacy', fieldId: activeView.groupByFieldId, direction: 'asc' }]
        : [];

    if (rules.length === 0) {
      return [
        {
          groupKey: '__ALL__',
          parentKey: undefined,
          fieldId: '',
          fieldLabel: '',
          groupValue: '全部记录',
          groupTitle: '全部记录',
          level: 0,
          direction: 'asc',
          items: processedData,
          isLeaf: true
        }
      ];
    }

    function groupRecursively(
      currentItems: T[],
      ruleIndex: number,
      parentKey: string | undefined,
      currentLevel: number
    ): BitableGroupSection<T>[] {
      if (ruleIndex >= rules.length) return [];

      const currentRule = rules[ruleIndex];
      const fieldId = currentRule.fieldId;
      const colDef = columns.find((c) => c.id === fieldId);
      const fieldLabel = colDef?.label || fieldId;
      const direction = currentRule.direction || 'asc';
      const isLeaf = ruleIndex === rules.length - 1;

      // Group items
      const groupsMap = new Map<string, T[]>();
      currentItems.forEach((item) => {
        const rawVal = (item as any)[fieldId];
        const key =
          rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
            ? String(rawVal).trim()
            : '未设置';
        if (!groupsMap.has(key)) {
          groupsMap.set(key, []);
        }
        groupsMap.get(key)!.push(item);
      });

      // Sort group keys by direction
      const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
        if (a === '未设置') return 1;
        if (b === '未设置') return -1;
        const cmp = a.localeCompare(b, 'zh-CN');
        return direction === 'asc' ? cmp : -cmp;
      });

      const sections: BitableGroupSection<T>[] = [];

      for (const groupVal of sortedKeys) {
        const subItems = groupsMap.get(groupVal)!;
        const groupKey = parentKey
          ? `${parentKey}__${fieldId}:${groupVal}`
          : `${fieldId}:${groupVal}`;
        const groupTitle = `${groupVal}`;

        sections.push({
          groupKey,
          parentKey,
          fieldId,
          fieldLabel,
          groupValue: groupVal,
          groupTitle,
          level: currentLevel,
          direction,
          items: subItems,
          isLeaf
        });

        if (!isLeaf) {
          const children = groupRecursively(
            subItems,
            ruleIndex + 1,
            groupKey,
            currentLevel + 1
          );
          sections.push(...children);
        }
      }

      return sections;
    }

    return groupRecursively(processedData, 0, undefined, 0);
  }, [processedData, activeView.groupRules, activeView.groupByFieldId, columns]);

  // 13. Group Collapse State & Operations
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedGroups({});
  }, [activeView.groupRules, activeView.groupByFieldId, activeViewId]);

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }, []);

  const realGroups = useMemo(() => {
    return groupedData.filter((g) => g.groupKey !== '__ALL__');
  }, [groupedData]);

  const isAllGroupsCollapsed = useMemo(() => {
    return realGroups.length > 0 && realGroups.every((g) => !!collapsedGroups[g.groupKey]);
  }, [realGroups, collapsedGroups]);

  const toggleAllGroupsCollapse = useCallback(() => {
    if (realGroups.length === 0) return;
    if (isAllGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const nextMap: Record<string, boolean> = {};
      realGroups.forEach((g) => {
        nextMap[g.groupKey] = true;
      });
      setCollapsedGroups(nextMap);
    }
  }, [realGroups, isAllGroupsCollapsed]);

  return {
    data,
    processedData,
    groupedData,
    columns,
    /** 当前视图生效的列（视图级隐藏字段已覆盖为 visible:false），表格 / 工具栏用这份 */
    viewColumns,
    visibleColumns: viewColumns.filter((c) => c.visible),
    views,
    activeView,
    activeViewId,
    isMasterView,
    collapsedGroups,
    isAllGroupsCollapsed,
    toggleGroupCollapse,
    toggleAllGroupsCollapse,
    // Operations
    handleSelectView,
    handleCreateView,
    handleDeleteView,
    renameView,
    duplicateView,
    resetActiveView,
    updateViewConfig,
    setViewType,
    setViewScope,
    toggleViewLock,
    toggleColumnVisibility,
    moveColumn,
    moveColumnById,
    addCustomColumn,
    deleteColumn,
    toggleColumnLock,
    toggleColumnFreeze,
    updateColumnType,
    updateColumnConfig,
    resetColumns,
    renameColumn,
    setFilterRules,
    setFilterLogic,
    setSortRules,
    setGroupRules,
    setGroupByFieldId,
    setDensity,
    setColorRules,
    updateCell,
    updateCells,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    addRow,
    deleteRow,
    deleteRows,
    insertRow,
    duplicateRow,
    detachRow,
    moveRow,
    resizeColumn,
    primaryFieldId,
    parentFieldId,
    searchQuery,
    setSearchQuery
  };
}
