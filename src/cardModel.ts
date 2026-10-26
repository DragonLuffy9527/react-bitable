import { BitableColumnConfig, BitableFieldType } from './types';

/**
 * 卡片类视图（看板 / 画册 / 甘特）的字段解析器。
 *
 * 早期卡片视图按 `code` / `title` / `leadPerson` 硬编码取字段，
 * 换一张数据结构不同的表就全部取不到值，退化成「未命名」「张三」这类占位。
 *
 * 现在统一改为「按当前视图的列配置取字段」，与飞书多维表一致：
 * 卡片显示哪些字段由「字段配置」决定，主字段（第一个可见列）作为卡片标题。
 */

export interface CardField {
  id: string;
  label: string;
  type: BitableFieldType;
  /** 已格式化的显示文本 */
  text: string;
  raw: unknown;
}

const PERSON_HINTS = ['person', 'author', 'owner', 'user', 'signer', 'creator', 'lead'];
const DATE_HINTS = ['date', 'time', 'publish', 'update', 'created'];

const isPersonField = (col: BitableColumnConfig<any>) => {
  const k = `${col.id} ${col.label}`.toLowerCase();
  return PERSON_HINTS.some((h) => k.includes(h));
};

const isDateField = (col: BitableColumnConfig<any>) => col.type === 'date';

/** 单个字段值的显示文本；空值返回空串（由调用方过滤） */
export function getFieldText<T>(col: BitableColumnConfig<T>, item: T): string {
  const raw = (item as Record<string, unknown>)[col.id];
  if (raw == null || raw === '') return '';

  if (col.type === 'boolean') return raw ? '是' : '否';

  if (col.type === 'select' || col.type === 'badge') {
    const key = String(raw);
    const opt = col.options?.find((o) => o.value === key || o.label === key);
    return opt ? opt.label : key;
  }

  if (Array.isArray(raw)) return raw.map((v) => String(v)).join('、');
  if (typeof raw === 'object') return '';
  return String(raw);
}

/**
 * 按列配置顺序取出卡片要展示的字段（已剔除空值与操作列）。
 * @param max 最多返回多少个字段（超出部分卡片上显示 +N）
 */
export function resolveCardFields<T>(
  columns: BitableColumnConfig<T>[],
  item: T,
  max = 6,
  onlyVisible = true
): CardField[] {
  const out: CardField[] = [];
  for (const col of columns) {
    // 显式指定了「卡片显示字段」时，允许展示当前表格里隐藏的列（对齐飞书卡片配置）
    if (onlyVisible && !col.visible) continue;
    if (col.type === 'action') continue;
    const text = getFieldText(col, item);
    if (!text) continue;
    out.push({ id: col.id, label: col.label, type: col.type, text, raw: (item as Record<string, unknown>)[col.id] });
    if (out.length >= max) break;
  }
  return out;
}

export interface CardModel {
  /** 卡片主标题：主字段（第一个有值的可见列） */
  title: string;
  /** 副标题：第二个字段值，可能是编号/名称 */
  subtitle: string;
  /** 主标题对应的字段名，用作 hover 提示 */
  titleLabel: string;
  /** 其余标签字段 */
  tags: CardField[];
  /** 状态字段（badge / select 优先） */
  status?: CardField;
  /** 人员字段（有则显示，没有就不显示，绝不塞假名字） */
  person?: CardField;
  /** 日期字段 */
  date?: CardField;
  /** 所有已解析字段，卡片可自行渲染 */
  fields: CardField[];
}

export interface CardModelOptions {
  /** 指定卡片标题字段（默认取第一个有值的可见字段） */
  titleFieldId?: string | null;
  /** 指定卡片展示的字段（空=按列顺序自动取） */
  fieldIds?: string[];
}

