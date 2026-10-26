import type { BitableColumnConfig, BitableViewConfig } from 'react-bitable';

/** 示例行：一个通用「研发迭代任务」表 */
export interface TaskRow extends Record<string, unknown> {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  owner: string;
  startDate: string;
  dueDate: string;
  progress: number;
  done: boolean;
  updatedAt: string;
}

export const TASK_STATUS = ['待开始', '进行中', '待评审', '已完成', '已阻塞'] as const;

const statusColor: Record<string, string> = {
  待开始: 'bg-slate-100 text-slate-600 border-slate-200',
  进行中: 'bg-blue-50 text-blue-700 border-blue-200',
  待评审: 'bg-amber-50 text-amber-700 border-amber-200',
  已完成: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  已阻塞: 'bg-rose-50 text-rose-700 border-rose-200'
};

const statusOptions = TASK_STATUS.map((s) => ({ label: s, value: s, color: statusColor[s] }));

export const defaultColumns: BitableColumnConfig<TaskRow>[] = [
  {
    id: 'code',
    label: '编号',
    type: 'text',
    width: '104px',
    visible: true,
    editable: true,
    isLocked: true,
    sortable: true,
    filterable: true,
    groupable: true,
    description: '任务主键，锁定后不可改名或删除'
  },
  {
    id: 'title',
    label: '任务标题',
    type: 'text',
    minWidth: '260px',
    visible: true,
    editable: true,
    required: true,
    sortable: true,
    filterable: true,
    groupable: true
  },
  {
    id: 'status',
    label: '状态',
    type: 'select',
    width: '112px',
    visible: true,
    editable: true,
    options: statusOptions,
    sortable: true,
    filterable: true,
    groupable: true
  },
  {
    id: 'priority',
    label: '优先级',
    type: 'badge',
    width: '92px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true,
    groupable: true
  },
  {
    id: 'owner',
    label: '负责人',
    type: 'text',
    width: '104px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true,
    groupable: true
  },
  {
    id: 'startDate',
    label: '开始日期',
    type: 'date',
    width: '128px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'dueDate',
    label: '截止日期',
    type: 'date',
    width: '128px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'progress',
    label: '进度(%)',
    type: 'number',
    width: '96px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'done',
    label: '已验收',
    type: 'boolean',
    width: '88px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'updatedAt',
    label: '更新时间',
    type: 'date',
    width: '128px',
    visible: true,
    editable: false,
    sortable: true,
    filterable: true
  }
];

const ALL_VISIBLE = defaultColumns.filter((c) => c.visible).map((c) => c.id);

export const initialTasks: TaskRow[] = [
  ['T-1001', '登录态改造：支持多端刷新', '进行中', 'P0', '林知远', '2026-10-08', '2026-10-24', 65, false, '2026-10-22'],
  ['T-1002', '多维表格字段配置面板', '进行中', 'P0', '周砚', '2026-10-06', '2026-10-26', 80, false, '2026-10-24'],
  ['T-1003', '看板视图拖拽换列', '待评审', 'P1', '许澈', '2026-10-09', '2026-10-23', 95, true, '2026-10-23'],
  ['T-1004', '甘特视图阶段泳道', '已完成', 'P1', '许澈', '2026-09-28', '2026-10-18', 100, true, '2026-10-18'],
  ['T-1005', '日历视图周起始日配置', '待开始', 'P2', '陈屿', '2026-10-28', '2026-11-06', 0, false, '2026-10-20'],
  ['T-1006', '条件染色规则弹层', '进行中', 'P1', '周砚', '2026-10-12', '2026-10-29', 45, false, '2026-10-25'],
  ['T-1007', '多级分组折叠性能优化', '已阻塞', 'P0', '林知远', '2026-10-02', '2026-10-21', 30, false, '2026-10-21'],
  ['T-1008', '表单视图必填校验', '待评审', 'P2', '陈屿', '2026-10-14', '2026-10-25', 90, false, '2026-10-24'],
  ['T-1009', '行内编辑键盘导航', '已完成', 'P1', '许澈', '2026-09-22', '2026-10-15', 100, true, '2026-10-15'],
  ['T-1010', '视图配置本地持久化', '进行中', 'P1', '周砚', '2026-10-10', '2026-10-30', 55, false, '2026-10-25'],
  ['T-1011', '父子记录层级展示', '待开始', 'P2', '林知远', '2026-11-02', '2026-11-14', 0, false, '2026-10-19'],
  ['T-1012', '导出清单与附件打包', '已完成', 'P2', '陈屿', '2026-09-18', '2026-10-10', 100, true, '2026-10-10']
].map(
  ([code, title, status, priority, owner, startDate, dueDate, progress, done, updatedAt]) =>
    ({
      id: code as string,
      code,
      title,
      status,
      priority,
      owner,
      startDate,
      dueDate,
      progress,
      done,
      updatedAt
    }) as TaskRow
);

const base = {
  filterLogic: 'AND' as const,
  filterRules: [],
  sortRules: [],
  groupByFieldId: null,
  groupRules: [],
  density: 'medium' as const,
  colorRules: [],
  visibleColumnIds: ALL_VISIBLE,
  columnOrder: ALL_VISIBLE
};

export const presetViews: BitableViewConfig[] = [
  { ...base, id: 'view-all', name: '全部任务', icon: 'grid_view', viewType: 'grid', scope: 'collaborative' },
  {
    ...base,
    id: 'view-kanban',
    name: '状态看板',
    icon: 'view_kanban',
    viewType: 'kanban',
    scope: 'collaborative',
    kanbanFieldId: 'status',
    cardTitleFieldId: 'title',
    cardFields: ['title', 'priority', 'owner', 'dueDate', 'progress'],
    sortRules: [{ id: 's-kanban', fieldId: 'priority', direction: 'asc' }]
  },
  {
    ...base,
    id: 'view-gallery',
    name: '卡片画册',
    icon: 'grid_on',
    viewType: 'gallery',
    scope: 'collaborative',
    cardTitleFieldId: 'title',
    cardFields: ['title', 'status', 'owner', 'dueDate', 'progress'],
    galleryCardSize: 'medium'
  },
  {
    ...base,
    id: 'view-gantt',
    name: '阶段甘特',
    icon: 'view_timeline',
    viewType: 'gantt',
    scope: 'collaborative',
    ganttStageFieldId: 'status'
  },
  {
    ...base,
    id: 'view-calendar',
    name: '截止日历',
    icon: 'calendar_month',
    viewType: 'calendar',
    scope: 'personal',
    calendarDateFieldId: 'dueDate',
    calendarWeekStart: 1,
    calendarShowWeekend: true
  },
  {
    ...base,
    id: 'view-form',
    name: '任务录入',
    icon: 'description',
    viewType: 'form',
    scope: 'collaborative',
    formFields: ['title', 'priority', 'owner', 'startDate', 'dueDate', 'status'],
    formRequiredFields: ['title', 'owner'],
    formSubmitText: '提交任务',
    formSuccessText: '任务已提交，等待排期',
    description: '对外收集任务用，只暴露填写字段'
  }
];
