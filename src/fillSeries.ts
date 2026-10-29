import { BitableFieldType } from './types';

/**
 * 拖拽填充（Excel 式「下拉递增 / 复制」）的纯函数层。
 *
 * 这里只负责「根据源值 + 步长推出每一行的目标值」，不涉及任何 React / DOM，
 * 便于在 BitableTable 里复用、也便于出问题时单独验证。
 */

export interface BitableFillUpdate {
  rowId: string;
  fieldId: string;
  value: any;
}

/** 允许拖拽填充的字段类型：与 EditableCell 里「点击即进入编辑」的几类保持一致 */
const FILLABLE_TYPES: BitableFieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'multiSelect',
  'user',
  'group',
  'url',
  'badge',
  'boolean'
];

export const isFillableFieldType = (type: BitableFieldType) =>
  FILLABLE_TYPES.includes(type);

const isEmptyValue = (value: any) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

/** 多值字段（多选 / 人员 / 群组）必须深拷贝，避免多行共享同一个数组引用 */
const cloneValue = (value: any) => (Array.isArray(value) ? [...value] : value);

/**
 * 文本末尾数字递增：`A-101 → A-102`、`PP-A102-01 → PP-A102-02`、`01 → 02`。
 * 没有末尾数字（如「已归档」）时保持原值，等价于复制。
 */
export const incrementTrailingNumber = (text: string, step: number): string => {
  const matched = text.match(/^(.*?)(\d+)(\D*)$/);
  if (!matched) return text;
  const [, prefix, digits, suffix] = matched;
  const next = Number(digits) + step;
  if (!Number.isFinite(next) || next < 0) return text;
  // 保留前导零长度（01 → 02），位数变长时自然扩展（99 → 100）
  return `${prefix}${String(next).padStart(digits.length, '0')}${suffix}`;
};

/** 日期按天偏移，只处理 `YYYY-MM-DD`（其余格式原样复制，避免猜错格式把值写坏） */
export const addDaysToDateText = (text: string, step: number): string => {
  const matched = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return text;
  const [, y, m, d] = matched;
  const base = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (!Number.isFinite(base)) return text;
  const next = new Date(base + step * 86400000);
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
};

/**
 * 按字段类型推算第 n 步之后的值。
 * step = 0 表示「复制」（Shift 拖拽 / 非数值类字段）。
 */
export const incrementValue = (
  type: BitableFieldType,
  value: any,
  step: number
): any => {
  if (isEmptyValue(value)) return cloneValue(value);
  if (step === 0) return cloneValue(value);

  if (type === 'number') {
    const num = Number(String(value).trim());
    if (!Number.isFinite(num)) return cloneValue(value);
    const next = num + step;
    // 原值存的是字符串就仍回写字符串，保持和 EditableCell 的 input value 一致
    return typeof value === 'number' ? next : String(next);
  }

  if (type === 'date') {
    return addDaysToDateText(String(value), step);
  }

  // 文本 / 状态标签：末尾数字递增，无数字则复制
  if (type === 'text' || type === 'badge') {
    return incrementTrailingNumber(String(value), step);
  }

  // 单选 / 多选 / 人员 / 群组 / 超链接 / 复选框：均按复制处理
  return cloneValue(value);
};

export interface BuildFillPlanOptions {
  fieldId: string;
  type: BitableFieldType;
  sourceValue: any;
  /** 目标行 id，按「离源行由近到远」排序，不含源行本身 */
  targetRowIds: string[];
  /** Shift 拖拽：强制只复制不递增 */
  copyOnly?: boolean;
  /** 递增方向：向下 1、向上 -1 */
  direction?: 1 | -1;
}

export const buildFillPlan = ({
  fieldId,
  type,
  sourceValue,
  targetRowIds,
  copyOnly = false,
  direction = 1
}: BuildFillPlanOptions): BitableFillUpdate[] =>
  targetRowIds.map((rowId, index) => ({
    rowId,
    fieldId,
    value: incrementValue(
      type,
      sourceValue,
      copyOnly ? 0 : direction * (index + 1)
    )
  }));
