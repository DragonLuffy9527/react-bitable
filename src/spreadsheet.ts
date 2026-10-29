/**
 * 表格文件解析：把用户上传的 Excel / CSV 变成「矩阵 + 字段定义」。
 *
 * 设计原则：
 * 1. **零依赖**。XLSX 本质是一个 ZIP（内含若干 XML），浏览器原生就有
 *    `DecompressionStream('deflate-raw')` 与 `DOMParser`，够用了。
 *    引入 SheetJS 会让本库从「零 runtime 依赖」变成「带一个 800KB 的包」，
 *    与项目定位冲突，所以这里自己读。
 * 2. **只产出字符串矩阵**。数字、日期、布尔在解析阶段就归一化成文本
 *    （日期 `YYYY-MM-DD`、布尔 `TRUE`/`FALSE`），字段类型推断统一走文本规则，
 *    这样 CSV 与 XLSX 两条链路共用同一套推断逻辑，行为一致。
 * 3. **失败要能说人话**。加密文件、老版 .xls、损坏 ZIP 都要给出可操作提示，
 *    而不是抛一个 `InvalidStateError` 让用户猜。
 */

import type { BitableColumnConfig, BitableFieldType, BitableSelectOption } from './types';
import { SELECT_OPTION_PALETTE } from './cellValue';

/** 单个工作表：行 × 列的纯文本矩阵，首行是否表头由调用方决定 */
export interface ParsedSheet {
  name: string;
  matrix: string[][];
  rowCount: number;
  colCount: number;
}

export interface ParsedWorkbook {
  fileName: string;
  kind: 'xlsx' | 'csv' | 'tsv';
  sheets: ParsedSheet[];
  warnings: string[];
}

/** 默认最多导入多少行——再多就该走服务端分批了，纯前端硬扛会卡死主线程 */
export const DEFAULT_MAX_IMPORT_ROWS = 50000;

/** 上传文件大小上限（20MB）。超过这个量级解压后的字符串会撑爆内存 */
export const DEFAULT_MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// ==================== 文本解码 ====================

/**
 * 把文件字节解成字符串。
 *
 * 中文环境最常见的坑是 Excel 另存的 CSV 是 GBK 而不是 UTF-8，
 * 直接用 TextDecoder('utf-8') 会得到一屏 `�`。这里先严格按 UTF-8 解，
 * 失败再回退 GBK（浏览器对 gbk 的支持已覆盖 Chrome/Edge/Safari）。
 */
export function decodeSpreadsheetBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  // BOM 优先，能省掉后面所有猜测
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 不是合法 UTF-8，按中文环境最常见的 GBK 再试一次
  }
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ==================== CSV / TSV ====================

/**
 * 猜分隔符。取前 20 个非空行，在引号外统计 `,` `;` `\t` 的出现次数，
 * 谁最多用谁。TSV 文件里逗号通常也很多（金额、地址），所以制表符要加权。
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const line of sample) {
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in counts) counts[ch] += 1;
    }
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/**
 * RFC4180 解析：支持引号包裹、字段内换行、`""` 转义、CRLF / LF / CR 三种换行。
 * 手写状态机而不是 `split(',')`，因为工程台账里「备注」列经常带逗号和换行。
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const d = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === d) {
      endField();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

// ==================== ZIP ====================

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * 读 ZIP 中央目录。只实现 XLSX 需要的子集：
 * 单卷、无 ZIP64、method 0（store）与 8（deflate）。
 * xlsx 由 Office/WPS 生成时都是这个形态，遇到 ZIP64 会明确报错而不是静默出错。
 */
