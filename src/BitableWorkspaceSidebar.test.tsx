import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BitableWorkspaceSidebar } from './BitableWorkspaceSidebar';
import type { BitableTableDef, BitableWorkspaceFolder } from './workspace';

describe('BitableWorkspaceSidebar - 多层级文件夹与分组', () => {
  const mockTables: BitableTableDef[] = [
    {
      id: 'tbl-1',
      label: '主任务表',
      initialData: [],
      defaultColumns: [],
      presetViews: [],
      folderId: 'fld-1'
    },
    {
      id: 'tbl-2',
      label: '子项目表',
      initialData: [],
      defaultColumns: [],
      presetViews: [],
      folderId: 'fld-sub'
    },
    {
      id: 'tbl-3',
      label: '根目录表',
      initialData: [],
      defaultColumns: [],
      presetViews: [],
      folderId: null
    }
  ];

  const mockFolders: BitableWorkspaceFolder[] = [
    { id: 'fld-1', name: '项目目录', parentId: null },
    { id: 'fld-sub', name: '二级子目录', parentId: 'fld-1' }
  ];

  it('底部渲染「新建数据表」与「新建文件夹」双按钮', () => {
    const html = renderToStaticMarkup(
      <BitableWorkspaceSidebar
        tables={mockTables}
        activeTableId="tbl-1"
        onSelectTable={vi.fn()}
        onAddTable={vi.fn()}
        onAddFolder={vi.fn()}
      />
    );

    expect(html).toContain('新建数据表');
    expect(html).toContain('新建文件夹');
  });

  it('正常渲染嵌套文件夹与对应表', () => {
    const html = renderToStaticMarkup(
      <BitableWorkspaceSidebar
        tables={mockTables}
        folders={mockFolders}
        activeTableId="tbl-1"
        onSelectTable={vi.fn()}
        onAddTable={vi.fn()}
        onAddFolder={vi.fn()}
      />
    );

    expect(html).toContain('项目目录');
    expect(html).toContain('二级子目录');
    expect(html).toContain('主任务表');
    expect(html).toContain('子项目表');
    expect(html).toContain('根目录表');
  });

  it('选中某文件夹后，底部新建按钮文案变为「新建子文件夹」并附带父级提示', () => {
    const html = renderToStaticMarkup(
      <BitableWorkspaceSidebar
        tables={mockTables}
        folders={mockFolders}
        selectedFolderId="fld-1"
        activeTableId="tbl-1"
        onSelectTable={vi.fn()}
        onAddTable={vi.fn()}
        onAddFolder={vi.fn()}
      />
    );

    expect(html).toContain('新建子文件夹');
    expect(html).toContain('点中文件夹【项目目录】：点击新建子文件夹');
    expect(html).toContain('取消选中「项目目录」');
  });

  it('文件夹悬停操作栏中包含新建子文件夹快捷入口', () => {
    const html = renderToStaticMarkup(
      <BitableWorkspaceSidebar
        tables={mockTables}
        folders={mockFolders}
        activeTableId="tbl-1"
        onSelectTable={vi.fn()}
        onAddTable={vi.fn()}
        onAddFolder={vi.fn()}
      />
    );

    expect(html).toContain('title="新建子文件夹"');
    expect(html).toContain('title="在此文件夹新建表"');
  });
});