export function buildCardModel<T>(
  columns: BitableColumnConfig<T>[],
  item: T,
  max = 6,
  opts?: CardModelOptions
): CardModel {
  // 有「卡片显示字段」配置时，严格按配置的字段与顺序取；否则按列顺序自动取
  let source = columns.filter((c) => c.visible && c.type !== 'action');
  if (opts?.fieldIds && opts.fieldIds.length > 0) {
    source = opts.fieldIds
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is BitableColumnConfig<T> => !!c && c.type !== 'action');
  }
  // 指定的标题字段提到最前，成为卡片主标题
  if (opts?.titleFieldId) {
    const idx = source.findIndex((c) => c.id === opts.titleFieldId);
    if (idx > 0) {
      source = [source[idx], ...source.slice(0, idx), ...source.slice(idx + 1)];
    } else if (idx < 0) {
      // 「卡片显示字段」通常只勾了业务字段、漏掉主字段，
      // 若指定的标题字段不在其中，这里从全量列里补进来，避免卡片没有标题
      const titleCol = columns.find((c) => c.id === opts.titleFieldId && c.type !== 'action');
      if (titleCol) source = [titleCol, ...source];
    }
  }

  const explicit = !!(opts?.fieldIds && opts.fieldIds.length > 0);
  const fields = resolveCardFields(source, item, max, !explicit);

  const statusCol = pickStatusColumn(source);
  const status = statusCol ? fields.find((f) => f.id === statusCol.id) : undefined;

  const personCol = source.find((c) => c.type !== 'action' && isPersonField(c));
  const person = personCol ? fields.find((f) => f.id === personCol.id) : undefined;

  const dateCol = source.find((c) => isDateField(c));
  const date = dateCol ? fields.find((f) => f.id === dateCol.id) : undefined;

  // 主标题 = 第一个有值字段；副标题跳过与主标题/状态值完全相同的字段，且只要文本/枚举类，
  // 避免把日期、数字当成副标题（它们另有位置）
  const first = fields[0];
  const dupTexts = new Set(
    [first?.text, status?.text, person?.text, date?.text].filter(Boolean) as string[]
  );
  const second = fields
    .slice(1)
    .find(
      (f) =>
        !dupTexts.has(f.text) &&
        (f.type === 'text' || f.type === 'select' || f.type === 'badge')
    );
  if (second) dupTexts.add(second.text);

  const reserved = new Set(
    [first?.id, second?.id, status?.id, person?.id, date?.id].filter(Boolean) as string[]
  );

  // 标签：去掉已占位字段、内容重复字段（含标签之间重复，例如一级/二级分类同为「建筑图」）；
  // 数值类排在前、日期类排在后
  const tags: CardField[] = [];
  fields
    .filter((f) => !reserved.has(f.id) && !dupTexts.has(f.text))
    .sort((a, b) => (a.type === 'date' ? 1 : 0) - (b.type === 'date' ? 1 : 0))
    .forEach((f) => {
      if (tags.some((t) => t.text === f.text)) return;
      tags.push(f);
    });

  return {
    title: first?.text || '',
    titleLabel: first?.label || '',
    subtitle: second?.text || '',
    tags,
    status,
    person,
    date,
    fields,
  };
}

/** 状态列：优先「状态/status」，其次 badge，最后任意 select —— 避免拿到「一级分类」当状态徽标 */
export function pickStatusColumn<T>(
  columns: BitableColumnConfig<T>[]
): BitableColumnConfig<T> | undefined {
  // 调用方传给它的已是「要展示的列」，这里不再重复判断 visible
  const candidates = columns.filter((c) => c.type === 'badge' || c.type === 'select');
  return (
    candidates.find((c) => /status|状态/i.test(`${c.id} ${c.label}`)) ||
    candidates.find((c) => c.type === 'badge') ||
    candidates[0]
  );
}
/** 标签的展示文本：非文本类型带字段名，避免只显示一个孤零零的数字/日期 */
export function formatTag(f: CardField): string {
  return f.type === 'text' || f.type === 'select' || f.type === 'badge'
    ? f.text
    : `${f.label} ${f.text}`;
}

/** 日期字段天然可用来排布日历/甘特；名称命中时优先 */
export function pickDateColumn<T>(
  columns: BitableColumnConfig<T>[]
): BitableColumnConfig<T> | undefined {
  const visible = columns.filter((c) => c.visible && c.type === 'date');
  return (
    visible.find((c) => DATE_HINTS.some((h) => `${c.id} ${c.label}`.toLowerCase().includes(h))) ||
    visible[0]
  );
}

export const personFieldLabel = (col: BitableColumnConfig<any>) =>
  isPersonField(col) ? col.label : '';
