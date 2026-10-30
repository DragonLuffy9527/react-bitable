import { describe, it, expect } from 'vitest';
import {
  incrementTrailingNumber,
  addDaysToDateText,
  incrementValue,
  buildFillPlan,
  isFillableFieldType
} from './fillSeries';

describe('fillSeries - 拖拽填充推算逻辑', () => {
  describe('isFillableFieldType', () => {
    it('允许可编辑类型的填充', () => {
      expect(isFillableFieldType('text')).toBe(true);
      expect(isFillableFieldType('number')).toBe(true);
      expect(isFillableFieldType('date')).toBe(true);
      expect(isFillableFieldType('select')).toBe(true);
      expect(isFillableFieldType('attachment')).toBe(false);
      expect(isFillableFieldType('action')).toBe(false);
    });
  });

  describe('incrementTrailingNumber - 文本末尾数字递增', () => {
    it('常规编号顺延递增', () => {
      expect(incrementTrailingNumber('Task-1', 1)).toBe('Task-2');
      expect(incrementTrailingNumber('A-101', 3)).toBe('A-104');
    });

    it('保留前导零长度', () => {
      expect(incrementTrailingNumber('DWG-01', 1)).toBe('DWG-02');
      expect(incrementTrailingNumber('09', 1)).toBe('10');
      expect(incrementTrailingNumber('099', 1)).toBe('100');
    });

    it('负向步长递减', () => {
      expect(incrementTrailingNumber('Item-10', -1)).toBe('Item-09');
      expect(incrementTrailingNumber('Item-10', -20)).toBe('Item-10'); // 负数溢出保护
    });

    it('无末尾数字原样返回', () => {
      expect(incrementTrailingNumber('已归档', 1)).toBe('已归档');
      expect(incrementTrailingNumber('', 1)).toBe('');
    });
  });

  describe('addDaysToDateText - 日期天数顺延', () => {
    it('按天数递增', () => {
      expect(addDaysToDateText('2026-10-01', 1)).toBe('2026-10-02');
      expect(addDaysToDateText('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDaysToDateText('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('按天数递减', () => {
      expect(addDaysToDateText('2026-10-01', -1)).toBe('2026-09-30');
    });

    it('非标准 YYYY-MM-DD 原样返回', () => {
      expect(addDaysToDateText('2026/10/01', 1)).toBe('2026/10/01');
      expect(addDaysToDateText('invalid', 1)).toBe('invalid');
    });
  });

  describe('incrementValue - 按字段类型推算', () => {
    it('数字类型递增并保持类型', () => {
      expect(incrementValue('number', 10, 1)).toBe(11);
      expect(incrementValue('number', '10', 1)).toBe('11');
      expect(incrementValue('number', '10.5', 2)).toBe('12.5');
    });

    it('日期类型递增', () => {
      expect(incrementValue('date', '2026-10-10', 5)).toBe('2026-10-15');
    });

    it('文本与标签类型文本尾号递增', () => {
      expect(incrementValue('text', 'Bug-001', 1)).toBe('Bug-002');
      expect(incrementValue('badge', 'Level 1', 1)).toBe('Level 2');
    });

    it('枚举/多选/布尔按复制处理', () => {
      expect(incrementValue('select', '进行中', 1)).toBe('进行中');
      expect(incrementValue('boolean', true, 1)).toBe(true);
      expect(incrementValue('multiSelect', ['A', 'B'], 1)).toEqual(['A', 'B']);
    });

    it('step = 0 时为纯复制', () => {
      expect(incrementValue('number', 10, 0)).toBe(10);
      expect(incrementValue('text', 'A-1', 0)).toBe('A-1');
    });
  });

  describe('buildFillPlan - 批量填充计划', () => {
    it('生成向下的数字递增计划', () => {
      const plan = buildFillPlan({
        fieldId: 'seq',
        type: 'number',
        sourceValue: 1,
        targetRowIds: ['row-2', 'row-3', 'row-4'],
        direction: 1
      });

      expect(plan).toEqual([
        { rowId: 'row-2', fieldId: 'seq', value: 2 },
        { rowId: 'row-3', fieldId: 'seq', value: 3 },
        { rowId: 'row-4', fieldId: 'seq', value: 4 }
      ]);
    });

    it('Shift 键复制模式（copyOnly=true）', () => {
      const plan = buildFillPlan({
        fieldId: 'seq',
        type: 'number',
        sourceValue: 100,
        targetRowIds: ['row-2', 'row-3'],
        copyOnly: true
      });

      expect(plan).toEqual([
        { rowId: 'row-2', fieldId: 'seq', value: 100 },
        { rowId: 'row-3', fieldId: 'seq', value: 100 }
      ]);
    });
  });
});
