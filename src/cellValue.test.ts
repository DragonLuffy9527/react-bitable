import { describe, it, expect } from 'vitest';
import {
  toValueList,
  firstValue,
  findOption,
  resolveOptionList,
  normalizeUrl,
  displayUrl,
  initialsOf,
  isMultiValueType,
  FALLBACK_OPTION_COLOR
} from './cellValue';

describe('cellValue - 单元格取值与选项解析', () => {
  describe('toValueList', () => {
    it('处理数组输入', () => {
      expect(toValueList(['A', 'B'])).toEqual(['A', 'B']);
    });

    it('处理分隔符分隔的字符串', () => {
      expect(toValueList('张三、李四')).toEqual(['张三', '李四']);
      expect(toValueList('A, B; C')).toEqual(['A', 'B', 'C']);
      expect(toValueList('甲，乙；丙')).toEqual(['甲', '乙', '丙']);
    });

    it('处理单个值与空值', () => {
      expect(toValueList('开发')).toEqual(['开发']);
      expect(toValueList(null)).toEqual([]);
      expect(toValueList(undefined)).toEqual([]);
      expect(toValueList('')).toEqual([]);
    });
  });

  describe('firstValue', () => {
    it('获取第一个值', () => {
      expect(firstValue(['A', 'B'])).toBe('A');
      expect(firstValue('张三、李四')).toBe('张三');
      expect(firstValue(null)).toBe('');
    });
  });

  describe('findOption & resolveOptionList', () => {
    const options = [
      { label: '进行中', value: 'doing', color: 'blue' },
      { label: '已完成', value: 'done', color: 'green' }
    ];

    it('根据 value 或 label 匹配选项', () => {
      expect(findOption(options, 'doing')?.label).toBe('进行中');
      expect(findOption(options, '已完成')?.value).toBe('done');
      expect(findOption(options, '未知')).toBeUndefined();
    });

    it('resolveOptionList 对不存在的值生成 fallback 选项', () => {
      const list = resolveOptionList(options, 'doing, 未知状态');
      expect(list).toHaveLength(2);
      expect(list[0].color).toBe('blue');
      expect(list[1].label).toBe('未知状态');
      expect(list[1].color).toBe(FALLBACK_OPTION_COLOR);
    });
  });

  describe('normalizeUrl & displayUrl', () => {
    it('补齐协议头', () => {
      expect(normalizeUrl('example.com/test')).toBe('https://example.com/test');
      expect(normalizeUrl('http://example.com')).toBe('http://example.com');
      expect(normalizeUrl('//cdn.example.com/a.js')).toBe('https://cdn.example.com/a.js');
      expect(normalizeUrl('mailto:admin@example.com')).toBe('mailto:admin@example.com');
    });

    it('展示 URL 去掉协议和尾部斜杠', () => {
      expect(displayUrl('https://example.com/docs/')).toBe('example.com/docs');
      expect(displayUrl('http://github.com')).toBe('github.com');
    });
  });

  describe('initialsOf - 头像缩写', () => {
    it('中文取首字（姓氏）', () => {
      expect(initialsOf('张伟')).toBe('张');
      expect(initialsOf('诸葛孔明')).toBe('诸');
    });

    it('英文取前两位大写', () => {
      expect(initialsOf('Alice')).toBe('AL');
      expect(initialsOf('bob')).toBe('BO');
    });

    it('空名返回问号', () => {
      expect(initialsOf('')).toBe('?');
      expect(initialsOf('  ')).toBe('?');
    });
  });

  describe('isMultiValueType', () => {
    it('识别多值类型', () => {
      expect(isMultiValueType('multiSelect')).toBe(true);
      expect(isMultiValueType('user')).toBe(true);
      expect(isMultiValueType('group')).toBe(true);
      expect(isMultiValueType('text')).toBe(false);
      expect(isMultiValueType('select')).toBe(false);
    });
  });
});
