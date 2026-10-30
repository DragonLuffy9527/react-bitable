import { describe, it, expect } from 'vitest';
import {
  toComparable,
  compareValues,
  matchesRule,
  applyFilterRules,
  resolveComparableKind,
  operatorsFor,
  TEXT_OPERATORS,
  ORDERED_OPERATORS
} from './filtering';
import type { FilterColumnLike } from './filtering';
import type { BitableFilterRule } from './types';

describe('filtering - 筛选求值核心逻辑', () => {
  describe('resolveComparableKind & operatorsFor', () => {
    it('正确分流字段比较类型', () => {
      expect(resolveComparableKind('number')).toBe('number');
      expect(resolveComparableKind('date')).toBe('date');
      expect(resolveComparableKind('text')).toBe('text');
      expect(resolveComparableKind('select')).toBe('text');
      expect(resolveComparableKind('boolean')).toBe('text');
      expect(resolveComparableKind(undefined)).toBe('text');
    });

    it('根据类型提供对应操作符集合', () => {
      expect(operatorsFor('text')).toBe(TEXT_OPERATORS);
      expect(operatorsFor('number')).toBe(ORDERED_OPERATORS);
      expect(operatorsFor('date')).toBe(ORDERED_OPERATORS);
    });
  });

  describe('toComparable - 归一化可比较值', () => {
    it('处理文本字段', () => {
      expect(toComparable('text', 'Hello World')).toBe('hello world');
      expect(toComparable('text', null)).toBe('');
      expect(toComparable('text', undefined)).toBe('');
      expect(toComparable('text', 123)).toBe('123');
    });

    it('处理数字字段（支持货币、千分位、百分号剥离）', () => {
      expect(toComparable('number', 100)).toBe(100);
      expect(toComparable('number', '1,234.56')).toBe(1234.56);
      expect(toComparable('number', '¥2,500')).toBe(2500);
      expect(toComparable('number', '$199.99')).toBe(199.99);
      expect(toComparable('number', '85%')).toBe(85);
      expect(toComparable('number', null)).toBeNull();
      expect(toComparable('number', undefined)).toBeNull();
      expect(toComparable('number', '')).toBeNull();
      expect(toComparable('number', 'abc')).toBeNull();
    });

    it('处理日期字段', () => {
      const ts1 = toComparable('date', '2026-10-08');
      const ts2 = toComparable('date', '2026/10/08');
      expect(ts1).toBeTypeOf('number');
      expect(ts1).toBe(ts2);
      expect(toComparable('date', null)).toBeNull();
      expect(toComparable('date', '')).toBeNull();
      expect(toComparable('date', 'not-a-date')).toBeNull();
    });
  });

  describe('compareValues - 两值大小比较', () => {
    it('比较数字大小', () => {
      expect(compareValues('number', 10, '5')).toBe(1);
      expect(compareValues('number', '5', '10')).toBe(-1);
      expect(compareValues('number', '¥1,000', '1000')).toBe(0);
      expect(compareValues('number', null, '10')).toBeNull();
    });

    it('比较日期大小', () => {
      expect(compareValues('date', '2026-10-09', '2026-10-08')).toBe(1);
      expect(compareValues('date', '2026-10-07', '2026-10-08')).toBe(-1);
      expect(compareValues('date', '2026-10-08', '2026/10/08')).toBe(0);
    });

    it('比较文本字典序', () => {
      expect(compareValues('text', 'B', 'a')).toBe(1); // 'b' > 'a'
      expect(compareValues('text', 'Apple', 'banana')).toBe(-1);
      expect(compareValues('text', 'abc', 'ABC')).toBe(0);
    });
  });

  describe('matchesRule - 单条规则判定', () => {
    const row = {
      title: 'Alpha Project',
      amount: 1500,
      due: '2026-10-15',
      emptyField: '',
      nullField: null
    };

    it('文本操作符：contains, not_contains, equals, starts_with', () => {
      expect(matchesRule(row, { id: '1', fieldId: 'title', operator: 'contains', value: 'Alpha' }, 'text')).toBe(true);
      expect(matchesRule(row, { id: '2', fieldId: 'title', operator: 'not_contains', value: 'Beta' }, 'text')).toBe(true);
      expect(matchesRule(row, { id: '3', fieldId: 'title', operator: 'equals', value: 'alpha project' }, 'text')).toBe(true);
      expect(matchesRule(row, { id: '4', fieldId: 'title', operator: 'starts_with', value: 'alpha' }, 'text')).toBe(true);
    });

    it('空值判定：is_empty, is_not_empty', () => {
      expect(matchesRule(row, { id: '5', fieldId: 'emptyField', operator: 'is_empty', value: '' }, 'text')).toBe(true);
      expect(matchesRule(row, { id: '6', fieldId: 'nullField', operator: 'is_empty', value: '' }, 'text')).toBe(true);
      expect(matchesRule(row, { id: '7', fieldId: 'title', operator: 'is_not_empty', value: '' }, 'text')).toBe(true);
    });

    it('数字比较：gt, gte, lt, lte, between', () => {
      expect(matchesRule(row, { id: '8', fieldId: 'amount', operator: 'gt', value: '1000' }, 'number')).toBe(true);
      expect(matchesRule(row, { id: '9', fieldId: 'amount', operator: 'gte', value: '1500' }, 'number')).toBe(true);
      expect(matchesRule(row, { id: '10', fieldId: 'amount', operator: 'lt', value: '2000' }, 'number')).toBe(true);
      expect(matchesRule(row, { id: '11', fieldId: 'amount', operator: 'lte', value: '1500' }, 'number')).toBe(true);
      expect(matchesRule(row, { id: '12', fieldId: 'amount', operator: 'between', value: '1000', value2: '2000' }, 'number')).toBe(true);
      // 上下界反转依然工作
      expect(matchesRule(row, { id: '13', fieldId: 'amount', operator: 'between', value: '2000', value2: '1000' }, 'number')).toBe(true);
      expect(matchesRule(row, { id: '14', fieldId: 'amount', operator: 'between', value: '1600', value2: '2000' }, 'number')).toBe(false);
    });

    it('空值不参与大小比较', () => {
      expect(matchesRule(row, { id: '15', fieldId: 'nullField', operator: 'gt', value: '0' }, 'number')).toBe(false);
      expect(matchesRule(row, { id: '16', fieldId: 'nullField', operator: 'lt', value: '100' }, 'number')).toBe(false);
    });
  });

  describe('applyFilterRules - 数据集多条件应用', () => {
    const rows = [
      { id: '1', name: 'Task A', score: 85, date: '2026-10-01' },
      { id: '2', name: 'Task B', score: 95, date: '2026-10-05' },
      { id: '3', name: 'Issue C', score: 60, date: '2026-10-10' }
    ];

    const columns: FilterColumnLike[] = [
      { id: 'name', type: 'text' },
      { id: 'score', type: 'number' },
      { id: 'date', type: 'date' }
    ];

    it('规则为空时返回原数组引用', () => {
      expect(applyFilterRules(rows, [], 'AND', columns)).toBe(rows);
    });

    it('AND 逻辑过滤', () => {
      const rules: BitableFilterRule[] = [
        { id: 'r1', fieldId: 'name', operator: 'contains', value: 'Task' },
        { id: 'r2', fieldId: 'score', operator: 'gte', value: '90' }
      ];
      const result = applyFilterRules(rows, rules, 'AND', columns);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('OR 逻辑过滤', () => {
      const rules: BitableFilterRule[] = [
        { id: 'r1', fieldId: 'name', operator: 'contains', value: 'Issue' },
        { id: 'r2', fieldId: 'score', operator: 'gte', value: '90' }
      ];
      const result = applyFilterRules(rows, rules, 'OR', columns);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['2', '3']);
    });
  });
});
