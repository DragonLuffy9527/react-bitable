import { describe, it, expect } from 'vitest';
import {
  computeSummary,
  resolveSummaryType,
  summaryOptionsFor,
  formatNumber,
  hasSummaryCells
} from './aggregate';

describe('aggregate - 分组汇总与统计', () => {
  describe('formatNumber - 千分位与精度格式化', () => {
    it('千分位加逗号，最多两位小数', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1234567.89)).toBe('1,234,567.89');
      expect(formatNumber(1234.5)).toBe('1,234.5');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(-1500.5)).toBe('-1,500.5');
    });

    it('非法数字返回空串', () => {
      expect(formatNumber(NaN)).toBe('');
      expect(formatNumber(Infinity)).toBe('');
    });
  });

  describe('summaryOptionsFor - 字段可选汇总方式', () => {
    it('数字列支持全部 6 种方式', () => {
      expect(summaryOptionsFor('number')).toEqual(['none', 'sum', 'avg', 'max', 'min', 'count']);
    });

    it('日期列支持 max, min, count', () => {
      expect(summaryOptionsFor('date')).toEqual(['none', 'max', 'min', 'count']);
    });

    it('其他列只支持 count', () => {
      expect(summaryOptionsFor('text')).toEqual(['none', 'count']);
      expect(summaryOptionsFor('select')).toEqual(['none', 'count']);
    });
  });

  describe('resolveSummaryType - 解析汇总类型', () => {
    it('按用户规则显式配置优先', () => {
      expect(resolveSummaryType({ id: 'amount', type: 'number' }, { amount: 'avg' }, true)).toBe('avg');
      expect(resolveSummaryType({ id: 'amount', type: 'number' }, { amount: 'none' }, true)).toBe('none');
    });

    it('无规则且处于分组状态（autoSum=true）时，数字列默认求和', () => {
      expect(resolveSummaryType({ id: 'amount', type: 'number' }, undefined, true)).toBe('sum');
      expect(resolveSummaryType({ id: 'title', type: 'text' }, undefined, true)).toBe('none');
    });

    it('未开启 autoSum 时未配置的列不汇总', () => {
      expect(resolveSummaryType({ id: 'amount', type: 'number' }, undefined, false)).toBe('none');
    });
  });

  describe('computeSummary - 实际数据汇总计算', () => {
    const data = [
      { id: '1', score: 100, cost: '1,000', date: '2026-10-01', user: 'Alice' },
      { id: '2', score: 200, cost: '2,000', date: '2026-10-10', user: 'Bob' },
      { id: '3', score: 300, cost: null, date: '2026-10-05', user: '' },
      { id: '4', score: null, cost: '3,000', date: null, user: undefined }
    ];

    const columns = [
      { id: 'score', type: 'number' as const },
      { id: 'cost', type: 'number' as const },
      { id: 'date', type: 'date' as const },
      { id: 'user', type: 'text' as const }
    ];

    it('计算 count（统计非空单元格数）', () => {
      const result = computeSummary(data, columns, { user: 'count' }, false);
      expect(result.count).toBe(4);
      expect(result.cells.user).toBeDefined();
      expect(result.cells.user.value).toBe(2);
      expect(result.cells.user.text).toBe('2');
    });

    it('计算 sum（求和，跳过空值）', () => {
      const result = computeSummary(data, columns, { score: 'sum', cost: 'sum' }, false);
      expect(result.cells.score.value).toBe(600);
      expect(result.cells.score.text).toBe('600');
      // cost 包含千分位字符串 '1,000' + '2,000' + '3,000'
      expect(result.cells.cost.value).toBe(6000);
      expect(result.cells.cost.text).toBe('6,000');
    });

    it('计算 avg（平均值，跳过空值不拉低平均）', () => {
      const result = computeSummary(data, columns, { score: 'avg' }, false);
      // (100 + 200 + 300) / 3 = 200 (第四项为 null，不计入除数)
      expect(result.cells.score.value).toBe(200);
      expect(result.cells.score.text).toBe('200');
    });

    it('计算 max 和 min', () => {
      const result = computeSummary(data, columns, { score: 'max', cost: 'min' }, false);
      expect(result.cells.score.value).toBe(300);
      expect(result.cells.cost.value).toBe(1000);
    });

    it('计算日期列极值', () => {
      const result = computeSummary(data, columns, { date: 'max' }, false);
      expect(result.cells.date.text).toBe('2026-10-10');
      const minResult = computeSummary(data, columns, { date: 'min' }, false);
      expect(minResult.cells.date.text).toBe('2026-10-01');
    });

    it('hasSummaryCells 正确反映是否有有效汇总格子', () => {
      const emptyResult = computeSummary(data, columns, {}, false);
      expect(hasSummaryCells(emptyResult)).toBe(false);

      const withResult = computeSummary(data, columns, { score: 'sum' }, false);
      expect(hasSummaryCells(withResult)).toBe(true);
    });
  });
});