function readZipDirectory(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const maxComment = Math.min(bytes.length, 0xffff + 22);
  let eocd = -1;

  // EOCD 签名 0x06054b50，从尾部往前找（注释最长 65535 字节）
  for (let i = bytes.length - 22; i >= bytes.length - maxComment && i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('这个文件不是有效的 xlsx（找不到 ZIP 结构，可能是改了扩展名的 .xls 或损坏文件）');

  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff) {
    throw new Error('暂不支持 ZIP64 格式的超大 xlsx，请拆分后再导入');
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // 复制一份独立的 Uint8Array：TS 5.9 的泛型 TypedArray 允许 backing store 是
  // SharedArrayBuffer，而 BlobPart 只接受 ArrayBuffer，直接传会类型不兼容。
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipFile(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const p = entry.localHeaderOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('xlsx 内部结构损坏（本地文件头无效）');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error(`xlsx 使用了不支持的压缩方式（method=${entry.method}）`);
}

// ==================== XLSX ====================

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('xlsx 内部 XML 解析失败，文件可能已损坏');
  }
  return doc;
}

function textOf(el: Element | undefined | null): string {
  if (!el) return '';
  // 富文本单元格会把内容拆成多个 <t>，全部拼起来才是完整文本
  const ts = el.getElementsByTagName('t');
  if (ts.length === 0) return el.textContent ?? '';
  let out = '';
  for (let i = 0; i < ts.length; i += 1) out += ts[i].textContent ?? '';
  return out;
}

/** `AB12` → 27（0 基列号）。遇到非字母立即停止，行号部分不参与计算。 */
function columnIndexFromRef(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    let v = -1;
    if (code >= 65 && code <= 90) v = code - 64;
    else if (code >= 97 && code <= 122) v = code - 96;
    if (v < 0) break;
    n = n * 26 + v;
  }
  return n - 1;
}

