import { describe, it, expect } from 'vitest';
import {
  formatDateTime,
  formatUserLabel,
  generateNextAutoNumber,
  applySystemFieldsOnCreate,
  applySystemFieldsOnUpdate
} from './systemFields';
import { isSystemFieldType } from './types';
import type { BitableColumnConfig } from './types';

describe('systemFields', () => {
  describe('isSystemFieldType', () => {
    it('正确识别系统字段类型', () => {
      expect(isSystemFieldType('createdTime')).toBe(true);
      expect(isSystemFieldType('updatedTime')).toBe(true);
      expect(isSystemFieldType('createdBy')).toBe(true);
      expect(isSystemFieldType('updatedBy')).toBe(true);
      expect(isSystemFieldType('autoNumber')).toBe(true);

      expect(isSystemFieldType('text')).toBe(false);
      expect(isSystemFieldType('number')).toBe(false);
      expect(isSystemFieldType('date')).toBe(false);
    });
  });

  describe('formatDateTime', () => {
    it('格式化指定日期对象', () => {
      const fixedDate = new Date(2026, 9, 30, 9, 30, 15); // 2026-10-30 09:30:15
      expect(formatDateTime(fixedDate)).toBe('2026-10-30 09:30:15');
    });

    it('兼容时间戳与空值容错', () => {
      const ts = new Date('2026-05-01T12:00:00Z').getTime();
      expect(formatDateTime(ts)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(formatDateTime('invalid-date')).toBe('');
    });
  });

  describe('formatUserLabel', () => {
    it('支持对象、字符串与空缺默认回退', () => {
      expect(formatUserLabel({ id: 'u1', name: '张三' })).toBe('张三');
      expect(formatUserLabel({ id: 'u2', name: '' })).toBe('u2');
      expect(formatUserLabel('李四')).toBe('李四');
      expect(formatUserLabel('')).toBe('系统');
      expect(formatUserLabel(null)).toBe('系统');
      expect(formatUserLabel(undefined)).toBe('系统');
    });
  });

  describe('generateNextAutoNumber', () => {
    it('默认配置按 REC-0001 递增', () => {
      expect(generateNextAutoNumber([], 'code')).toBe('REC-0001');

      const rows = [
        { id: '1', code: 'REC-0001' },
        { id: '2', code: 'REC-0002' },
        { id: '3', code: 'REC-0003' }
      ];
      expect(generateNextAutoNumber(rows, 'code')).toBe('REC-0004');
    });

    it('支持自定义 prefix、digits 与 startNumber', () => {
      const config = { prefix: 'TASK-', digits: 3, startNumber: 10 };
      expect(generateNextAutoNumber([], 'no', config)).toBe('TASK-010');

      const rows = [
        { id: '1', no: 'TASK-010' },
        { id: '2', no: 'TASK-025' }
      ];
      expect(generateNextAutoNumber(rows, 'no', config)).toBe('TASK-026');
    });

    it('容忍脏数据与非匹配前缀', () => {
      const rows = [
        { id: '1', code: 'OTHER-999' },
        { id: '2', code: null },
        { id: '3', code: 'REC-0005' },
        { id: '4', code: 'REC-not-num' }
      ];
      expect(generateNextAutoNumber(rows, 'code')).toBe('REC-0006');
    });
  });

  describe('applySystemFieldsOnCreate', () => {
    const columns: BitableColumnConfig[] = [
      { id: 'id', label: 'ID', type: 'text', visible: true },
      { id: 'title', label: '标题', type: 'text', visible: true },
      { id: 'seq', label: '编号', type: 'autoNumber', autoNumberConfig: { prefix: 'ORD-', digits: 4 }, visible: true },
      { id: 'created_at', label: '创建时间', type: 'createdTime', visible: true },
      { id: 'updated_at', label: '更新时间', type: 'updatedTime', visible: true },
      { id: 'creator', label: '创建人', type: 'createdBy', visible: true },
      { id: 'updater', label: '更新人', type: 'updatedBy', visible: true }
    ];

    it('自动补全全部审计字段与自增编号', () => {
      const fixedDate = new Date(2026, 9, 30, 10, 0, 0);
      const row: Record<string, any> = { id: 'r1', title: '新建记录' };
      const allRows = [{ id: 'r0', seq: 'ORD-0001' }];

      const result = applySystemFieldsOnCreate(
        row,
        columns,
        allRows,
        { id: 'u1', name: '王工' },
        fixedDate
      );

      expect(result.title).toBe('新建记录');
      expect(result.seq).toBe('ORD-0002');
      expect(result.created_at).toBe('2026-10-30 10:00:00');
      expect(result.updated_at).toBe('2026-10-30 10:00:00');
      expect(result.creator).toBe('王工');
      expect(result.updater).toBe('王工');
    });

    it('若已有指定创建时间/编号，不强制覆盖已有值', () => {
      const fixedDate = new Date(2026, 9, 30, 10, 0, 0);
      const row: Record<string, any> = {
        id: 'r2',
        seq: 'CUSTOM-999',
        created_at: '2025-01-01 00:00:00',
        creator: '李四'
      };

      const result = applySystemFieldsOnCreate(row, columns, [], '张三', fixedDate);

      expect(result.seq).toBe('CUSTOM-999');
      expect(result.created_at).toBe('2025-01-01 00:00:00');
      expect(result.creator).toBe('李四');
      // 但 updatedTime 与 updatedBy 仍会被刷新
      expect(result.updated_at).toBe('2026-10-30 10:00:00');
      expect(result.updater).toBe('张三');
    });
  });

  describe('applySystemFieldsOnUpdate', () => {
    const columns: BitableColumnConfig[] = [
      { id: 'title', label: '标题', type: 'text', visible: true },
      { id: 'updated_at', label: '更新时间', type: 'updatedTime', visible: true },
      { id: 'updater', label: '更新人', type: 'updatedBy', visible: true }
    ];

    it('只刷新更新时间与更新人字段', () => {
      const fixedDate = new Date(2026, 9, 30, 14, 20, 30);
      const patch: Record<string, any> = { title: '修改后标题' };

      const result = applySystemFieldsOnUpdate(patch, columns, '赵六', fixedDate);

      expect(result.title).toBe('修改后标题');
      expect(result.updated_at).toBe('2026-10-30 14:20:30');
      expect(result.updater).toBe('赵六');
    });
  });
});
