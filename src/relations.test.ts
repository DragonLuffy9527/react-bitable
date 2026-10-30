import { describe, it, expect } from 'vitest';
import {
  resolveLinkedRecordIds,
  getLinkedRecords,
  formatLinkedRecordDisplay,
  computeLookupValue,
  computeRowLookups,
  applyLookupsToRows
} from './relations';
import type { BitableColumnConfig, BitableLinkedTableAccessor } from './types';

describe('relations', () => {
  describe('resolveLinkedRecordIds', () => {
    it('处理空值与非标准输入', () => {
      expect(resolveLinkedRecordIds(null)).toEqual([]);
      expect(resolveLinkedRecordIds(undefined)).toEqual([]);
      expect(resolveLinkedRecordIds('')).toEqual([]);
      expect(resolveLinkedRecordIds('   ')).toEqual([]);
    });

    it('支持标准字符串数组与去重', () => {
      expect(resolveLinkedRecordIds(['rec_1', 'rec_2', 'rec_1', ' '])).toEqual(['rec_1', 'rec_2']);
    });

    it('支持包含 id 属性的对象数组', () => {
      expect(resolveLinkedRecordIds([{ id: 'p1' }, { id: 'p2' }, { id: 'p1' }])).toEqual(['p1', 'p2']);
    });

    it('支持 JSON 数组字符串', () => {
      expect(resolveLinkedRecordIds('["rec_1", "rec_2"]')).toEqual(['rec_1', 'rec_2']);
    });

    it('支持多分隔符字符串（逗号、顿号、分号、竖线）', () => {
      expect(resolveLinkedRecordIds('a, b、c; d|e')).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(resolveLinkedRecordIds('single_id')).toEqual(['single_id']);
    });
  });

  describe('getLinkedRecords', () => {
    const targetRows = [
      { id: '1', title: '项目 A' },
      { id: '2', title: '项目 B' },
      { id: '3', title: '项目 C' }
    ];

    it('按指定顺序返回匹配记录，过滤不存在的 ID', () => {
      const result = getLinkedRecords(targetRows, ['3', 'not_found', '1']);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('项目 C');
      expect(result[1].title).toBe('项目 A');
    });

    it('空入参容错', () => {
      expect(getLinkedRecords([], ['1'])).toEqual([]);
      expect(getLinkedRecords(targetRows, [])).toEqual([]);
    });
  });

  describe('formatLinkedRecordDisplay', () => {
    it('优先使用 targetFieldId 指定字段', () => {
      const record = { id: 'r1', code: 'PRJ-101', name: '上海中心大厦' };
      expect(formatLinkedRecordDisplay(record, [], 'code')).toBe('PRJ-101');
      expect(formatLinkedRecordDisplay(record, [], 'name')).toBe('上海中心大厦');
    });

    it('未指定 targetFieldId 时，优先匹配目标表首个有效可见列', () => {
      const record = { id: 'r1', title: '主标题', desc: '描述内容' };
      const columns: BitableColumnConfig[] = [
        { id: 'desc', label: '描述', type: 'text', visible: true }
      ];
      expect(formatLinkedRecordDisplay(record, columns)).toBe('描述内容');
    });

    it('按常见字段自动回退（title/name/label/code/id）', () => {
      expect(formatLinkedRecordDisplay({ id: 'r1', title: '工程任务' })).toBe('工程任务');
      expect(formatLinkedRecordDisplay({ id: 'r2', name: '设备采购' })).toBe('设备采购');
      expect(formatLinkedRecordDisplay({ id: 'r3' })).toBe('r3');
      expect(formatLinkedRecordDisplay({})).toBe('未命名记录');
    });
  });

  describe('computeLookupValue', () => {
    const targetRows = [
      { id: 'p1', name: '智慧园区', budget: 1500000, manager: '张工' },
      { id: 'p2', name: '数据中心', budget: 3200000, manager: '李工' }
    ];

    it('单值模式返回第一个匹配字段', () => {
      const row = { id: 't1', projectId: 'p2' };
      const budget = computeLookupValue(row, 'projectId', 'budget', targetRows, false);
      expect(budget).toBe(3200000);
    });

    it('多值模式返回提取字段数组', () => {
      const row = { id: 't2', projectId: ['p1', 'p2'] };
      const managers = computeLookupValue(row, 'projectId', 'manager', targetRows, true);
      expect(managers).toEqual(['张工', '李工']);
    });

    it('无关联时返回安全缺省值', () => {
      const row = { id: 't3', projectId: [] };
      expect(computeLookupValue(row, 'projectId', 'budget', targetRows, false)).toBe('');
      expect(computeLookupValue(row, 'projectId', 'budget', targetRows, true)).toEqual([]);
    });
  });

  describe('computeRowLookups & applyLookupsToRows', () => {
    const projectTable = {
      id: 'projects',
      label: '项目表',
      columns: [
        { id: 'id', label: 'ID', type: 'text' as const, visible: true },
        { id: 'name', label: '项目名', type: 'text' as const, visible: true },
        { id: 'budget', label: '预算', type: 'currency' as const, visible: true }
      ],
      data: [
        { id: 'prj_1', name: '新机场二期', budget: 8800000 },
        { id: 'prj_2', name: '高铁站枢纽', budget: 4500000 }
      ]
    };

    const taskColumns: BitableColumnConfig[] = [
      { id: 'title', label: '任务名', type: 'text', visible: true },
      {
        id: 'projectLink',
        label: '所属项目',
        type: 'link',
        linkConfig: { targetTableId: 'projects', multiple: false },
        visible: true
      },
      {
        id: 'projectBudget',
        label: '项目预算',
        type: 'lookup',
        lookupConfig: { linkFieldId: 'projectLink', targetFieldId: 'budget' },
        visible: true
      }
    ];

    const accessor: BitableLinkedTableAccessor = (tableId) => {
      if (tableId === 'projects') return projectTable;
      return undefined;
    };

    it('为单行动态计算 lookup 投影字段', () => {
      const row: Record<string, any> = {
        id: 'tsk_1',
        title: '航站楼基础施工',
        projectLink: 'prj_1'
      };

      const result = computeRowLookups(row, taskColumns, accessor);
      expect(result.projectBudget).toBe(8800000);
    });

    it('为多行批量投影 Lookup 字段', () => {
      const rows: Record<string, any>[] = [
        { id: 'tsk_1', title: '航站楼基础施工', projectLink: 'prj_1' },
        { id: 'tsk_2', title: '轨道铺设', projectLink: 'prj_2' },
        { id: 'tsk_3', title: '独立临时任务', projectLink: '' }
      ];

      const enriched = applyLookupsToRows(rows, taskColumns, accessor);
      expect(enriched[0].projectBudget).toBe(8800000);
      expect(enriched[1].projectBudget).toBe(4500000);
      expect(enriched[2].projectBudget).toBe('');
    });
  });
});
