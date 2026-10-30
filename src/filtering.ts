import type { BitableFieldType, BitableFilterRule, FilterOperator } from './types';

/**
 * 筛选求值（纯函数，无 React 依赖）。
 *
 * 抽出来的理由有三个：
 * 1. 可以脱离组件单测——比较类操作符的边界（空值、非法数字、日期格式）最容易写错；
 * 2. 仪表盘 / 统计这类只读场景也要用同一套口径，不能各写一遍；
 * 3. 操作符的适用范围（哪些列能用「大于」）和求值逻辑必须同源，
 *    否则 UI 放开一个操作符、求值端却不认识，会静默返回全量数据。
 */

/** 比较语义：数字和日期能比大小，其余一律按文本处理 */
export type ComparableKind = 'number' | 'date' | 'text';

/**
 * 筛选只需要「字段 id + 类型」两件事。
 * 不直接收 BitableColumnConfig 是因为它的 render 回调带泛型参数，
 * 在不同 T 之间不兼容，会把纯函数拖进类型泥潭。
 */
export interface FilterColumnLike {
  id: string;
  type: BitableFieldType;
}

/** 文本类字段：模糊匹配有意义，大小比较没有 */
export const TEXT_OPERATORS: FilterOperator[] = [
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'starts_with',
  'is_empty',
  'is_not_empty'
];

/** 数字/日期字段：放开大小比较与区间；保留 equals 用于「正好等于某个值/某一天」 */
export const ORDERED_OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_empty',
  'is_not_empty'
];

export function resolveComparableKind(type: BitableFieldType | undefined): ComparableKind {
  if (type === 'number' || type === 'currency' || type === 'progress' || type === 'rating') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

export function operatorsFor(kind: ComparableKind): FilterOperator[] {
  return kind === 'text' ? TEXT_OPERATORS : ORDERED_OPERATORS;
}

/**
 * 把单元格值归一成可比较的量：数字列取数值，日期列取时间戳，其余取小写文本。
 * 空值对数字/日期返回 null（表示「无法比较」，不是 0），对文本返回空串。
 */
export function toComparable(kind: ComparableKind, raw: unknown): number | string | null {
  if (raw === undefined || raw === null) return kind === 'text' ? '' : null;

  if (kind === 'number') {
    // 用户从 Excel 粘过来的值常带千分位、货币符号、百分号
    const cleaned = String(raw).replace(/[,\s¥$€£%]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  if (kind === 'date') {
    const s = String(raw).trim();
    if (!s) return null;
    // 「2026/10/08」在 Safari 里 Date.parse 直接返回 NaN，统一换成短横线再解析
    const t = Date.parse(s.replace(/\//g, '-'));
    return Number.isNaN(t) ? null : t;
  }

  return String(raw).toLowerCase();
}

/**
 * 返回 -1 / 0 / 1；任一侧不可比较时返回 null。
 * 比较类操作符统一走它，避免每个 case 各写一遍类型判断。
 */
export function compareValues(kind: ComparableKind, raw: unknown, target: string): number | null {
  const a = toComparable(kind, raw);
  const b = toComparable(kind, target);
  if (a === null || b === null) return null;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** 单条规则的判定；遇到未知操作符放行（宁可少筛，也不要莫名清空表格） */
export function matchesRule(row: Record<string, unknown>, rule: BitableFilterRule, kind: ComparableKind): boolean {
  const val = row[rule.fieldId];
  const strVal = val !== undefined && val !== null ? String(val).toLowerCase() : '';
  const targetVal = (rule.value ?? '').toLowerCase().trim();

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
    case 'gt': {
      const c = compareValues(kind, val, rule.value ?? '');
      return c !== null && c > 0;
    }
    case 'gte': {
      const c = compareValues(kind, val, rule.value ?? '');
      return c !== null && c >= 0;
    }
    case 'lt': {
      const c = compareValues(kind, val, rule.value ?? '');
      return c !== null && c < 0;
    }
    case 'lte': {
      const c = compareValues(kind, val, rule.value ?? '');
      return c !== null && c <= 0;
    }
    case 'between': {
      // 上下界写反了也照样能用，不让用户为顺序买单
      const c1 = compareValues(kind, val, rule.value ?? '');
      const c2 = compareValues(kind, val, rule.value2 ?? '');
      if (c1 === null || c2 === null) return false;
      return (c1 >= 0 && c2 <= 0) || (c1 <= 0 && c2 >= 0);
    }
    default:
      return true;
  }
}

/**
 * 对整个数据集应用筛选规则。
 * 规则为空时原样返回入参（保持引用不变，避免下游 memo 无谓重算）。
 */
export function applyFilterRules<T extends Record<string, unknown>>(
  rows: T[],
  rules: BitableFilterRule[],
  logic: 'AND' | 'OR',
  columns: FilterColumnLike[]
): T[] {
  if (rules.length === 0) return rows;

  const kindByField = new Map<string, ComparableKind>();
  for (const col of columns) {
    kindByField.set(col.id, resolveComparableKind(col.type));
  }

  return rows.filter((row) => {
    const results = rules.map((rule) =>
      matchesRule(row as Record<string, unknown>, rule, kindByField.get(rule.fieldId) ?? 'text')
    );
    return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  });
}
