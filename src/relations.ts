/**
 * 表间关联（Link to Record）与跨表查找引用（Lookup）纯函数模块 —— 无 React 依赖。
 *
 * 覆盖：
 * 1. 关联记录 ID 归一化解析（resolveLinkedRecordIds）
 * 2. 关联记录文本渲染标签提取（formatLinkedRecordDisplay）
 * 3. 跨表 Lookup 动态投影计算（computeLookupValue / computeRowLookups / applyLookupsToRows）
 */
import type {
  BitableColumnConfig,
  BitableLinkedTableAccessor,
  BitableLinkConfig,
  BitableLookupConfig
} from './types';

/**
 * 将任意形式的关联值（数组、逗号分隔串、单 ID 字符串、对象数组）规范化为干净的 ID 字符串数组（去重且去空）
 */
export function resolveLinkedRecordIds(value: any): string[] {
  if (value === null || value === undefined) return [];

  const rawList: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) rawList.push(trimmed);
      } else if (item && typeof item === 'object' && 'id' in item) {
        const id = String(item.id).trim();
        if (id) rawList.push(id);
      }
    }
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    // 尝试解析 JSON 数组字符串，如 '["rec_1", "rec_2"]'
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return resolveLinkedRecordIds(parsed);
        }
      } catch {
        // 解析失败则按常规分隔符降级处理
      }
    }

    // 支持逗号、顿号、分号分隔
    if (/[,\u3001;\|]/.test(trimmed)) {
      const parts = trimmed.split(/[,\u3001;\|]/);
      for (const p of parts) {
        const s = p.trim();
        if (s) rawList.push(s);
      }
    } else {
      rawList.push(trimmed);
    }
  } else if (typeof value === 'object' && 'id' in value) {
    const id = String(value.id).trim();
    if (id) rawList.push(id);
  }

  // 保持插入顺序的去重
  return Array.from(new Set(rawList));
}

/**
 * 根据 ID 列表从目标数据行中筛选匹配的记录列表（保持请求 ID 的先后顺序）
 */
export function getLinkedRecords(targetRows: any[], linkedIds: string[]): any[] {
  if (!targetRows || targetRows.length === 0 || !linkedIds || linkedIds.length === 0) {
    return [];
  }

  const rowMap = new Map<string, any>();
  for (const r of targetRows) {
    if (r && r.id !== undefined && r.id !== null) {
      rowMap.set(String(r.id), r);
    }
  }

  const result: any[] = [];
  for (const id of linkedIds) {
    const matched = rowMap.get(id);
    if (matched) {
      result.push(matched);
    }
  }
  return result;
}

/**
 * 格式化关联记录的显示标题
 * 优先取 targetFieldId，其次取目标表首个有效文本列，最后 fallback 到 title/name/code/id
 */
export function formatLinkedRecordDisplay(
  record: any,
  targetColumns: BitableColumnConfig<any>[] = [],
  targetFieldId?: string
): string {
  if (!record || typeof record !== 'object') return '';

  // 1. 指定了目标展示字段且有值
  if (targetFieldId && record[targetFieldId] !== undefined && record[targetFieldId] !== null) {
    const val = String(record[targetFieldId]).trim();
    if (val) return val;
  }

  // 2. 从目标表列中查找候选主标题列（首个可见非后台/非附件文本类列）
  const candidateCol = targetColumns.find(
    (c) =>
      c.visible &&
      c.type !== 'action' &&
      c.type !== 'attachment' &&
      c.type !== 'link' &&
      c.type !== 'lookup'
  );
  if (candidateCol && record[candidateCol.id] !== undefined && record[candidateCol.id] !== null) {
    const val = String(record[candidateCol.id]).trim();
    if (val) return val;
  }

  // 3. 常规业务字段备选
  const fallbackKeys = ['title', 'name', 'label', 'code', 'id'];
  for (const key of fallbackKeys) {
    if (record[key] !== undefined && record[key] !== null) {
      const val = String(record[key]).trim();
      if (val) return val;
    }
  }

  return '未命名记录';
}

/**
 * 计算单行的指定 Lookup 字段值
 *
 * @param row 本表记录
 * @param linkFieldId 关联字段 ID
 * @param targetFieldId 目标表中要投影的字段 ID
 * @param targetRows 目标表记录集
 * @param multiple 是否允许多值（多值返回数组，单值返回第一个或空字符串）
 */
export function computeLookupValue(
  row: any,
  linkFieldId: string,
  targetFieldId: string,
  targetRows: any[],
  multiple?: boolean
): any {
  if (!row || !linkFieldId || !targetFieldId || !targetRows) {
    return multiple ? [] : '';
  }

  const linkedIds = resolveLinkedRecordIds(row[linkFieldId]);
  if (linkedIds.length === 0) {
    return multiple ? [] : '';
  }

  const matchedRecords = getLinkedRecords(targetRows, linkedIds);
  if (matchedRecords.length === 0) {
    return multiple ? [] : '';
  }

  const extractedValues = matchedRecords
    .map((r) => r[targetFieldId])
    .filter((v) => v !== undefined && v !== null && v !== '');

  if (multiple) {
    return extractedValues;
  }

  return extractedValues.length > 0 ? extractedValues[0] : '';
}

/**
 * 为单条记录计算所有 Lookup 字段的投影值
 */
export function computeRowLookups<T extends Record<string, any>>(
  row: T,
  columns: BitableColumnConfig<any>[],
  getLinkedTableData?: BitableLinkedTableAccessor
): T {
  if (!row || !columns || !getLinkedTableData) return row;

  const result: any = { ...row };
  let hasChanges = false;

  for (const col of columns) {
    if (col.type !== 'lookup' || !col.lookupConfig) continue;

    const { linkFieldId, targetFieldId, targetTableId: explicitTableId } = col.lookupConfig;
    if (!linkFieldId || !targetFieldId) continue;

    // 获取对应的 link 列以推导目标表 ID
    const linkCol = columns.find((c) => c.id === linkFieldId);
    const targetTableId = explicitTableId || linkCol?.linkConfig?.targetTableId;
    if (!targetTableId) continue;

    const targetTable = getLinkedTableData(targetTableId);
    const targetRows = targetTable?.data || [];

    const isMultiple = linkCol?.linkConfig?.multiple !== false;
    const computedVal = computeLookupValue(row, linkFieldId, targetFieldId, targetRows, isMultiple);

    result[col.id] = computedVal;
    hasChanges = true;
  }

  return (hasChanges ? result : row) as T;
}

/**
 * 批量为多行数据计算并注入 Lookup 投影值
 */
export function applyLookupsToRows<T extends Record<string, any>>(
  rows: T[],
  columns: BitableColumnConfig<any>[],
  getLinkedTableData?: BitableLinkedTableAccessor
): T[] {
  if (!rows || rows.length === 0 || !columns || !getLinkedTableData) {
    return rows;
  }

  const hasLookup = columns.some((c) => c.type === 'lookup' && !!c.lookupConfig);
  if (!hasLookup) {
    return rows;
  }

  return rows.map((r) => computeRowLookups(r, columns, getLinkedTableData));
}
