import { describe, it, expect } from 'vitest';
import {
  resolveTableRegistry,
  resolveActiveTableId,
  renameTable,
  addTable,
  removeTable,
  moveTable,
  normalizeSnapshot,
  EMPTY_WORKSPACE_SNAPSHOT,
  createTableId,
  tableStorageKey,
  addFolder,
  renameFolder,
  removeFolder,
  toggleFolderCollapsed,
  moveTableToFolder,
  moveFolderToFolder,
  isFolderDescendant
} from './workspace';
import type { BitableTableDef, BitableWorkspaceSnapshot } from './workspace';

describe('workspace - 多表容器注册表逻辑', () => {
  const codeTables: BitableTableDef[] = [
    {
      id: 'tbl-1',
      label: '任务总表',
      initialData: [],
      defaultColumns: [],
      presetViews: []
    },
    {
      id: 'tbl-2',
      label: '人员名单',
      initialData: [],
      defaultColumns: [],
      presetViews: []
    }
  ];

  describe('createTableId & tableStorageKey', () => {
    it('生成带前缀和随机唯一 id', () => {
      const id1 = createTableId();
      const id2 = createTableId('project');
      expect(id1).toMatch(/^tbl_/);
      expect(id2).toMatch(/^project_/);
      expect(id1).not.toBe(id2);
    });

    it('生成命名空间 key', () => {
      expect(tableStorageKey('myApp', 'tbl-1')).toBe('myApp_tbl-1');
    });
  });

  describe('normalizeSnapshot', () => {
    it('兜底非法输入', () => {
      expect(normalizeSnapshot(null)).toEqual(EMPTY_WORKSPACE_SNAPSHOT);
      expect(normalizeSnapshot('bad-json')).toEqual(EMPTY_WORKSPACE_SNAPSHOT);
    });

    it('过滤损坏的数据项', () => {
      const normalized = normalizeSnapshot({
        version: 1,
        order: ['tbl-1', 123, null],
        meta: { 'tbl-1': { label: '重命名' } },
        deleted: ['tbl-old'],
        custom: [{ id: 'tbl-custom' }, null]
      });

      expect(normalized.order).toEqual(['tbl-1']);
      expect(normalized.meta['tbl-1'].label).toBe('重命名');
      expect(normalized.custom).toHaveLength(1);
    });
  });

  describe('resolveTableRegistry - 合成运行时表注册表', () => {
    it('无修改时按代码默认顺序展示', () => {
      const tables = resolveTableRegistry(codeTables, EMPTY_WORKSPACE_SNAPSHOT);
      expect(tables.map((t) => t.id)).toEqual(['tbl-1', 'tbl-2']);
      expect(tables[0].label).toBe('任务总表');
    });

    it('应用用户重命名和顺序调整', () => {
      const snapshot: BitableWorkspaceSnapshot = {
        version: 1,
        order: ['tbl-2', 'tbl-1'],
        meta: { 'tbl-1': { label: '已改名总表' } },
        deleted: [],
        custom: []
      };

      const tables = resolveTableRegistry(codeTables, snapshot);
      expect(tables.map((t) => t.id)).toEqual(['tbl-2', 'tbl-1']);
      expect(tables[1].label).toBe('已改名总表');
    });

    it('过滤用户删除的代码表', () => {
      const snapshot: BitableWorkspaceSnapshot = {
        version: 1,
        order: ['tbl-1', 'tbl-2'],
        meta: {},
        deleted: ['tbl-2'],
        custom: []
      };

      const tables = resolveTableRegistry(codeTables, snapshot);
      expect(tables.map((t) => t.id)).toEqual(['tbl-1']);
    });
  });

  describe('addTable, renameTable, removeTable, moveTable', () => {
    it('添加自定义表并设为当前表', () => {
      const newDef: BitableTableDef = {
        id: 'tbl-new',
        label: '新业务表',
        initialData: [],
        defaultColumns: [],
        presetViews: []
      };

      const next = addTable(EMPTY_WORKSPACE_SNAPSHOT, newDef);
      expect(next.activeTableId).toBe('tbl-new');
      expect(next.order).toContain('tbl-new');
      expect(next.custom).toHaveLength(1);
    });

    it('改名代码表与自定义表', () => {
      const snap1 = renameTable(EMPTY_WORKSPACE_SNAPSHOT, 'tbl-1', '新名字');
      expect(snap1.meta['tbl-1'].label).toBe('新名字');
    });

    it('删除表（代码表记进 deleted）', () => {
      const next = removeTable(EMPTY_WORKSPACE_SNAPSHOT, 'tbl-1');
      expect(next.deleted).toContain('tbl-1');
      expect(next.order).not.toContain('tbl-1');
    });

    it('调整表顺序', () => {
      const order = ['tbl-1', 'tbl-2', 'tbl-3'];
      const moved = moveTable(EMPTY_WORKSPACE_SNAPSHOT, 0, 2, order);
      expect(moved.order).toEqual(['tbl-2', 'tbl-3', 'tbl-1']);
    });
  });

  describe('resolveActiveTableId', () => {
    it('有效 id 优先保留', () => {
      const tables = resolveTableRegistry(codeTables, EMPTY_WORKSPACE_SNAPSHOT);
      const snapshot = { ...EMPTY_WORKSPACE_SNAPSHOT, activeTableId: 'tbl-2' };
      expect(resolveActiveTableId(tables, snapshot)).toBe('tbl-2');
    });

    it('失效 id 回落到第一张表', () => {
      const tables = resolveTableRegistry(codeTables, EMPTY_WORKSPACE_SNAPSHOT);
      const snapshot = { ...EMPTY_WORKSPACE_SNAPSHOT, activeTableId: 'tbl-deleted' };
      expect(resolveActiveTableId(tables, snapshot)).toBe('tbl-1');
    });
  });

  describe('文件夹与多层级分组逻辑 (Folder Hierarchy)', () => {
    it('支持创建文件夹及多层级子文件夹', () => {
      const { snapshot: s1, folderId: fld1 } = addFolder(EMPTY_WORKSPACE_SNAPSHOT, {
        name: '研发部门'
      });
      expect(s1.folders).toHaveLength(1);
      expect(s1.folders![0].name).toBe('研发部门');
      expect(s1.folders![0].parentId).toBeNull();

      // 创建子文件夹
      const { snapshot: s2, folderId: fld2 } = addFolder(s1, {
        name: '前端团队',
        parentId: fld1
      });
      expect(s2.folders).toHaveLength(2);
      const sub = s2.folders!.find((f) => f.id === fld2);
      expect(sub?.parentId).toBe(fld1);

      // 创建三级文件夹
      const { snapshot: s3, folderId: fld3 } = addFolder(s2, {
        name: '多维表格专项',
        parentId: fld2
      });
      expect(s3.folders).toHaveLength(3);
      const subSub = s3.folders!.find((f) => f.id === fld3);
      expect(subSub?.parentId).toBe(fld2);
    });

    it('支持重命名与折叠/展开文件夹', () => {
      const { snapshot: s1, folderId } = addFolder(EMPTY_WORKSPACE_SNAPSHOT, {
        name: '旧名称'
      });
      const s2 = renameFolder(s1, folderId, '新名称');
      expect(s2.folders![0].name).toBe('新名称');

      const s3 = toggleFolderCollapsed(s2, folderId);
      expect(s3.folderCollapsed![folderId]).toBe(true);
      const s4 = toggleFolderCollapsed(s3, folderId);
      expect(s4.folderCollapsed![folderId]).toBe(false);
    });

    it('移动表格至文件夹及移出至根目录', () => {
      const { snapshot: s1, folderId } = addFolder(EMPTY_WORKSPACE_SNAPSHOT, {
        name: '归档'
      });
      const s2 = moveTableToFolder(s1, 'tbl-1', folderId);
      expect(s2.tableFolders!['tbl-1']).toBe(folderId);

      const tables = resolveTableRegistry(codeTables, s2);
      expect(tables.find((t) => t.id === 'tbl-1')?.folderId).toBe(folderId);
      expect(tables.find((t) => t.id === 'tbl-2')?.folderId).toBeNull();

      // 移回根目录
      const s3 = moveTableToFolder(s2, 'tbl-1', null);
      expect(s3.tableFolders!['tbl-1']).toBeNull();
      const tablesRoot = resolveTableRegistry(codeTables, s3);
      expect(tablesRoot.find((t) => t.id === 'tbl-1')?.folderId).toBeNull();
    });

    it('防止文件夹嵌套自环 (Cycle Prevention)', () => {
      const { snapshot: s1, folderId: fldA } = addFolder(EMPTY_WORKSPACE_SNAPSHOT, { name: 'A' });
      const { snapshot: s2, folderId: fldB } = addFolder(s1, { name: 'B', parentId: fldA });
      const { snapshot: s3, folderId: fldC } = addFolder(s2, { name: 'C', parentId: fldB });

      expect(isFolderDescendant(s3.folders!, fldA, fldC)).toBe(true);
      expect(isFolderDescendant(s3.folders!, fldC, fldA)).toBe(false);

      // 尝试把 A 移入其子孙 C 中，应被阻止
      const prevented = moveFolderToFolder(s3, fldA, fldC);
      expect(prevented.folders!.find((f) => f.id === fldA)?.parentId).toBeNull();
    });

    it('删除文件夹时自动将子文件夹及表提升至上一级（保护数据不丢失）', () => {
      const { snapshot: s1, folderId: parentFld } = addFolder(EMPTY_WORKSPACE_SNAPSHOT, { name: '父目录' });
      const { snapshot: s2, folderId: childFld } = addFolder(s1, { name: '子目录', parentId: parentFld });
      const s3 = moveTableToFolder(s2, 'tbl-1', childFld);

      // 删除子目录：表应提升至父目录
      const s4 = removeFolder(s3, childFld);
      expect(s4.folders).toHaveLength(1);
      expect(s4.tableFolders!['tbl-1']).toBe(parentFld);

      // 删除父目录：表应提升至根目录 (null)
      const s5 = removeFolder(s4, parentFld);
      expect(s5.folders).toHaveLength(0);
      expect(s5.tableFolders!['tbl-1']).toBeNull();
    });
  });
});
