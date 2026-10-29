import type { BitableFieldType } from './types';

/**
 * 导出（纯函数 + 一个下载入口，无第三方依赖）。
 *
 * CSV 走 RFC 4180 转义并带 UTF-8 BOM——不带 BOM 的 CSV 在中文版 Excel 里会整片乱码。
 * XLSX 是自己拼的最小 OOXML 包：ZIP 用「存储」模式（method 0）不压缩，
 * 因此不需要 deflate 实现，也不需要引入 SheetJS（约 800KB）。
 * 代价是文件比压缩版大 3~5 倍，对导出几百到几万行完全可接受。
 */

export interface ExportColumn {
  id: string;
  label: string;
  type: BitableFieldType;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 单元格 → 导出文本。数组用逗号连接，布尔输出「是/否」 */
export function cellToText(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) return raw.map((v) => String(v ?? '')).filter(Boolean).join(', ');
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  return String(raw);
}

/** 数字列才尝试转成数字，其余保持文本，避免「001」被吃掉前导零 */
function cellToNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const cleaned = String(raw).replace(/[,\s¥$€£]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function escapeCsvCell(text: string): string {
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  options: { bom?: boolean } = {}
): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCsvCell(c.label)).join(','));
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          // 数字列输出纯数字（去掉千分位/货币符号），否则 Excel 里会被当成文本无法求和
          if (c.type === 'number') {
            const n = cellToNumber(row[c.id]);
            if (n !== null) return String(n);
          }
          return escapeCsvCell(cellToText(row[c.id]));
        })
        .join(',')
    );
  }
  // Excel 靠 BOM 判定 UTF-8；用 \r\n 更贴合 Excel 习惯
  return (options.bom === false ? '' : '\uFEFF') + lines.join('\r\n');
}

// —— 最小 XLSX 生成 ——

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** 只写「存储」模式的 ZIP：结构简单、无需压缩实现，Excel 完全接受 */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // 本地文件头签名
    lv.setUint16(4, 20, true); // 解压所需版本
    lv.setUint16(6, 0x0800, true); // 通用标志：文件名为 UTF-8
    lv.setUint16(8, 0, true); // 压缩方法 0 = 存储
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // 中央目录签名
    cv.setUint16(4, 20, true); // 创建版本
    cv.setUint16(6, 20, true); // 解压所需版本
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // 本地头偏移
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // 目录结束签名
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(end, cursor);
  return out;
}

function buildSheetXml(rows: Record<string, unknown>[], columns: ExportColumn[]): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>');

  const headerCells = columns
    .map(
      (col, i) =>
        `<c r="${columnLetter(i)}1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(col.label)}</t></is></c>`
    )
    .join('');
  parts.push(`<row r="1">${headerCells}</row>`);

  rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells = columns
      .map((col, i) => {
        const ref = `${columnLetter(i)}${r}`;
        const raw = row[col.id];
        if (raw === undefined || raw === null || raw === '') return '';

        if (col.type === 'number') {
          const n = cellToNumber(raw);
          return n === null ? '' : `<c r="${ref}"><v>${n}</v></c>`;
        }
        if (col.type === 'boolean') {
          const truthy = raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === '是';
          return `<c r="${ref}" t="b"><v>${truthy ? 1 : 0}</v></c>`;
        }
        const text = cellToText(raw);
        if (!text) return '';
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
      })
      .join('');
    parts.push(`<row r="${r}">${cells}</row>`);
  });

  parts.push('</sheetData></worksheet>');
  return parts.join('');
}

export function buildXlsx(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName = '数据'
): Uint8Array {
  const encoder = new TextEncoder();
  const enc = (s: string) => encoder.encode(s);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(
    sheetName
  )}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: enc(contentTypes) },
    { name: '_rels/.rels', data: enc(rootRels) },
    { name: 'xl/workbook.xml', data: enc(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: enc(buildSheetXml(rows, columns)) }
  ]);
}

/** 触发浏览器下载；非浏览器环境（SSR / 测试）下静默跳过 */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立即 revoke 在部分浏览器会中断下载，交给下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportFormat = 'csv' | 'xlsx';

/** 统一导出入口：文件名不含扩展名，自动补上 */
export function exportRows(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  format: ExportFormat = 'xlsx',
  filename = '导出数据'
): void {
  if (columns.length === 0) return;
  if (format === 'csv') {
    const text = buildCsv(rows, columns);
    downloadBlob(`${filename}.csv`, new Blob([text], { type: 'text/csv;charset=utf-8' }));
    return;
  }
  const bytes = buildXlsx(rows, columns);
  // 复制一份独立 buffer：TS 5.9 的泛型 TypedArray 允许 SharedArrayBuffer 后备存储
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(`${filename}.xlsx`, new Blob([copy], { type: XLSX_MIME }));
}
