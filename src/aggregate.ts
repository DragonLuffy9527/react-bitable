import { toComparable } from './filtering';
import type { BitableFieldType } from './types';

/**
 * 分组汇总（纯函数，无 React 依赖）。
 *
 * 口径说明：
 * - 数字列可求和/平均/最大/最小；日期列只能取最大/最小（求和没有业务含义）；
 * - 计数（count）对任何列都成立，统计「该字段非空」的记录数；
 * - 空值不参与数值计算，也不会被当成 0——否则平均值会被系统性拉低。
 */

export type BitableSummaryType = 'none' | 'sum' | 'avg' | 'max' | 'min' | 'count';

export const SUMMARY_LABELS: Record<BitableSummaryType, string> = {
  none: '不汇总',
  sum: '求和',
  avg: '平均值',
  max: '最大值',
  min: '最小值',
  count: '计数'
};

/** 汇总行里用的短标签，避免把单元格撑宽 */
export const SUMMARY_SHORT_LABELS: Record<BitableSummaryType, string> = {
  none: '',
  sum: '合计',
  avg: '平均',
  max: '最大',
  min: '最小',
  count: '计数'
};

export interface BitableSummaryCell {
  fieldId: string;
  type: BitableSummaryType;
  /** 数值结果（日期列是时间戳），用于排序或二次计算 */
  value: number;
  /** 展示文本，已做千分位 / 日期格式化 */
  text: string;
}

export interface BitableSummaryResult {
  /** 该分组的记录总数 */
  count: number;
  /** fieldId → 汇总结果，只包含配置了汇总的列 */
  cells: Record<string, BitableSummaryCell>;
}

/** 某字段类型下可选的汇总方式 */
export function summaryOptionsFor(type: BitableFieldType): BitableSummaryType[] {
  if (type === 'number') return ['none', 'sum', 'avg', 'max', 'min', 'count'];
  if (type === 'date') return ['none', 'max', 'min', 'count'];
  return ['none', 'count'];
}

/**
 * 解析数字列的汇总方式。
 * rules 里显式写了就听用户的；没写时，若处于分组状态则数字列默认求和
 * （这就是「分组汇总」的默认行为，否则用户分组后什么也看不到）。
 */
export function resolveSummaryType(
  column: { id: string; type: BitableFieldType },
  rules: Record<string, BitableSummaryType> | undefined,
  autoSum: boolean
): BitableSummaryType {
  const explicit = rules?.[column.id];
  if (explicit !== undefined) {
    return summaryOptionsFor(column.type).includes(explicit) ? explicit : 'none';
  }
  if (autoSum && column.type === 'number') return 'sum';
  return 'none';
}

/** 千分位 + 最多两位小数（去掉无意义的 .00） */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(rounded).toString().split('.');
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${sign}${withSeparator}.${decPart}` : `${sign}${withSeparator}`;
}

/** 日期列展示：保留到分钟，纯日期就只留 YYYY-MM-DD */
function formatDateText(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/\//g, '-');
  if (!s) return '';
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return s;
  const [, y, m, d, hh, mm] = match;
  return hh && mm && !(hh === '00' && mm === '00') ? `${y}-${m}-${d} ${hh}:${mm}` : `${y}-${m}-${d}`;
}

function isEmptyCell(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (Array.isArray(raw)) return raw.length === 0;
  return String(raw).trim() === '';
}

export function computeSummary(
  items: Record<string, unknown>[],
  columns: { id: string; type: BitableFieldType }[],
  rules: Record<string, BitableSummaryType> | undefined,
  autoSum: boolean
): BitableSummaryResult {
  const cells: Record<string, BitableSummaryCell> = {};

  for (const col of columns) {
    const type = resolveSummaryType(col, rules, autoSum);
    if (type === 'none') continue;

    if (type === 'count') {
      let nonEmpty = 0;
      for (const item of items) {
        if (!isEmptyCell(item[col.id])) nonEmpty++;
      }
      cells[col.id] = { fieldId: col.id, type, value: nonEmpty, text: formatNumber(nonEmpty) };
      continue;
    }

    if (col.type === 'date') {
      let bestTs: number | null = null;
      let bestText = '';
      for (const item of items) {
        const raw = item[col.id];
        if (isEmptyCell(raw)) continue;
        const ts = toComparable('date', raw);
        if (typeof ts !== 'number') continue;
        const better = bestTs === null || (type === 'max' ? ts > bestTs : ts < bestTs);
        if (better) {
          bestTs = ts;
          bestText = formatDateText(raw);
        }
      }
      if (bestTs !== null) {
        cells[col.id] = { fieldId: col.id, type, value: bestTs, text: bestText };
      }
      continue;
    }

    // 数值列
    let total = 0;
    let count = 0;
    let max = -Infinity;
    let min = Infinity;
    for (const item of items) {
      const n = toComparable('number', item[col.id]);
      if (typeof n !== 'number') continue;
      total += n;
      count++;
      if (n > max) max = n;
      if (n < min) min = n;
    }
    if (count === 0) continue;

    const value = type === 'sum' ? total : type === 'avg' ? total / count : type === 'max' ? max : min;
    cells[col.id] = { fieldId: col.id, type, value, text: formatNumber(value) };
  }

  return { count: items.length, cells };
}

/** 有任何一个可展示的汇总单元格时，汇总行才值得渲染 */
export function hasSummaryCells(result: BitableSummaryResult | undefined): boolean {
  return !!result && Object.keys(result.cells).length > 0;
}
