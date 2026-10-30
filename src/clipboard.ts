import { parseDelimited, parseBooleanText, parseNumberText, normalizeDateText } from './spreadsheet';
import type { BitableFieldType } from './types';

/**
 * 粘贴（纯函数，无 React 依赖）。
 *
 * 从 Excel / 飞书表格 / Google Sheets 复制的剪贴板内容是 TSV：
 * 单元格之间 \t，行之间 \n，含逗号引号换行的单元格用 "..." 包裹。
 * 所以这里不猜分隔符，只在「既没有 \t 也没有换行」时按单格处理——
 * 否则一段含逗号的普通文本会被切成两列。
 */

export interface PasteColumnLike {
  id: string;
  type: BitableFieldType;
  isLocked?: boolean;
  editable?: boolean;
}

export interface PasteUpdate {
  rowId: string;
  fieldId: string;
  value: unknown;
}

export interface PastePlan {
  updates: PasteUpdate[];
  /** 实际写入的行数 / 列数（已按可用范围裁剪） */
  rows: number;
  columns: number;
  /** 因字段锁定或只读而跳过的单元格数 */
  skipped: number;
  /** 剪贴板里的原始尺寸，用于提示「只写入了 3×2 / 剪贴板 10×4」 */
  sourceRows: number;
  sourceColumns: number;
}

/** 剪贴板文本 → 二维数组 */
export function parseClipboardMatrix(text: string): string[][] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 单格：整段就是值，不切分（保留用户复制来的逗号、分号）
  if (!src.includes('\t') && !src.includes('\n')) return [[src]];

  const delimiter = src.includes('\t') ? '\t' : ',';
  const matrix = parseDelimited(src, delimiter);
  // 末尾换行会多出一个空行，去掉；中间的空行保留（对应空记录）
  while (matrix.length > 0 && matrix[matrix.length - 1].every((c) => c === '')) {
    matrix.pop();
  }
  return matrix;
}

const MULTI_SPLIT = /[,，、;；|]/;

/**
 * 文本 → 字段值。按列类型转换，转不了就原样保留文本，
 * 不静默丢数据（用户至少能看到自己粘进来的内容）。
 */
export function coercePastedValue(type: BitableFieldType, raw: string): unknown {
  const text = raw ?? '';
  if (text === '') return '';

  switch (type) {
    case 'number':
    case 'currency': {
      const n = parseNumberText(text);
      return n === null ? text : n;
    }
    case 'progress': {
      const n = parseNumberText(text);
      return n === null ? text : Math.min(100, Math.max(0, n));
    }
    case 'rating': {
      const n = parseNumberText(text);
      return n === null ? text : Math.min(5, Math.max(0, Math.round(n)));
    }
    case 'email':
    case 'phone':
      return text.trim();
    case 'boolean': {
      const b = parseBooleanText(text);
      return b === null ? text : b;
    }
    case 'date': {
      const d = normalizeDateText(text);
      return d === null ? text : d;
    }
    case 'multiSelect':
      return text
        .split(MULTI_SPLIT)
        .map((v) => v.trim())
        .filter(Boolean);
    case 'select':
    case 'badge':
    case 'text':
    case 'action':
    default:
      return text;
  }
}

/**
 * 把剪贴板矩阵铺到表格上。
 *
 * 起点是选区的左上角（与 Excel 一致），越界部分丢弃而不是报错——
 * 粘贴到表尾时用户通常只想填满剩下的行。
 */
export function buildPastePlan(options: {
  matrix: string[][];
  /** 目标区域从第几行开始（可见行序号） */
  startRow: number;
  /** 目标区域从第几列开始（可见列序号） */
  startCol: number;
  /** 全部可见行 id，按渲染顺序 */
  rowIds: string[];
  /** 全部可见列 */
  columns: PasteColumnLike[];
}): PastePlan {
  const { matrix, startRow, startCol, rowIds, columns } = options;
  const sourceRows = matrix.length;
  const sourceColumns = matrix.reduce((max, row) => Math.max(max, row.length), 0);

  const plan: PastePlan = {
    updates: [],
    rows: 0,
    columns: 0,
    skipped: 0,
    sourceRows,
    sourceColumns
  };
  if (sourceRows === 0 || sourceColumns === 0) return plan;

  const maxRows = Math.max(0, rowIds.length - startRow);
  const maxCols = Math.max(0, columns.length - startCol);
  const rowsToWrite = Math.min(sourceRows, maxRows);
  const colsToWrite = Math.min(sourceColumns, maxCols);

  for (let r = 0; r < rowsToWrite; r += 1) {
    const rowId = rowIds[startRow + r];
    const sourceRow = matrix[r] ?? [];
    for (let c = 0; c < colsToWrite; c += 1) {
      const col = columns[startCol + c];
      // 锁定 / 只读列跳过：宁可少写，也不要出现「粘了但没保存」
      if (col.isLocked || col.editable === false) {
        plan.skipped += 1;
        continue;
      }
      plan.updates.push({
        rowId,
        fieldId: col.id,
        value: coercePastedValue(col.type, sourceRow[c] ?? '')
      });
    }
  }

  plan.rows = rowsToWrite;
  plan.columns = colsToWrite;
  return plan;
}
