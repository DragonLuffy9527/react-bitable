import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BitableGalleryView } from './BitableGalleryView';
import { BitableFormView } from './BitableFormView';
import { BitableTable } from './BitableTable';
import { BitableColumnConfig, BitableViewConfig } from './types';

interface TestRow {
  id: string;
  code: string;
  name: string;
  status: string;
  owner: string;
  price: number;
  progress: number;
  rating: number;
  email: string;
  phone: string;
  attachments?: { name: string; size?: string; url?: string }[];
}

const mockColumns: BitableColumnConfig<TestRow>[] = [
  { id: 'code', label: '图号', type: 'text', visible: true },
  { id: 'name', label: '名称', type: 'text', visible: true },
  { id: 'status', label: '状态', type: 'select', visible: true },
  { id: 'owner', label: '责任人', type: 'user', visible: true },
  { id: 'price', label: '预算', type: 'currency', currencySymbol: '¥', visible: true },
  { id: 'progress', label: '进度', type: 'progress', visible: true },
  { id: 'rating', label: '评分', type: 'rating', maxRating: 5, visible: true },
  { id: 'email', label: '邮箱', type: 'email', visible: true },
  { id: 'phone', label: '电话', type: 'phone', visible: true },
  { id: 'attachments', label: '图纸附件', type: 'attachment', visible: true }
];

const mockItems: TestRow[] = [
  {
    id: 'row-1',
    code: 'DWG-001',
    name: '首层平面结构图',
    status: '已核准',
    owner: '张工程师',
    price: 125000,
    progress: 80,
    rating: 5,
    email: 'zhang@example.com',
    phone: '13800000001',
    attachments: [{ name: 'floor1.pdf', size: '2.4MB' }]
  },
  {
    id: 'row-2',
    code: 'DWG-002',
    name: '地下室防水节点大样',
    status: '差异',
    owner: '李工',
    price: 45000,
    progress: 30,
    rating: 3,
    email: 'li@example.com',
    phone: '13800000002',
    attachments: [{ name: 'waterproof.png', size: '1.2MB' }]
  }
];

const baseView: BitableViewConfig = {
  id: 'base-view',
  name: '基础视图',
  filterLogic: 'AND',
  filterRules: [],
  sortRules: [],
  groupByFieldId: null,
  density: 'medium',
  colorRules: [],
  visibleColumnIds: [],
  columnOrder: []
};

describe('BitableGalleryView - 画册视图增强', () => {
  it('正确渲染顶部工具栏、统计与卡片列表', () => {
    const html = renderToStaticMarkup(
      <BitableGalleryView
        items={mockItems}
        columns={mockColumns}
        viewConfig={{
          ...baseView,
          id: 'v-gallery',
          name: '工程图纸画册',
          viewType: 'gallery',
          visibleColumnIds: ['code', 'name', 'status'],
          columnOrder: ['code', 'name', 'status']
        }}
      />
    );

    expect(html).toContain('工程图纸画册');
    expect(html).toContain('共 2 张卡片');
    expect(html).toContain('搜索卡片标题、编号、人员');
    expect(html).toContain('DWG-001');
    expect(html).toContain('首层平面结构图');
    expect(html).toContain('已核准');
    expect(html).toContain('DWG-002');
    expect(html).toContain('地下室防水节点大样');
  });

  it('支持卡片尺寸规格（小 / 中 / 大）渲染', () => {
    const htmlSmall = renderToStaticMarkup(
      <BitableGalleryView
        items={mockItems}
        columns={mockColumns}
        viewConfig={{
          ...baseView,
          id: 'v-gallery',
          name: '画册',
          viewType: 'gallery',
          galleryCardSize: 'small',
          visibleColumnIds: ['code'],
          columnOrder: ['code']
        }}
      />
    );
    expect(htmlSmall).toContain('h-28');

    const htmlLarge = renderToStaticMarkup(
      <BitableGalleryView
        items={mockItems}
        columns={mockColumns}
        viewConfig={{
          ...baseView,
          id: 'v-gallery',
          name: '画册',
          viewType: 'gallery',
          galleryCardSize: 'large',
          visibleColumnIds: ['code'],
          columnOrder: ['code']
        }}
      />
    );
    expect(htmlLarge).toContain('h-52');
  });

  it('在无数据时显示优雅空状态', () => {
    const html = renderToStaticMarkup(
      <BitableGalleryView items={[]} columns={mockColumns} />
    );
    expect(html).toContain('暂无卡片数据');
    expect(html).toContain('共 0 张卡片');
  });
});

