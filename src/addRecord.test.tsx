import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BitableAddRecordPopover } from './BitableAddRecordPopover';

describe('BitableAddRecordPopover - 添加记录弹层', () => {
  it('未选中任何行时默认渲染末尾追加提示', () => {
    const html = renderToStaticMarkup(
      <BitableAddRecordPopover
        hasSelectedRow={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('添加记录');
    expect(html).toContain('添加行数');
    expect(html).toContain('未选中任何行');
    expect(html).toContain('表格末尾追加');
  });

  it('选中行时默认提供在所选行后添加与末尾追加选项，且所选行后为默认', () => {
    const html = renderToStaticMarkup(
      <BitableAddRecordPopover
        hasSelectedRow={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('添加记录');
    expect(html).toContain('插入位置');
    expect(html).toContain('在所选行后添加');
    expect(html).toContain('在表格末尾追加');
    expect(html).toContain('默认');
  });
});
