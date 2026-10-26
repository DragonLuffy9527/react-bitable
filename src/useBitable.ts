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

/**
 * SSR 安全的 storage 适配。
 * 多维表的列配置 / 视图 / 行数据都持久化在 localStorage；
 * 在没有 window 的环境（SSR、Node 预渲染、Web Worker）下降级为空实现，
 * 表格仍然可用（只是不持久化），不会因为 `localStorage is not defined` 崩掉。
 */
const memoryFallback = new Map<string, string>();
const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: (key: string) => memoryFallback.get(key) ?? null,
        setItem: (key: string, value: string) => void memoryFallback.set(key, value),
        removeItem: (key: string) => void memoryFallback.delete(key)
      };

/**
 * 自动补的「父级记录」字段 id。
 * 父子记录需要一格存放父行主键，不能占用主字段（会覆盖图号/编号并让层级成环），
 * 所以拖拽建立子记录时自动补这个隐藏字段。
 */
const PARENT_FIELD_ID = 'parentRecordKey';

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
}

export function useBitable<T extends { id: string }>({
  storageKey,
  initialData,
  defaultColumns,
  presetViews,
  onDataChange,
  schemaVersion
}: UseBitableOptions<T>) {
  /**
   * 1. Data state
   *
   * 多账套 / 多项目场景下，调用方会在 `storageKey` 里拼上当前上下文 id，切换时 key 会变。
   * 如果只在挂载时读一次存储，切上下文后表格仍显示上一个上下文的行，
   * 甚至把两边的行混在一起。这里把读取逻辑抽成函数，
   * 并在 storageKey 变化时整体重置（见下方 useEffect）。
   */
  const loadData = (): T[] => {
    try {
      /**
       * schemaVersion 同时也是「内置示例数据」的版本号：
       * 版本号变了说明代码里的初始数据已经换过，
       * 此时必须整体回落到 initialData，否则老浏览器会一直显示上一版的行内容。
       * 版本号一致时保留用户的行内编辑。
       */
      const savedSchema = storage.getItem(`${storageKey}_schema_version`);
      if (schemaVersion && savedSchema !== schemaVersion) {
        return initialData;
      }

      const savedData = storage.getItem(`${storageKey}_data`);
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
      const savedDeleted = storage.getItem(`${storageKey}_deleted_col_ids`);
      const deletedIds = new Set<string>(savedDeleted ? JSON.parse(savedDeleted) : []);

      const savedCols = storage.getItem(`${storageKey}_columns`);
      if (savedCols) {
        const parsed: BitableColumnConfig<T>[] = JSON.parse(savedCols);

        // 字段表结构升级：整体回落到代码定义的列（保留用户自定义列与删除记录）
        const savedSchema = storage.getItem(`${storageKey}_schema_version`);
        if (schemaVersion && savedSchema !== schemaVersion) {
          const customs = parsed.filter((c) => c.isCustom && !deletedIds.has(c.id));
          return [...defaultColumns, ...customs];
        }

        // Merge with code defaults: keep user renamed labels for editable/custom fields, while preserving code render functions and locking admin fields
        const existingIds = new Set(parsed.map((c) => c.id));
        const missingDefaults = defaultColumns.filter(
          (d) => !existingIds.has(d.id) && !deletedIds.has(d.id)
        );
        return [
          ...parsed
            .filter(
              (col) =>
                !deletedIds.has(col.id) &&
                // 代码侧已经删掉/替换掉的默认列
                // 不能再留着，否则 original 找不到 render，会渲染成一列空白
                (col.isCustom || defaultColumns.some((d) => d.id === col.id))
            )
            .map((col) => {
              const original = defaultColumns.find((d) => d.id === col.id);
              const isLocked =
                col.isLocked !== undefined
                  ? col.isLocked
                  : (original?.isLocked ?? (original?.editable === false));
              const isEditable = !isLocked;
              const isCustom = !!col.isCustom;
              // Admin-configured fields CANNOT have their names changed (always enforce original code label)
              const resolvedLabel = (isEditable || isCustom)
                ? (col.label || original?.label || '')
                : (original?.label || col.label || '');

              return {
                ...original,
                ...col,
                label: resolvedLabel,
                isLocked,
                editable: isEditable,
                type: col.type || original?.type || 'text',
                render: original?.render,
                options: col.options || original?.options
              };
            }),
          ...missingDefaults
        ];
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
      const savedViews = storage.getItem(`${storageKey}_views`);
      if (savedViews) {
        let parsed: BitableViewConfig[] = JSON.parse(savedViews);
        if (Array.isArray(parsed) && parsed.length > 0) {
          /**
           * 主视图（presetViews[0]）恒定钉在第一位，且不可删除、不可改名。
           * 这里只做「归位」：已存的同名视图挪回首位并保留用户对它的配置；
           * 丢了就补一份新的。名字与图标完全以 presetViews[0] 为准，不做硬编码改名。
           */
          const masterPreset = presetViews[0];
          if (masterPreset) {
            const masterIdx = parsed.findIndex((v) => v.id === masterPreset.id);
            if (masterIdx > 0) {
              const [masterItem] = parsed.splice(masterIdx, 1);
              parsed.unshift(masterItem);
            } else if (masterIdx < 0) {
              parsed.unshift({ ...masterPreset });
            }
          }
          const normalized = parsed.map((v) => ({
            ...v,
            viewType: v.viewType || 'grid',
            scope: v.scope || 'collaborative',
            isLocked: !!v.isLocked,
            groupRules:
              v.groupRules && v.groupRules.length > 0
                ? v.groupRules
                : v.groupByFieldId
                ? [{ id: 'rule-legacy', fieldId: v.groupByFieldId, direction: 'asc' as const }]
                : []
          }));
          return normalized;
        }
      }
    } catch {
      // ignore
    }
    return presetViews.map((v) => ({
      ...v,
      viewType: v.viewType || 'grid',
      scope: v.scope || 'collaborative',
      isLocked: !!v.isLocked,
      groupRules:
        v.groupRules && v.groupRules.length > 0
          ? v.groupRules
          : v.groupByFieldId
          ? [{ id: 'rule-legacy', fieldId: v.groupByFieldId, direction: 'asc' as const }]
          : []
    }));
  };

  const [views, setViews] = useState<BitableViewConfig[]>(loadViews);

  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadActiveViewId = (): string => {
    try {
      const savedActive = storage.getItem(`${storageKey}_active_view_id`);
      if (savedActive) {
        return savedActive;
      }
    } catch {
      // ignore
    }
    return presetViews[0]?.id || 'all';
  };

  const [activeViewId, setActiveViewId] = useState<string>(loadActiveViewId);

  /**
   * 切换上下文（storageKey 变化）时整体重置表格状态。
   *
   * 不重置的话，上一个上下文的行、列配置、视图与分组都会留在界面上，
   * 表现为「切到 B 项目后仍显示 A 项目的行，行数是两边之和」。
   * 这里按新的 storageKey 重新读取各自的 localStorage 缓存，
   * 没有缓存时回落到代码定义的默认值。
   */
  const prevStorageKeyRef = useRef(storageKey);
  useEffect(() => {
    if (prevStorageKeyRef.current === storageKey) return;
    prevStorageKeyRef.current = storageKey;
    setData(loadData());
    setColumns(loadColumns());
    setViews(loadViews());
    setActiveViewId(loadActiveViewId());
    setSearchQuery('');
    // 已知 id 集合也要跟着换，否则增量并入逻辑会把新上下文的行追加到旧行后面
    knownIdsRef.current = new Set(initialData.map((row) => row.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Current active view configuration
  const activeView = useMemo(() => {
    return views.find((v) => v.id === activeViewId) || views[0] || presetViews[0];
  }, [views, activeViewId, presetViews]);

  // 当前视图是否为主视图（主视图 = 视图列表第一位，受保护：不可删除、不可改名）
  const isMasterView = useMemo(() => {
    return activeViewId === views[0]?.id;
  }, [activeViewId, views]);

  // Sync to localStorage
  useEffect(() => {
    try {
      storage.setItem(`${storageKey}_data`, JSON.stringify(data));
      onDataChange?.(data);
    } catch {
      // ignore
    }
  }, [data, storageKey, onDataChange]);

  useEffect(() => {
    try {
      storage.setItem(`${storageKey}_columns`, JSON.stringify(columns.map(({ render, ...rest }) => rest)));
      if (schemaVersion) {
        storage.setItem(`${storageKey}_schema_version`, schemaVersion);
      }
    } catch {
      // ignore
    }
  }, [columns, storageKey, schemaVersion]);

  useEffect(() => {
    try {
      storage.setItem(`${storageKey}_views`, JSON.stringify(views));
    } catch {
      // ignore
    }
  }, [views, storageKey]);

  useEffect(() => {
    try {
      storage.setItem(`${storageKey}_active_view_id`, activeViewId);
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
      isLocked: false
    };
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newViewId);
    return newView;
  };

  const updateViewConfig = (viewId: string, updates: Partial<BitableViewConfig>) => {
    setViews((prev) =>
      prev.map((v) => (v.id === viewId ? { ...v, ...updates } : v))
    );
  };

  const setViewType = (type: BitableViewType) => {
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
    updateActiveView((prev) => ({ ...prev, scope }));
  };

  const toggleViewLock = () => {
    updateActiveView((prev) => ({ ...prev, isLocked: !prev.isLocked }));
  };

  const handleDeleteView = (viewId: string): boolean => {
    const targetIndex = views.findIndex((v) => v.id === viewId);
    if (targetIndex === 0) {
      return false; // 主视图（第一位）不可删除
    }
    if (views.length <= 1) return false;
    const remaining = views.filter((v) => v.id !== viewId);
    setViews(remaining);
    if (activeViewId === viewId) {
      setActiveViewId(remaining[0].id);
    }
    return true;
  };

  const renameView = (viewId: string, newName: string) => {
    const targetIndex = views.findIndex((v) => v.id === viewId);
    if (targetIndex === 0) {
      return; // 主视图（第一位）不可改名
    }
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
      name: `${target.name} (副本)`
    };
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newId);
    return newView;
  };

  // 5. Column Operations
  const toggleColumnVisibility = (columnId: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, visible: !col.visible } : col))
    );
  };

  const moveColumn = (dragIndex: number, hoverIndex: number) => {
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

    setColumns((prev) => prev.filter((c) => c.id !== columnId));

    try {
      const savedDeleted = storage.getItem(`${storageKey}_deleted_col_ids`);
      const deletedSet = new Set<string>(savedDeleted ? JSON.parse(savedDeleted) : []);
      deletedSet.add(columnId);
      storage.setItem(`${storageKey}_deleted_col_ids`, JSON.stringify(Array.from(deletedSet)));
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
        groupByFieldId: v.groupByFieldId === columnId ? null : v.groupByFieldId
      }))
    );

    return true;
  };

  const toggleColumnLock = (columnId: string) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        if (col.type === 'action') return col;
        const nextLocked = !col.isLocked;
        return {
          ...col,
          isLocked: nextLocked,
          editable: !nextLocked
        };
      })
    );
  };

  const updateColumnType = (
    columnId: string,
    newType: BitableFieldType,
    options?: BitableSelectOption[]
  ) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        if (col.isLocked) return col; // Locked fields cannot change type

        const defaultSelectOptions = [
          { label: '选项1', value: '选项1', color: 'bg-blue-50 text-[#005BAC] border-blue-200' },
          { label: '选项2', value: '选项2', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: '选项3', value: '选项3', color: 'bg-slate-100 text-slate-700 border-slate-200' }
        ];

        return {
          ...col,
          type: newType,
          options:
            newType === 'select'
              ? (options && options.length > 0
                  ? options
                  : col.options && col.options.length > 0
                  ? col.options
                  : defaultSelectOptions)
              : col.options
        };
      })
    );
  };

  const updateColumnConfig = (columnId: string, updates: Partial<BitableColumnConfig<T>>) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, ...updates } : col))
    );
  };

  const resetColumns = () => {
    try {
      storage.removeItem(`${storageKey}_deleted_col_ids`);
      storage.removeItem(`${storageKey}_columns`);
    } catch {
      // ignore
    }
    setColumns(defaultColumns);
  };

  const toggleColumnFreeze = (columnId: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, isFrozen: !col.isFrozen } : col))
    );
  };

  const renameColumn = (columnId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        // Strictly prohibit renaming locked or administrator-configured fields
        if (col.isLocked || (!col.editable && !col.isCustom)) return col;
        return { ...col, label: trimmed };
      })
    );
  };

  // 6. Filter Operations
  const setFilterRules = (rules: BitableFilterRule[]) => {
    updateActiveView((prev) => ({ ...prev, filterRules: rules }));
  };

  const setFilterLogic = (logic: 'AND' | 'OR') => {
    updateActiveView((prev) => ({ ...prev, filterLogic: logic }));
  };

  // 7. Sort Operations
  const setSortRules = (rules: BitableSortRule[]) => {
    updateActiveView((prev) => ({ ...prev, sortRules: rules }));
  };

  // 8. Group Operations
  const setGroupRules = (rules: BitableGroupRule[]) => {
    updateActiveView((prev) => ({
      ...prev,
      groupRules: rules,
      groupByFieldId: rules.length > 0 ? rules[0].fieldId : null
    }));
  };

  const setGroupByFieldId = (fieldId: string | null) => {
    updateActiveView((prev) => ({
      ...prev,
      groupByFieldId: fieldId,
      groupRules: fieldId ? [{ id: `group_${Date.now()}`, fieldId, direction: 'asc' }] : []
    }));
  };

  // 9. Density Operations
  const setDensity = (density: BitableDensity) => {
    updateActiveView((prev) => ({ ...prev, density }));
  };

  // 10. Color Rules Operations
  const setColorRules = (colorRules: BitableColorRule[]) => {
    updateActiveView((prev) => ({ ...prev, colorRules }));
  };

  // 11. Row Operations (Inline Editing)
  const updateCell = (rowId: string, fieldId: string, value: any) => {
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

  const addRow = (initialValues?: Partial<T>) => {
    const newId = `row_${Date.now()}`;
    const newRow = {
      id: newId,
      ...initialValues
    } as T;
    setData((prev) => [newRow, ...prev]);
    return newRow;
  };

  const deleteRow = (rowId: string) => {
    setData((prev) => prev.filter((item) => item.id !== rowId));
  };

  const deleteRows = (rowIds: string[]) => {
    const idSet = new Set(rowIds);
    setData((prev) => prev.filter((item) => !idSet.has(item.id)));
  };

  // —— 11.1 行级结构操作（插入空白行 / 复制行 / 拖拽排序 / 父子记录 / 列宽） ——

  /** 主字段（第一个可见非操作列）：父子记录用它作为父记录的引用键 */
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
   * （否则把子记录 A-103 的父级写成 A-101 时，会覆盖掉它自己的主键，层级直接成环）。
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
          description: '父子记录：填写父记录的主键值（如 A-101），本行即成为其子记录'
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
    const newRow = makeBlankRow(values);
    const anchor = anchorRowId ? data.find((r) => r.id === anchorRowId) : undefined;

    /**
     * 主字段若是锁定列（如系统编号），表格里无法手动录入，
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

    // 父级字段：复用视图已配置的字段；拖拽成子记录时若未配置则自动补一个
    const hierarchyFieldId =
      position === 'child'
        ? ensureParentField()
        : parentFieldId && parentFieldId !== primaryFieldId
        ? parentFieldId
        : null;

    // 父子引用可能存的是行 id，也可能存的是主字段值，先建双向索引
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
    visibleColumns: columns.filter((c) => c.visible),
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
