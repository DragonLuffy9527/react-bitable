import { describe, it, expect } from 'vitest';
import {
  parseCurrency,
  formatCurrency,
  parseProgress,
  formatProgress,
  parseRating,
  formatRating
} from './cellValue';
import { resolveComparableKind, toComparable, matchesRule } from './filtering';
import { summaryOptionsFor, resolveSummaryType, computeSummary } from './aggregate';
import { incrementValue, buildFillPlan } from './fillSeries';
import { coercePastedValue } from './clipboard';
import { getFieldText } from './cardModel';

describe('L2 Field Types: Currency (货币)', () => {
  it('parseCurrency parses numbers and currency strings correctly', () => {
    expect(parseCurrency(1234.56)).toBe(1234.56);
    expect(parseCurrency('¥1,234.56')).toBe(1234.56);
    expect(parseCurrency('$ 9,999.00')).toBe(9999);
    expect(parseCurrency('€ -500.25')).toBe(-500.25);
    expect(parseCurrency('8888')).toBe(8888);
    expect(parseCurrency('')).toBeNull();
    expect(parseCurrency(null)).toBeNull();
    expect(parseCurrency(undefined)).toBeNull();
    expect(parseCurrency('abc')).toBeNull();
  });

  it('formatCurrency formats with symbol and thousand separators', () => {
    expect(formatCurrency(1234.5)).toBe('¥ 1,234.50');
    expect(formatCurrency('9999999.99')).toBe('¥ 9,999,999.99');
    expect(formatCurrency(500, '$')).toBe('$ 500.00');
    expect(formatCurrency(0)).toBe('¥ 0.00');
    expect(formatCurrency('')).toBe('');
    expect(formatCurrency(null)).toBe('');
  });

  it('filters currency with numeric operators like gt, lt, between', () => {
    expect(resolveComparableKind('currency')).toBe('number');
    expect(toComparable('number', '¥ 2,500.00')).toBe(2500);

    const row = { amount: '¥ 1,500.00' };
    const ruleGt = { id: 'r1', fieldId: 'amount', operator: 'gt' as const, value: '1000' };
    const ruleLt = { id: 'r2', fieldId: 'amount', operator: 'lt' as const, value: '1000' };
    const ruleBetween = { id: 'r3', fieldId: 'amount', operator: 'between' as const, value: '1000', value2: '2000' };

    const kind = resolveComparableKind('currency');
    expect(matchesRule(row, ruleGt, kind)).toBe(true);
    expect(matchesRule(row, ruleLt, kind)).toBe(false);
    expect(matchesRule(row, ruleBetween, kind)).toBe(true);
  });

  it('aggregates currency with sum by default', () => {
    expect(summaryOptionsFor('currency')).toContain('sum');
    expect(summaryOptionsFor('currency')).toContain('avg');
    expect(resolveSummaryType({ id: 'cost', type: 'currency' }, undefined, true)).toBe('sum');

    const items = [{ cost: '¥ 1,000' }, { cost: '¥ 2,500' }, { cost: 500 }];
    const cols = [{ id: 'cost', type: 'currency' as const }];
    const res = computeSummary(items, cols, { cost: 'sum' }, false);
    expect(res.cells.cost.value).toBe(4000);
    expect(res.cells.cost.text).toBe('¥ 4,000');
  });
});

describe('L2 Field Types: Progress (进度条)', () => {
  it('parseProgress handles numbers, % strings, and clamps to 0-100', () => {
    expect(parseProgress(45)).toBe(45);
    expect(parseProgress('80%')).toBe(80);
    expect(parseProgress(' 99.4 % ')).toBe(99);
    expect(parseProgress(150)).toBe(100);
    expect(parseProgress(-20)).toBe(0);
    expect(parseProgress('0')).toBe(0);
    expect(parseProgress('')).toBeNull();
    expect(parseProgress(null)).toBeNull();
  });

  it('formatProgress returns percent and text', () => {
    expect(formatProgress(75)).toEqual({ percent: 75, text: '75%' });
    expect(formatProgress('100%')).toEqual({ percent: 100, text: '100%' });
    expect(formatProgress(null)).toEqual({ percent: 0, text: '' });
  });

  it('filters progress numerically', () => {
    expect(resolveComparableKind('progress')).toBe('number');
    expect(toComparable('number', '85%')).toBe(85);

    const row = { progress: '85%' };
    const ruleGte = { id: 'r1', fieldId: 'progress', operator: 'gte' as const, value: '80' };
    const kind = resolveComparableKind('progress');
    expect(matchesRule(row, ruleGte, kind)).toBe(true);
  });

  it('increments progress by steps of 5 and clamps at 100', () => {
    expect(incrementValue('progress', 70, 1)).toBe(75);
    expect(incrementValue('progress', 95, 2)).toBe(100);
    expect(incrementValue('progress', 10, -1)).toBe(5);
    expect(incrementValue('progress', 2, -2)).toBe(0);
  });

  it('aggregates progress with avg by default', () => {
    expect(resolveSummaryType({ id: 'prog', type: 'progress' }, undefined, true)).toBe('avg');

    const items = [{ prog: 60 }, { prog: '80%' }, { prog: 100 }];
    const cols = [{ id: 'prog', type: 'progress' as const }];
    const res = computeSummary(items, cols, { prog: 'avg' }, false);
    expect(res.cells.prog.value).toBe(80);
    expect(res.cells.prog.text).toBe('80%');
  });
});

describe('L2 Field Types: Rating (评分)', () => {
  it('parseRating parses and clamps to 0-maxRating', () => {
    expect(parseRating(4)).toBe(4);
    expect(parseRating(5)).toBe(5);
    expect(parseRating(7)).toBe(5);
    expect(parseRating(7, 10)).toBe(7);
    expect(parseRating(-1)).toBe(0);
    expect(parseRating('3')).toBe(3);
    expect(parseRating(null)).toBe(0);
  });

  it('formatRating returns rating and max', () => {
    expect(formatRating(4)).toEqual({ rating: 4, max: 5 });
    expect(formatRating(8, 10)).toEqual({ rating: 8, max: 10 });
  });

  it('increments rating by step and clamps at max 5', () => {
    expect(incrementValue('rating', 2, 1)).toBe(3);
    expect(incrementValue('rating', 4, 3)).toBe(5);
    expect(incrementValue('rating', 2, -3)).toBe(0);
  });

  it('cardModel formats rating with filled and empty stars', () => {
    const col = { id: 'score', label: '评分', type: 'rating' as const, visible: true };
    const row = { score: 3 };
    expect(getFieldText(col, row)).toBe('★★★☆☆');
  });
});

describe('L2 Field Types: Email & Phone', () => {
  it('coercePastedValue handles email and phone', () => {
    expect(coercePastedValue('email', '  user@example.com ')).toBe('user@example.com');
    expect(coercePastedValue('phone', ' +86 13800138000 ')).toBe('+86 13800138000');
  });

  it('cardModel formats email and phone correctly', () => {
    const colEmail = { id: 'mail', label: '邮箱', type: 'email' as const, visible: true };
    const colPhone = { id: 'tel', label: '电话', type: 'phone' as const, visible: true };
    expect(getFieldText(colEmail, { mail: 'test@domain.com' })).toBe('test@domain.com');
    expect(getFieldText(colPhone, { tel: '13812345678' })).toBe('13812345678');
  });
});
