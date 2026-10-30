import { describe, it, expect } from 'vitest';
import {
  serializeColumns,
  buildSchema,
  mergeColumns,
  mergeViews,
  normalizeView
} from './schema';
import type { BitableColumnConfig, BitableViewConfig } from './types';

describe('schema - 列与视图配置合并与序列化', () => {
  describe('serializeColumns', () => {
    it('剔除函数字段 render 和 resolveFiles', () => {
      const cols: BitableColumnConfig<any>[] = [
        {
          id: 'title',
          label: '标题',
          type: 'text',
          visible: true,
          render: () => null,
          resolveFiles: () => []
        }
      ];

      const serialized = serializeColumns(cols);
      expect(serialized[0].id).toBe('title');
      expect((serialized[0] as any).render).toBeUndefined();
      expect((serialized[0] as any).resolveFiles).toBeUndefined();
    });
  });

  describe('buildSchema', () => {
    it('构建快照并标记锁定字段', () => {
      const cols: BitableColumnConfig<any>[] = [
        { id: 'c1', label: 'C1', type: 'text', visible: true, isLocked: true },
        { id: 'c2', label: 'C2', type: 'number', visible: true }
      ];
      const views: BitableViewConfig[] = [];

      const snapshot = buildSchema({
        columns: cols,
        views,
        activeViewId: 'v1',
        schemaVersion: '1.0.0'
      });

      expect(snapshot.columns).toHaveLength(2);
      expect(snapshot.lockedColumnIds).toEqual(['c1']);
      expect(snapshot.activeViewId).toBe('v1');
      expect(snapshot.schemaVersion).toBe('1.0.0');
    });
  });

  describe('mergeColumns', () => {
    const defaultColumns: BitableColumnConfig<any>[] = [
      { id: 'name', label: '名称', type: 'text', visible: true, editable: true },
      { id: 'score', label: '分数', type: 'number', visible: true, editable: false }
    ];

    it('合并存储中的重命名与宽度', () => {
      const saved: BitableColumnConfig<any>[] = [
        { id: 'name', label: '姓名（改）', type: 'text', width: '200px', visible: true }
      ];

      const merged = mergeColumns(saved, { defaultColumns });
      expect(merged).toHaveLength(2);
      expect(merged[0].label).toBe('姓名（改）');
      expect(merged[0].width).toBe('200px');
      // editable 始终以代码为准
      expect(merged[0].editable).toBe(true);
    });

    it('保留用户自定义列，丢弃已不存在的代码列', () => {
      const saved: BitableColumnConfig<any>[] = [
        { id: 'name', label: '名称', type: 'text', visible: true },
        { id: 'custom_1', label: '自定义列', type: 'text', visible: true, isCustom: true },
        { id: 'obsolete', label: '已废弃代码列', type: 'text', visible: true }
      ];

      const merged = mergeColumns(saved, { defaultColumns });
      const ids = merged.map((c) => c.id);
      expect(ids).toContain('name');
      expect(ids).toContain('score');
      expect(ids).toContain('custom_1');
      expect(ids).not.toContain('obsolete');
    });

    it('过滤已删除的列', () => {
      const saved: BitableColumnConfig<any>[] = [
        { id: 'name', label: '名称', type: 'text', visible: true }
      ];
      const deletedIds = new Set(['score']);

      const merged = mergeColumns(saved, { defaultColumns, deletedIds });
      expect(merged.map((c) => c.id)).not.toContain('score');
    });
  });

  describe('normalizeView & mergeViews', () => {
    it('normalizeView 补齐兼容字段', () => {
      const raw: any = {
        id: 'v1',
        name: '看板',
        groupByFieldId: 'status'
      };

      const normalized = normalizeView(raw);
      expect(normalized.viewType).toBe('grid');
      expect(normalized.scope).toBe('collaborative');
      expect(normalized.groupRules).toHaveLength(1);
      expect(normalized.groupRules![0].fieldId).toBe('status');
    });

    it('mergeViews 保证主视图存在并排在首位', () => {
      const presets: BitableViewConfig[] = [
        {
          id: 'master',
          name: '总表',
          viewType: 'grid',
          filterLogic: 'AND',
          filterRules: [],
          sortRules: [],
          groupByFieldId: null,
          density: 'medium',
          colorRules: [],
          visibleColumnIds: [],
          columnOrder: []
        }
      ];

      const saved: BitableViewConfig[] = [
        {
          id: 'v2',
          name: '个人看板',
          viewType: 'kanban',
          filterLogic: 'AND',
          filterRules: [],
          sortRules: [],
          groupByFieldId: null,
          density: 'medium',
          colorRules: [],
          visibleColumnIds: [],
          columnOrder: []
        }
      ];

      const merged = mergeViews(saved, presets);
      expect(merged[0].id).toBe('master');
      expect(merged[1].id).toBe('v2');
    });
  });
});