describe('BitableFormView - 表单视图增强', () => {
  it('正确渲染各特化字段类型（评分、进度、金额、邮箱、电话等）', () => {
    const html = renderToStaticMarkup(
      <BitableFormView
        items={mockItems}
        columns={mockColumns}
        viewConfig={{
          ...baseView,
          id: 'v-form',
          name: '工单填报表单',
          viewType: 'form',
          visibleColumnIds: ['code', 'name', 'price', 'progress', 'rating'],
          columnOrder: ['code', 'name', 'price', 'progress', 'rating']
        }}
      />
    );

    expect(html).toContain('工单填报表单');
    expect(html).toContain('必填项');
    expect(html).toContain('¥');
    expect(html).toContain('点击评星');
    expect(html).toContain('提交');
    expect(html).toContain('清空');
  });

  it('正确配置必填项与表单提交文案', () => {
    const customConfig: BitableViewConfig = {
      ...baseView,
      id: 'v-form-custom',
      name: '质量报验单',
      viewType: 'form',
      formSubmitText: '立即上报',
      formRequiredFields: ['code', 'name'],
      visibleColumnIds: ['code', 'name'],
      columnOrder: ['code', 'name']
    };

    const html = renderToStaticMarkup(
      <BitableFormView items={mockItems} columns={mockColumns} viewConfig={customConfig} />
    );

    expect(html).toContain('质量报验单');
    expect(html).toContain('立即上报');
    expect(html).toContain('必填项完成度 0 / 2');
  });
});

describe('BitableTable - 6 种视图统一调度（无 Hook 违背，杜绝白屏崩溃）', () => {
  const groupedData = [{ groupKey: '__ALL__', groupTitle: '全部', items: mockItems }];

  it('表格视图 (grid) 正常渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="grid"
      />
    );
    expect(html).toContain('DWG-001');
    expect(html).toContain('DWG-002');
  });

  it('看板视图 (kanban) 正常调度渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="kanban"
        viewConfig={{ ...baseView, kanbanFieldId: 'status' }}
      />
    );
    expect(html).toContain('已核准');
    expect(html).toContain('差异');
  });

  it('画册视图 (gallery) 正常调度渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="gallery"
        viewConfig={{ ...baseView, name: '工程画册', viewType: 'gallery' }}
      />
    );
    expect(html).toContain('工程画册');
    expect(html).toContain('DWG-001');
  });

  it('甘特视图 (gantt) 正常调度渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="gantt"
        viewConfig={{ ...baseView, name: '项目甘特', viewType: 'gantt' }}
      />
    );
    expect(html).toContain('甘特视图需要两个日期字段');
  });

  it('日历视图 (calendar) 正常调度渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="calendar"
        viewConfig={{ ...baseView, name: '排期日历', viewType: 'calendar' }}
      />
    );
    expect(html).toContain('今天');
  });

  it('表单视图 (form) 正常调度渲染', () => {
    const html = renderToStaticMarkup(
      <BitableTable
        columns={mockColumns}
        groupedData={groupedData}
        viewType="form"
        viewConfig={{ ...baseView, name: '表单视图', viewType: 'form' }}
      />
    );
    expect(html).toContain('表单视图');
  });
});

