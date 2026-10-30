/**
 * 系统字段与自动编号纯函数模块 —— 无 React 依赖。
 *
 * 覆盖 5 种系统审计与自动序列字段：
 * - createdTime: 创建时间戳
 * - updatedTime: 最后修改时间戳
 * - createdBy: 创建人
 * - updatedBy: 最后修改人
 * - autoNumber: 自动递增编号（支持自定义前缀、补零位数与起始序号）
 */
import type { BitableColumnConfig, BitableFieldType, BitableUser } from './types';
import { isSystemFieldType } from './types';

/** 格式化日期时间为 YYYY-MM-DD HH:mm:ss */
export function formatDateTime(input?: Date | string | number | null): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (isNaN(d.getTime())) return '';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');

  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/** 规范化用户名为字符串（支持直接传字符串或用户对象） */
export function formatUserLabel(user?: BitableUser | string | null): string {
  if (!user) return '系统';
  if (typeof user === 'string') return user.trim() || '系统';
  return user.name || user.id || '系统';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 计算自动编号的下一序号
 *
 * @param existingRows 当前已有记录列表
 * @param fieldId 自动编号字段 ID
 * @param config 自定义配置（prefix 默认 'REC-'，digits 默认 4，startNumber 默认 1）
 */
export function generateNextAutoNumber(
  existingRows: any[],
  fieldId: string,
  config?: { prefix?: string; digits?: number; startNumber?: number }
): string {
  const prefix = config?.prefix ?? 'REC-';
  const digits = Math.max(1, config?.digits ?? 4);
  const startNumber = config?.startNumber ?? 1;

  let maxSeq = startNumber - 1;
  const regex = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);

  for (const row of existingRows) {
    if (!row) continue;
    const val = row[fieldId];
    if (typeof val === 'string') {
      const match = val.match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    } else if (typeof val === 'number') {
      if (val > maxSeq) {
        maxSeq = val;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(digits, '0')}`;
}

/**
 * 新建记录时自动注入系统字段值
 */
export function applySystemFieldsOnCreate<T extends Record<string, any>>(
  row: T,
  columns: BitableColumnConfig<any>[],
  allRows: any[] = [],
  currentUser?: BitableUser | string,
  now?: Date
): T {
  const result: any = { ...row };
  const formattedTime = formatDateTime(now);
  const userLabel = formatUserLabel(currentUser);

  for (const col of columns) {
    if (!col || !col.id) continue;
    const type = col.type;

    if (type === 'createdTime') {
      if (!result[col.id]) {
        result[col.id] = formattedTime;
      }
    } else if (type === 'updatedTime') {
      result[col.id] = formattedTime;
    } else if (type === 'createdBy') {
      if (!result[col.id]) {
        result[col.id] = userLabel;
      }
    } else if (type === 'updatedBy') {
      result[col.id] = userLabel;
    } else if (type === 'autoNumber') {
      if (!result[col.id]) {
        result[col.id] = generateNextAutoNumber(allRows, col.id, col.autoNumberConfig);
      }
    }
  }

  return result as T;
}

/**
 * 行内容更新时自动刷新审计字段（修改时间、修改人）
 */
export function applySystemFieldsOnUpdate<T extends Record<string, any>>(
  patch: Partial<T>,
  columns: BitableColumnConfig<any>[],
  currentUser?: BitableUser | string,
  now?: Date
): Partial<T> {
  const result: any = { ...patch };
  const formattedTime = formatDateTime(now);
  const userLabel = formatUserLabel(currentUser);

  let hasUpdatedTime = false;
  let hasUpdatedBy = false;

  for (const col of columns) {
    if (!col || !col.id) continue;
    if (col.type === 'updatedTime') {
      result[col.id] = formattedTime;
      hasUpdatedTime = true;
    } else if (col.type === 'updatedBy') {
      result[col.id] = userLabel;
      hasUpdatedBy = true;
    }
  }

  return result as Partial<T>;
}