const BUILTIN_DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatCode(id: number, code?: string): boolean {
  if (BUILTIN_DATE_FORMAT_IDS.has(id)) return true;
  if (!code) return false;
  // 去掉 [颜色]/[条件] 与引号里的字面量，剩下的才可能是格式占位符
  const clean = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').toLowerCase();
  if (!/[ymdhs]/.test(clean)) return false;
  // 纯数字格式（#,##0.00）里不会出现 ymd，出现即认为是日期/时间
  return !/^[#0.,%\s]+$/.test(clean);
}

/**
 * Excel 序列号 → `YYYY-MM-DD`（带时间则补 `HH:mm`）。
 *
 * 用 UTC 计算而不是本地时区：Excel 的序列号本身不含时区，
 * 若用本地时间，东八区会整体偏移 8 小时，导致「2026-10-08」变成「10-07」。
 * 基准取 1899-12-30（已含 1900 闰年 bug 的补偿）。
 */
function excelSerialToText(serial: number, withTime: boolean): string {
  const whole = Math.floor(serial);
  const days = whole - 25569;
  const d = new Date(days * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (!withTime) return `${y}-${m}-${day}`;
  const seconds = Math.round((serial - whole) * 86400);
  const hh = String(Math.floor(seconds / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

interface XlsxStyles {
  /** cellXfs 下标 → 是否日期格式 */
  dateFlags: boolean[];
}

function parseStyles(xml: string | null): XlsxStyles {
  if (!xml) return { dateFlags: [] };
  const doc = parseXml(xml);

  const customFormats = new Map<number, string>();
  const numFmts = doc.getElementsByTagName('numFmt');
  for (let i = 0; i < numFmts.length; i += 1) {
    const id = Number(numFmts[i].getAttribute('numFmtId') ?? '-1');
    const code = numFmts[i].getAttribute('formatCode') ?? '';
    if (id >= 0) customFormats.set(id, code);
  }

  const xfs = doc.getElementsByTagName('cellXfs')[0]?.getElementsByTagName('xf');
  const dateFlags: boolean[] = [];
  if (xfs) {
    for (let i = 0; i < xfs.length; i += 1) {
      const numFmtId = Number(xfs[i].getAttribute('numFmtId') ?? '0');
      dateFlags.push(isDateFormatCode(numFmtId, customFormats.get(numFmtId)));
    }
  }
  return { dateFlags };
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const doc = parseXml(xml);
  const sis = doc.getElementsByTagName('si');
  const out: string[] = [];
  for (let i = 0; i < sis.length; i += 1) {
    // 跳过注音（rPh），它不属于单元格正文
    const clone = sis[i].cloneNode(true) as Element;
    const rPh = clone.getElementsByTagName('rPh');
    for (let j = rPh.length - 1; j >= 0; j -= 1) rPh[j].parentNode?.removeChild(rPh[j]);
    out.push(textOf(clone));
  }
  return out;
}

/** 把 `<dimension ref="A1:J6"/>` 之类的外部引用去掉，得到纯表名顺序 */
function parseSheetList(
  workbookXml: string,
  relsXml: string | null
): { name: string; path: string }[] {
  const doc = parseXml(workbookXml);
  const relMap = new Map<string, string>();
  if (relsXml) {
    const rels = parseXml(relsXml).getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i += 1) {
      const id = rels[i].getAttribute('Id') ?? '';
      const target = rels[i].getAttribute('Target') ?? '';
      if (id && target) {
        relMap.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
      }
    }
  }

  const sheets = doc.getElementsByTagName('sheet');
  const out: { name: string; path: string }[] = [];
  for (let i = 0; i < sheets.length; i += 1) {
    const el = sheets[i];
    if ((el.getAttribute('state') ?? 'visible') !== 'visible') continue;
    const name = el.getAttribute('name') ?? `Sheet${i + 1}`;
    // r:id 是带命名空间前缀的属性，getAttribute('r:id') 在多数浏览器可用，
    // 取不到时回退到按顺序猜路径
    const rid =
      el.getAttribute('r:id') ??
      el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
      '';
    const path = relMap.get(rid) ?? `xl/worksheets/sheet${i + 1}.xml`;
    out.push({ name, path });
  }
  return out;
}

function parseWorksheet(xml: string, sharedStrings: string[], styles: XlsxStyles): string[][] {
  const doc = parseXml(xml);
  const rows = doc.getElementsByTagName('row');
  const matrix: string[][] = [];

  for (let r = 0; r < rows.length; r += 1) {
    const rowEl = rows[r];
    const rowIndexAttr = Number(rowEl.getAttribute('r') ?? '0');
    // 空行也要占位，否则下方的数据会整体上移，行号对不上
    const targetRow = rowIndexAttr > 0 ? rowIndexAttr - 1 : matrix.length;
    const cells = rowEl.getElementsByTagName('c');
    const line: string[] = [];

    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      const ref = cell.getAttribute('r') ?? '';
      const colIndex = ref ? columnIndexFromRef(ref) : line.length;
      const type = cell.getAttribute('t') ?? 'n';
      const styleIndex = Number(cell.getAttribute('s') ?? '-1');
      const vEl = cell.getElementsByTagName('v')[0];
      const raw = vEl?.textContent ?? '';

      let value = '';
      if (type === 's') {
        const idx = Number(raw);
        value = Number.isFinite(idx) ? sharedStrings[idx] ?? '' : '';
      } else if (type === 'inlineStr') {
        value = textOf(cell.getElementsByTagName('is')[0]);
      } else if (type === 'b') {
        value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : '';
      } else if (type === 'e') {
        // #REF! / #N/A 之类的错误值，导入时按空处理，不把错误码写进数据
        value = '';
      } else if (type === 'str') {
        value = raw;
      } else if (raw !== '') {
        const num = Number(raw);
        const isDate = styleIndex >= 0 && styles.dateFlags[styleIndex] === true;
        if (isDate && Number.isFinite(num)) {
          const hasTime = num % 1 !== 0;
          value = excelSerialToText(num, hasTime);
        } else {
          value = raw;
        }
      }

      if (colIndex >= 0) {
        while (line.length < colIndex) line.push('');
        line[colIndex] = value;
      }
    }

    while (matrix.length < targetRow) matrix.push([]);
    matrix[targetRow] = line;
  }
  return matrix;
}

/**
 * 读 xlsx。返回所有可见工作表，顺序与 Excel 标签页一致。
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<{ sheets: ParsedSheet[]; warnings: string[] }> {
  const warnings: string[] = [];
  const entries = readZipDirectory(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const readText = async (name: string): Promise<string | null> => {
    const entry = byName.get(name);
    if (!entry) return null;
    const data = await readZipFile(buffer, entry);
    return new TextDecoder('utf-8').decode(data);
  };

  const workbookXml = await readText('xl/workbook.xml');
  if (!workbookXml) {
    throw new Error('这个文件里找不到 xl/workbook.xml，可能不是标准 xlsx（.xls 请先另存为 .xlsx）');
  }

  const relsXml = await readText('xl/_rels/workbook.xml.rels');
  const sharedStrings = parseSharedStrings(await readText('xl/sharedStrings.xml'));
  const styles = parseStyles(await readText('xl/styles.xml'));

  const sheetList = parseSheetList(workbookXml, relsXml);
  const sheets: ParsedSheet[] = [];

  for (const info of sheetList) {
    const xml = await readText(info.path);
    if (!xml) {
      warnings.push(`工作表「${info.name}」读取失败，已跳过`);
      continue;
    }
    const normalized = normalizeMatrix(parseWorksheet(xml, sharedStrings, styles));
    sheets.push({
      name: info.name,
      matrix: normalized,
      rowCount: normalized.length,
      colCount: normalized[0]?.length ?? 0
    });
  }

  if (sheets.length === 0) throw new Error('这个 xlsx 里没有可读取的工作表');
  return { sheets, warnings };
}

// ==================== 矩阵整理 ====================

/**
 * 去掉尾部整行为空的行、尾部整列为空的列，并把所有行补齐到同样宽度。
 *
 * 不这么做的话：Excel 里手滑点到第 100 万行会让 `matrix` 多出几十万个空数组，
 * 推断字段类型时又全是空值，直接判成文本，用户会看到一堆「列1、列2」空列。
 */
export function normalizeMatrix(input: string[][]): string[][] {
  const rows = input.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length === 0) return [];
  let width = 0;
  for (const r of rows) {
    for (let i = r.length - 1; i >= 0; i -= 1) {
      if (String(r[i] ?? '').trim() !== '') {
        width = Math.max(width, i + 1);
        break;
      }
    }
  }
  return rows.map((r) => {
    const out = r.slice(0, width).map((c) => (c == null ? '' : String(c)));
    while (out.length < width) out.push('');
    return out;
  });
}

// ==================== 统一入口 ====================

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * 解析上传的表格文件。按内容嗅探而不是只看扩展名——
 * 用户把 .csv 改名成 .xlsx 的情况太常见了。
 */
export async function parseSpreadsheetFile(
  file: File,
  options: { maxBytes?: number; maxRows?: number } = {}
): Promise<ParsedWorkbook> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMPORT_BYTES;
  const maxRows = options.maxRows ?? DEFAULT_MAX_IMPORT_ROWS;

  if (file.size > maxBytes) {
    throw new Error(`文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 上限`);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = XLSX_MAGIC.every((b, i) => bytes[i] === b);
  const lower = file.name.toLowerCase();
  const warnings: string[] = [];

  // .xls 是老版二进制格式（OLE 复合文档，头 8 字节 D0 CF 11 E0），本项目不解析
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('这是老版 .xls 格式，请在 Excel/WPS 里另存为 .xlsx 后再导入');
  }

  if (isZip) {
    const { sheets, warnings: w } = await parseXlsx(buffer);
    warnings.push(...w);
    const capped = sheets.map((s) => capRows(s, maxRows, warnings));
    return { fileName: file.name, kind: 'xlsx', sheets: capped, warnings };
  }

  if (lower.endsWith('.xlsx')) {
    throw new Error('文件扩展名是 .xlsx，但内容不是标准 xlsx（可能已损坏或被加密）');
  }

  const text = decodeSpreadsheetBuffer(buffer);
  const delimiter = lower.endsWith('.tsv') ? '\t' : detectDelimiter(text);
  const matrix = normalizeMatrix(parseDelimited(text, delimiter));
  if (matrix.length === 0) throw new Error('文件是空的，没有可导入的内容');

  const sheet: ParsedSheet = {
    name: lower.replace(/\.[^.]+$/, '') || 'Sheet1',
    matrix,
    rowCount: matrix.length,
    colCount: matrix[0]?.length ?? 0
  };
  return {
    fileName: file.name,
    kind: delimiter === '\t' ? 'tsv' : 'csv',
    sheets: [capRows(sheet, maxRows, warnings)],
    warnings
  };
}

function capRows(sheet: ParsedSheet, maxRows: number, warnings: string[]): ParsedSheet {
  if (sheet.matrix.length <= maxRows) return sheet;
  warnings.push(`工作表「${sheet.name}」超过 ${maxRows} 行，只导入前 ${maxRows} 行`);
  const matrix = sheet.matrix.slice(0, maxRows);
  return { ...sheet, matrix, rowCount: matrix.length };
}

// ==================== 字段类型推断 ====================

const BOOLEAN_TRUE = new Set(['TRUE', 'true', 'True', '是', '✓', '✔', 'Y', 'y', 'YES', 'yes']);
const BOOLEAN_FALSE = new Set(['FALSE', 'false', 'False', '否', '✗', '✘', 'N', 'n', 'NO', 'no']);

const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;
const CURRENCY_PREFIX = /^[¥$€£]\s*/;

/** `2026-10-08` / `2026/10/8` / `2026年10月8日` / `2026-10-08 09:30` / `10/8/2026` */
const DATE_PATTERNS: RegExp[] = [
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?$/,
  /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
  /^(\d{4})(\d{2})(\d{2})$/
];

/**
 * 把各种日期写法归一成 `YYYY-MM-DD`（或带时间）。识别不了返回 null。
 *
 * 刻意不接受 `1` 这种纯数字：Excel 里日期是以序列号存的，到了这里已经是文本，
 * 若把纯数字也当日期，编号列会被误判。
 */
export function normalizeDateText(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  for (let i = 0; i < DATE_PATTERNS.length; i += 1) {
    const m = s.match(DATE_PATTERNS[i]);
    if (!m) continue;
    let y: number;
    let mo: number;
    let d: number;
    let hh: string | undefined;
    let mm: string | undefined;
    if (i === 2) {
      // M/D/YYYY（美式）。只在月日都 ≤ 12 时才可能歧义，这里按美式处理并放行
      mo = Number(m[1]);
      d = Number(m[2]);
      y = Number(m[3]);
    } else {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
      hh = m[4];
      mm = m[5];
    }
    if (!(y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
    const base = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (hh !== undefined && mm !== undefined) {
      return `${base} ${String(Number(hh)).padStart(2, '0')}:${mm}`;
    }
    return base;
  }
  return null;
}

/** 把 `¥1,280.00` `65%` `1 200` 这类写法解成数字，解不出返回 null */
export function parseNumberText(raw: string): number | null {
  const s = raw.trim().replace(CURRENCY_PREFIX, '').replace(/\s/g, '');
  if (!s) return null;
  const isPercent = s.endsWith('%');
  const body = isPercent ? s.slice(0, -1) : s;
  if (!NUMBER_RE.test(body)) return null;
  const n = Number(body.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return isPercent ? n / 100 : n;
}

export function parseBooleanText(raw: string): boolean | null {
  const s = raw.trim();
  if (!s) return null;
  if (BOOLEAN_TRUE.has(s)) return true;
  if (BOOLEAN_FALSE.has(s)) return false;
  return null;
}

function isUrlText(raw: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(raw.trim());
}

export interface InferredField {
  type: BitableFieldType;
  options?: BitableSelectOption[];
  /** 命中率，用于在预览里解释「为什么判成这个类型」 */
  confidence: number;
}

/**
 * 按列采样推断字段类型。
 *
 * 优先级是刻意排的：布尔 → 数字 → 日期 → 链接 → 单选 → 文本。
 * 布尔必须排在数字前面，否则 `1/0` 会被数字抢走；
 * 日期排在数字后面，因为 `20261008` 既像数字也像日期，工程台账里当编号更常见。
 */
export function inferColumnType(values: string[], sampleLimit = 500): InferredField {
  const sample = values
    .map((v) => String(v ?? '').trim())
    .filter((v) => v !== '')
    .slice(0, sampleLimit);

  if (sample.length === 0) return { type: 'text', confidence: 0 };

  const ratio = (pred: (v: string) => boolean) => {
    let hit = 0;
    for (const v of sample) if (pred(v)) hit += 1;
    return hit / sample.length;
  };

  const boolRatio = ratio((v) => BOOLEAN_TRUE.has(v) || BOOLEAN_FALSE.has(v));
  if (boolRatio >= 0.95) return { type: 'boolean', confidence: boolRatio };

  const numRatio = ratio((v) => parseNumberText(v) !== null);
  if (numRatio >= 0.95) return { type: 'number', confidence: numRatio };

  const dateRatio = ratio((v) => normalizeDateText(v) !== null);
  if (dateRatio >= 0.95) return { type: 'date', confidence: dateRatio };

  const urlRatio = ratio(isUrlText);
  if (urlRatio >= 0.95) return { type: 'url', confidence: urlRatio };

  // 单选判定要同时满足四条，否则「备注」「任务标题」这类自由文本会被误判：
  //   - 取值有限（≤20 种）
  //   - 至少出现过一次重复（全不相同的列是编号/姓名，不该做成单选）
  //   - 重复率够高（小样本放宽到 0.8，否则 5 行 4 种状态会判不出来）
  //   - 单个值不太长（长句子做选项没法看）
  const distinct = new Set(sample);
  const maxLen = Math.max(...Array.from(distinct).map((v) => v.length));
  const looksLikeSelect =
    distinct.size >= 2 &&
    distinct.size <= 20 &&
    distinct.size < sample.length &&
    distinct.size <= Math.max(3, Math.ceil(sample.length * 0.8)) &&
    maxLen <= 20;
  if (looksLikeSelect) {
    const options: BitableSelectOption[] = Array.from(distinct).map((v, i) => ({
      label: v,
      value: v,
      color: SELECT_OPTION_PALETTE[i % SELECT_OPTION_PALETTE.length]
    }));
    return { type: 'select', options, confidence: 1 - distinct.size / sample.length };
  }

  return { type: 'text', confidence: 1 };
}

// ==================== 生成导入结果 ====================

export interface ImportBuildOptions {
  /** 首行是否作为字段名。默认 true */
  hasHeader?: boolean;
  /** 按列下标强制指定类型，覆盖推断结果 */
  typeOverrides?: Record<number, BitableFieldType>;
  /** 行 id 前缀，便于在数据里区分导入来源 */
  idPrefix?: string;
}

export interface ImportResult<T = Record<string, unknown>> {
  columns: BitableColumnConfig<T>[];
  rows: T[];
  /** 每列的推断说明，预览面板用来展示「为什么是这个类型」 */
  columnMeta: { label: string; type: BitableFieldType; distinct: number; empty: number }[];
}

/** 表头清洗：空名补 `列N`，重名加后缀，保证 id 唯一且 label 可读 */
function resolveHeader(matrix: string[][], hasHeader: boolean): { header: string[]; body: string[][] } {
  const width = matrix[0]?.length ?? 0;
  if (!hasHeader) {
    return {
      header: Array.from({ length: width }, (_, i) => `列${i + 1}`),
      body: matrix
    };
  }
  const rawHeader = matrix[0] ?? [];
  const used = new Set<string>();
  const header = Array.from({ length: width }, (_, i) => {
    let name = String(rawHeader[i] ?? '').trim() || `列${i + 1}`;
    if (used.has(name)) {
      let n = 2;
      while (used.has(`${name}_${n}`)) n += 1;
      name = `${name}_${n}`;
    }
    used.add(name);
    return name;
  });
  return { header, body: matrix.slice(1) };
}

/**
 * 由表头派生稳定的字段 id。
 *
 * 纯中文表头（绝大多数中文台账）没法做 slug，统一退化成 `f1..fn`。
 * 用「位置」而不是「表头文字」当 id，是为了让同一份表重复导入时
 * 字段能对上，追加导入才不会把同样的列重复建两遍。
 */
function fieldIdOf(label: string, index: number, used: Set<string>): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  let id = slug && /[a-z]/.test(slug) ? slug : `f${index + 1}`;
  if (used.has(id)) {
    let n = 2;
    while (used.has(`${id}_${n}`)) n += 1;
    id = `${id}_${n}`;
  }
  used.add(id);
  return id;
}

/** 根据内容长度猜列宽，夹在 90~320px 之间，避免「任务标题」被压成一行省略号 */
function guessWidth(values: string[], label: string): string {
  let maxLen = label.length * 2;
  for (let i = 0; i < Math.min(values.length, 200); i += 1) {
    const v = String(values[i] ?? '');
    // 中文按 2 个字符宽度估算
    let w = 0;
    for (const ch of v) w += ch.charCodeAt(0) > 255 ? 2 : 1;
    maxLen = Math.max(maxLen, Math.min(w, 40));
  }
  return `${Math.min(320, Math.max(90, maxLen * 7 + 24))}px`;
}

function coerceValue(type: BitableFieldType, raw: string): unknown {
  const s = String(raw ?? '').trim();
  switch (type) {
    case 'number': {
      if (!s) return null;
      const n = parseNumberText(s);
      return n === null ? null : n;
    }
    case 'boolean': {
      if (!s) return null;
      return parseBooleanText(s);
    }
    case 'date': {
      if (!s) return '';
      return normalizeDateText(s) ?? s;
    }
    case 'select':
    case 'multiSelect':
    case 'url':
    case 'user':
    case 'group':
    case 'text':
    default:
      return s;
  }
}

/** 由去重值生成单选项，并依次取色。上限 60 个，再多就不是「选项」而是自由文本了 */
function buildSelectOptions(values: string[]): BitableSelectOption[] {
  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    distinct.push(v);
    if (distinct.length >= 60) break;
  }
  return distinct.map((v, i) => ({
    label: v,
    value: v,
    color: SELECT_OPTION_PALETTE[i % SELECT_OPTION_PALETTE.length]
  }));
}

/**
 * 矩阵 → `columns` + `rows`。这是「上传 Excel 变多维表」的核心一步。
 */
export function buildImportResult<T = Record<string, unknown>>(
  sheet: ParsedSheet,
  options: ImportBuildOptions = {}
): ImportResult<T> {
  const hasHeader = options.hasHeader !== false;
  const { header, body } = resolveHeader(sheet.matrix, hasHeader);
  const idPrefix = options.idPrefix ?? 'imp';
  const stamp = Date.now().toString(36);

  const usedIds = new Set<string>();
  const columns: BitableColumnConfig<T>[] = [];
  const columnMeta: ImportResult['columnMeta'] = [];

  header.forEach((label, colIndex) => {
    const values = body.map((r) => String(r[colIndex] ?? ''));
    const inferred = inferColumnType(values);
    const type = options.typeOverrides?.[colIndex] ?? inferred.type;
    const id = fieldIdOf(label, colIndex, usedIds);

    const nonEmpty = values.filter((v) => v.trim() !== '');
    // 选项来源：推断出的优先；用户手动把文本列改成单选时，用去重值现造一份
    const selectOptions =
      type === 'select' || type === 'multiSelect'
        ? inferred.options ?? buildSelectOptions(values)
        : undefined;

    columns.push({
      id,
      label,
      type,
      width: guessWidth(values, label),
      visible: true,
      editable: true,
      filterable: true,
      sortable: true,
      groupable: type === 'select' || type === 'boolean' || type === 'date' || type === 'user',
      options: selectOptions,
      isCustom: true
    });

    columnMeta.push({
      label,
      type,
      distinct: new Set(nonEmpty).size,
      empty: values.length - nonEmpty.length
    });
  });

  const rows = body.map((r, rowIndex) => {
    const row: Record<string, unknown> = { id: `${idPrefix}_${stamp}_${rowIndex + 1}` };
    columns.forEach((col, colIndex) => {
      row[col.id] = coerceValue(col.type, r[colIndex] ?? '');
    });
    return row as T;
  });

  return { columns, rows, columnMeta };
}

