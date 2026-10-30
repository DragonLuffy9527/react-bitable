import { describe, it, expect } from 'vitest';
import {
  parseClipboardMatrix,
  coercePastedValue,
  buildPastePlan
} from './clipboard';

describe('clipboard - 剪贴板 TSV 解析与粘贴计划', () => {
  describe('parseClipboardMatrix', () => {
    it('单个单元格普通文本保留整串，不按逗号切分', () => {
      expect(parseClipboardMatrix('Hello, world!')).toEqual([['Hello, world!']]);
    });

    it('多列制表符切分', () => {
      const tsv = 'A1\tB1\tC1\nA2\tB2\tC2';
      expect(parseClipboardMatrix(tsv)).toEqual([
        ['A1', 'B1', 'C1'],
        ['A2', 'B2', 'C2']
      ]);
    });

    it('多行只有换行时按行切分', () => {
      const lines = 'Line 1\nLine 2\nLine 3';
      expect(parseClipboardMatrix(lines)).toEqual([
        ['Line 1'],
        ['Line 2'],
        ['Line 3']
      ]);
    });

    it('去除末尾空行，保留中间空行', () => {
      const text = 'A\n\nB\n\n';
      const matrix = parseClipboardMatrix(text);
      expect(matrix).toEqual([['A'], [''], ['B']]);
    });

    it('空字符串返回空数组', () => {
      expect(parseClipboardMatrix('')).toEqual([]);
    });
  });

  describe('coercePastedValue - 按目标列类型强制转换', () => {
    it('数字类型转换', () => {
      expect(coercePastedValue('number', '123')).toBe(123);
      expect(coercePastedValue('number', '¥1,500')).toBe(1500);
      expect(coercePastedValue('number', '80%')).toBe(0.8);
      // 转不了保留文本不丢失数据
      expect(coercePastedValue('number', 'N/A')).toBe('N/A');
    });

    it('布尔类型转换', () => {
      expect(coercePastedValue('boolean', 'true')).toBe(true);
      expect(coercePastedValue('boolean', '是')).toBe(true);
      expect(coercePastedValue('boolean', 'Y')).toBe(true);
      expect(coercePastedValue('boolean', 'false')).toBe(false);
      expect(coercePastedValue('boolean', '否')).toBe(false);
      expect(coercePastedValue('boolean', 'N')).toBe(false);
    });

    it('日期类型转换', () => {
      expect(coercePastedValue('date', '2026/10/08')).toBe('2026-10-08');
      expect(coercePastedValue('date', '2026年10月8日')).toBe('2026-10-08');
      expect(coercePastedValue('date', 'not-date')).toBe('not-date');
    });

    it('多选类型转换（按逗号、顿号、分号分流）', () => {
      expect(coercePastedValue('multiSelect', 'UI, 前端; 架构')).toEqual(['UI', '前端', '架构']);
      expect(coercePastedValue('multiSelect', '设计、开发')).toEqual(['设计', '开发']);
    });

    it('文本类保持原样', () => {
      expect(coercePastedValue('text', 'hello')).toBe('hello');
      expect(coercePastedValue('select', '进行中')).toBe('进行中');
    });
  });

  describe('buildPastePlan - 矩阵铺开计划', () => {
    const rowIds = ['row-1', 'row-2', 'row-3', 'row-4'];
    const columns = [
      { id: 'c1', type: 'text' as const },
      { id: 'c2', type: 'number' as const },
      { id: 'c3', type: 'boolean' as const, isLocked: true }, // 锁定列
      { id: 'c4', type: 'date' as const }
    ];

    it('正常铺开 2x2 矩阵并跳过锁定列', () => {
      const matrix = [
        ['Name 1', '100', 'TRUE'],
        ['Name 2', '200', 'FALSE']
      ];

      const plan = buildPastePlan({
        matrix,
        startRow: 0,
        startCol: 0,
        rowIds,
        columns
      });

      expect(plan.rows).toBe(2);
      expect(plan.columns).toBe(3);
      expect(plan.skipped).toBe(2); // c3 是锁定列，跳过 2 次写入
      expect(plan.updates).toHaveLength(4); // 2 行 * (3 列 - 1 锁定列) = 4 个更新
      expect(plan.updates).toEqual([
        { rowId: 'row-1', fieldId: 'c1', value: 'Name 1' },
        { rowId: 'row-1', fieldId: 'c2', value: 100 },
        { rowId: 'row-2', fieldId: 'c1', value: 'Name 2' },
        { rowId: 'row-2', fieldId: 'c2', value: 200 }
      ]);
    });

    it('越界时自动裁剪', () => {
      const matrix = [
        ['1', '2'],
        ['3', '4'],
        ['5', '6']
      ];

      // 从第 3 行（索引 2）开始，只剩 row-3, row-4 两行
      const plan = buildPastePlan({
        matrix,
        startRow: 2,
        startCol: 0,
        rowIds,
        columns
      });

      expect(plan.sourceRows).toBe(3);
      expect(plan.rows).toBe(2); // 裁剪为 2 行
    });
  });
});
