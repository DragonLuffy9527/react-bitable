import type { BitableSelectOption } from './types';

/**
 * 单选项配色盘。文本列改成单选时，按现有数据的去重值自动建选项并依次取色，
 * 这样「改成单选」立刻就能看到每种状态各自的底色，不用手填一遍选项。
 * 与 BitableFieldConfigPopover.parseSelectOptions 用同一套色阶，保持一致观感。
 *
 * 放在这里而不是 useBitable，是为了让 spreadsheet.ts 这类纯函数模块
 * 能直接引用，而不必 import 一个带 React 状态的 hook 文件。
 */
export const SELECT_OPTION_PALETTE = [
  'bg-blue-50 text-[#005BAC] border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-rose-50 text-rose-700 border-rose-200'
];

/**
 * 多值字段（多选 / 人员 / 群组）的取值归一化。
 *
 * 统一把单元格原始值转成「字符串数组」，供 EditableCell（表格行内）、
 * cardModel（看板/画册/甘特卡片）、BitableFormView（表单视图）共用。
 *
 * 为什么要容忍字符串：字段类型可以被用户随时切换。把一个原本的文本列改成
 * 「人员」时，历史数据仍是 `'张伟'` 甚至 `'张伟、李强'`，不能因为拿到的不是
 * 数组就直接渲染失败或变成 `张伟,李强` 一整坨。
 */
export function toValueList(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  // 中文顿号 / 中英文逗号 / 分号都视为分隔符（工程台账里这几种写法都有人用）
  if (/[,，、;；]/.test(s)) {
    return s
      .split(/[,，、;；]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [s];
}

/** 单值字段取值：原多选列改成单选时只取第一个，避免显示成 `a,b` */
export function firstValue(raw: unknown): string {
  return toValueList(raw)[0] || '';
}

/** 选项查找：`value` 与 `label` 都匹配，兼容手填的历史数据 */
export function findOption(
  options: BitableSelectOption[] | undefined,
  value: string
): BitableSelectOption | undefined {
  if (!options || !value) return undefined;
  return options.find((o) => o.value === value || o.label === value);
}

export const FALLBACK_OPTION_COLOR = 'bg-slate-100 text-slate-700 border-slate-200';

/**
 * 多选值 → 带配色的选项数组。
 * 值不在选项列表里时按原值兜底（灰胶囊），既不丢数据也不报错——与飞书行为一致。
 */
export function resolveOptionList(
  options: BitableSelectOption[] | undefined,
  raw: unknown
): BitableSelectOption[] {
  return toValueList(raw).map((v) => {
    const opt = findOption(options, v);
    return opt || { label: v, value: v, color: FALLBACK_OPTION_COLOR };
  });
}

/**
 * 超链接归一化：用户常只填 `xxx.com/a.pdf`，补上协议头才能正确跳转。
 * 已经是 `http(s)://`、`//`、`mailto:`、`tel:` 的原样保留。
 */
export function normalizeUrl(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (/^(mailto:|tel:)/i.test(s)) return s;
  return `https://${s}`;
}

/** 超链接展示文本：去掉协议头与末尾斜杠，过长由 CSS 截断 */
export function displayUrl(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

/**
 * 人员头像缩写：16px 圆点里只放得下 1 个汉字。
 * 中文取**姓氏**（首字），英文取前两位大写；不要取全名——两字名「张伟」
 * 会在圆点里塞进两个字，和大字号的姓名并排显示成「张伟 张伟」。
 */
export function initialsOf(name: string): string {
  const s = (name || '').trim();
  if (!s) return '?';
  if (/^[\u4e00-\u9fa5]/.test(s)) return s.charAt(0);
  return s.slice(0, 2).toUpperCase();
}

/** 判断字段是否属于「多值」类型，供表格/卡片统一判定 */
export const isMultiValueType = (type: string): boolean =>
  type === 'multiSelect' || type === 'user' || type === 'group';

/**
 * 货币数值解析：剔除千分位、货币符号与空格后转数字。
 * 空值或非法输入返回 null。
 */
export function parseCurrency(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/[,\s¥$€£]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * 货币格式化：带千分位与两位小数。
 * 空值返回空串，不把空值渲染成 ¥ 0.00。
 */
export function formatCurrency(raw: unknown, symbol = '¥'): string {
  const n = parseCurrency(raw);
  if (n === null) return '';
  const formatted = n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol} ${formatted}`;
}

/**
 * 进度值解析：支持 0-100 数值，或带 % 结尾的字符串。
 * 强制钳制在 0 ~ 100 范围。
 */
export function parseProgress(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/%/g, '').replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * 进度展示对象：包含百分比数值（0-100）和文本（如 "85%"）。
 */
export function formatProgress(raw: unknown): { percent: number; text: string } {
  const p = parseProgress(raw);
  if (p === null) return { percent: 0, text: '' };
  return { percent: p, text: `${p}%` };
}

/**
 * 评分数值解析：钳制在 0 ~ maxRating（默认 5）之间的整数。
 */
export function parseRating(raw: unknown, max = 5): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(max, Math.max(0, Math.round(raw)));
  }
  const s = String(raw).trim();
  if (!s) return 0;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.max(0, Math.round(n)));
}

/**
 * 评分格式化对象。
 */
export function formatRating(raw: unknown, max = 5): { rating: number; max: number } {
  return { rating: parseRating(raw, max), max };
}
