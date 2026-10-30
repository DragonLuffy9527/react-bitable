import type { BitableColumnConfig, BitableViewConfig, BitableTableDef } from 'react-bitable';

/** 示例行：一个通用「研发迭代任务」表 */
export interface TaskRow extends Record<string, unknown> {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  rating?: number;
  budget?: number;
  owner: string;
  startDate: string;
  dueDate: string;
  progress: number;
  done: boolean;
  updatedAt: string;
  attachments?: { name: string; size?: string; url?: string }[];
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
    label: '完成进度',
    type: 'progress',
    width: '140px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'rating',
    label: '重要度',
    type: 'rating',
    width: '124px',
    visible: true,
    editable: true,
    sortable: true,
    filterable: true
  },
  {
    id: 'budget',
    label: '研发预算',
    type: 'currency',
    width: '130px',
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
  },
  {
    id: 'attachments',
    label: '交付物与设计稿',
    type: 'attachment',
    width: '160px',
    visible: true,
    editable: true,
    sortable: false,
    filterable: false
  },
  {
    id: 'memberLink',
    label: '关联成员',
    type: 'link',
    width: '140px',
    visible: true,
    editable: true,
    linkConfig: {
      targetTableId: 'members',
      targetFieldId: 'name',
      multiple: false
    },
    description: '跨表关联【团队成员】名册'
  },
  {
    id: 'memberDept',
    label: '成员部门',
    type: 'lookup',
    width: '130px',
    visible: true,
    editable: false,
    lookupConfig: {
      linkFieldId: 'memberLink',
      targetFieldId: 'dept',
      targetTableId: 'members'
    },
    description: '跨表 Lookup 自动带出所属部门'
  }
];

const ALL_VISIBLE = defaultColumns.filter((c) => c.visible).map((c) => c.id);

export const initialTasks: TaskRow[] = [
  ['T-1001', '登录态改造：支持多端刷新', '进行中', 'P0', 5, 28000, '林知远', '2026-10-08', '2026-10-24', 65, false, '2026-10-22', [{ name: 'auth-tokens-flow.pdf', size: '1.4MB' }], 'M-1'],
  ['T-1002', '多维表格字段配置面板', '进行中', 'P0', 5, 35000, '周砚', '2026-10-06', '2026-10-26', 80, false, '2026-10-24', [{ name: 'bitable-ui-specs.png', size: '2.8MB' }, { name: 'schema-v2.pdf', size: '420KB' }], 'M-2'],
  ['T-1003', '看板视图拖拽换列', '待评审', 'P1', 4, 16000, '许澈', '2026-10-09', '2026-10-23', 95, true, '2026-10-23', [{ name: 'kanban-workflow.pdf', size: '980KB' }], 'M-3'],
  ['T-1004', '甘特视图阶段泳道', '已完成', 'P1', 4, 22000, '许澈', '2026-09-28', '2026-10-18', 100, true, '2026-10-18', [{ name: 'gantt-pipeline.png', size: '3.1MB' }], 'M-3'],
  ['T-1005', '日历视图周起始日配置', '待开始', 'P2', 3, 8500, '陈屿', '2026-10-28', '2026-11-06', 0, false, '2026-10-20', undefined, 'M-4'],
  ['T-1006', '条件染色规则弹层', '进行中', 'P1', 4, 14000, '周砚', '2026-10-12', '2026-10-29', 45, false, '2026-10-25', [{ name: 'theme-palette.png', size: '850KB' }], 'M-2'],
  ['T-1007', '多级分组折叠性能优化', '已阻塞', 'P0', 5, 42000, '林知远', '2026-10-02', '2026-10-21', 30, false, '2026-10-21', undefined, 'M-1'],
  ['T-1008', '表单视图必填校验', '待评审', 'P2', 3, 9000, '陈屿', '2026-10-14', '2026-10-25', 90, false, '2026-10-24', [{ name: 'form-validation-rule.pdf', size: '640KB' }], 'M-4'],
  ['T-1009', '行内编辑键盘导航', '已完成', 'P1', 4, 18000, '许澈', '2026-09-22', '2026-10-15', 100, true, '2026-10-15', undefined, 'M-3'],
  ['T-1010', '视图配置本地持久化', '进行中', 'P1', 4, 12500, '周砚', '2026-10-10', '2026-10-30', 55, false, '2026-10-25', [{ name: 'storage-model.pdf', size: '520KB' }], 'M-2'],
  ['T-1011', '父子记录层级展示', '待开始', 'P2', 2, 7000, '林知远', '2026-11-02', '2026-11-14', 0, false, '2026-10-19', undefined, 'M-1'],
  ['T-1012', '导出清单与附件打包', '已完成', 'P2', 3, 11000, '陈屿', '2026-09-18', '2026-10-10', 100, true, '2026-10-10', [{ name: 'export-pipeline.pdf', size: '1.2MB' }], 'M-4'],
  ['T-1013', '【里程碑】架构评审基线发布', '已完成', 'P0', 5, 0, '林知远', '2026-10-15', '2026-10-15', 100, true, '2026-10-15', [{ name: 'v1.0-architecture-spec.pdf', size: '4.6MB' }], 'M-1'],
  ['T-1014', '【里程碑】开源首发全功能封板', '待评审', 'P0', 5, 0, '周砚', '2026-10-31', '2026-10-31', 90, false, '2026-10-25', [{ name: 'release-checklist.pdf', size: '360KB' }], 'M-2']
].map(
  ([code, title, status, priority, rating, budget, owner, startDate, dueDate, progress, done, updatedAt, attachments, memberLink]) =>
    ({
      id: code as string,
      code,
      title,
      status,
      priority,
      rating,
      budget,
      owner,
      startDate,
      dueDate,
      progress,
      done,
      updatedAt,
      attachments,
      memberLink
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
    cardFields: ['title', 'priority', 'rating', 'budget', 'owner', 'dueDate', 'progress'],
    sortRules: [{ id: 's-kanban', fieldId: 'priority', direction: 'asc' }]
  },
  {
    ...base,
    id: 'view-gallery',
    name: '卡片画册',
    icon: 'grid_on',
    viewType: 'gallery',
    scope: 'collaborative',
    galleryCoverFieldId: 'attachments',
    cardTitleFieldId: 'title',
    cardFields: ['title', 'status', 'rating', 'budget', 'owner', 'dueDate', 'progress'],
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

/** 示例缺陷表 */
export const bugColumns: BitableColumnConfig<any>[] = [
  { id: 'bugId', label: '缺陷编号', type: 'text', width: '100px', visible: true, isLocked: true },
  { id: 'desc', label: '缺陷描述', type: 'text', minWidth: '240px', visible: true, editable: true, required: true },
  {
    id: 'severity',
    label: '严重级别',
    type: 'select',
    width: '110px',
    visible: true,
    editable: true,
    options: [
      { label: '致命 P0', value: 'P0', color: 'bg-rose-50 text-rose-700 border-rose-200' },
      { label: '严重 P1', value: 'P1', color: 'bg-orange-50 text-orange-700 border-orange-200' },
      { label: '一般 P2', value: 'P2', color: 'bg-amber-50 text-amber-700 border-amber-200' },
      { label: '轻微 P3', value: 'P3', color: 'bg-slate-100 text-slate-700 border-slate-200' }
    ]
  },
  {
    id: 'status',
    label: '修复状态',
    type: 'select',
    width: '110px',
    visible: true,
    editable: true,
    options: [
      { label: '待修复', value: '待修复', color: 'bg-rose-50 text-rose-700 border-rose-200' },
      { label: '修复中', value: '修复中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: '待验证', value: '待验证', color: 'bg-purple-50 text-purple-700 border-purple-200' },
      { label: '已关闭', value: '已关闭', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    ]
  },
  { id: 'assignee', label: '经办人', type: 'text', width: '100px', visible: true, editable: true },
  { id: 'createdAt', label: '发现日期', type: 'date', width: '130px', visible: true, editable: true }
];

export const initialBugs = [
  { id: 'B-01', bugId: 'BUG-101', desc: '虚拟滚动跨行选择时锚点偏移', severity: 'P1', status: '修复中', assignee: '林知远', createdAt: '2026-10-26' },
  { id: 'B-02', bugId: 'BUG-102', desc: '粘贴 5000 行大表格时主线程卡顿', severity: 'P0', status: '待修复', assignee: '周砚', createdAt: '2026-10-27' },
  { id: 'B-03', bugId: 'BUG-103', desc: 'Safari 浏览器下斜杠日期解析为 NaN', severity: 'P1', status: '已关闭', assignee: '许澈', createdAt: '2026-10-24' },
  { id: 'B-04', bugId: 'BUG-104', desc: '黑暗模式下多选标签文字对比度不足', severity: 'P3', status: '待验证', assignee: '陈屿', createdAt: '2026-10-28' }
];

export const bugViews: BitableViewConfig[] = [
  {
    id: 'bug-all',
    name: '缺陷列表',
    icon: 'grid_view',
    viewType: 'grid',
    scope: 'collaborative',
    filterLogic: 'AND',
    filterRules: [],
    sortRules: [{ id: 's1', fieldId: 'severity', direction: 'asc' }],
    groupByFieldId: null,
    density: 'medium',
    colorRules: [],
    visibleColumnIds: ['bugId', 'desc', 'severity', 'status', 'assignee', 'createdAt'],
    columnOrder: ['bugId', 'desc', 'severity', 'status', 'assignee', 'createdAt']
  },
  {
    id: 'bug-kanban',
    name: '修复看板',
    icon: 'view_kanban',
    viewType: 'kanban',
    scope: 'collaborative',
    filterLogic: 'AND',
    filterRules: [],
    sortRules: [],
    groupByFieldId: null,
    kanbanFieldId: 'status',
    density: 'medium',
    colorRules: [],
    visibleColumnIds: ['bugId', 'desc', 'severity', 'status', 'assignee', 'createdAt'],
    columnOrder: ['bugId', 'desc', 'severity', 'status', 'assignee', 'createdAt']
  }
];

/** 示例成员表 */
export const memberColumns: BitableColumnConfig<any>[] = [
  { id: 'name', label: '姓名', type: 'text', width: '120px', visible: true, editable: true, required: true },
  { id: 'role', label: '职位/角色', type: 'text', width: '140px', visible: true, editable: true },
  {
    id: 'dept',
    label: '所属部门',
    type: 'select',
    width: '120px',
    visible: true,
    editable: true,
    options: [
      { label: '前端架构组', value: '前端架构组', color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: '多维表引擎组', value: '多维表引擎组', color: 'bg-purple-50 text-purple-700 border-purple-200' },
      { label: '体验设计组', value: '体验设计组', color: 'bg-amber-50 text-amber-700 border-amber-200' }
    ]
  },
  { id: 'email', label: '工作邮箱', type: 'email', minWidth: '220px', visible: true, editable: true },
  { id: 'phone', label: '联系电话', type: 'phone', width: '140px', visible: true, editable: true },
  { id: 'joinDate', label: '入职日期', type: 'date', width: '130px', visible: true, editable: true }
];

export const initialMembers = [
  { id: 'M-1', name: '林知远', role: '前端架构师 / 负责人', dept: '前端架构组', email: 'zhiyuan.lin@cscec.design', phone: '13800138001', joinDate: '2024-03-15' },
  { id: 'M-2', name: '周砚', role: '高级研发工程师', dept: '多维表引擎组', email: 'yan.zhou@cscec.design', phone: '13800138002', joinDate: '2024-07-01' },
  { id: 'M-3', name: '许澈', role: '核心算法工程师', dept: '多维表引擎组', email: 'che.xu@cscec.design', phone: '13800138003', joinDate: '2025-02-18' },
  { id: 'M-4', name: '陈屿', role: '资深 UI/UX 设计师', dept: '体验设计组', email: 'yu.chen@cscec.design', phone: '13800138004', joinDate: '2024-05-10' }
];

export const memberViews: BitableViewConfig[] = [
  {
    id: 'mem-all',
    name: '成员名册',
    icon: 'grid_view',
    viewType: 'grid',
    scope: 'collaborative',
    filterLogic: 'AND',
    filterRules: [],
    sortRules: [],
    groupByFieldId: null,
    density: 'medium',
    colorRules: [],
    visibleColumnIds: ['name', 'role', 'dept', 'email', 'phone', 'joinDate'],
    columnOrder: ['name', 'role', 'dept', 'email', 'phone', 'joinDate']
  }
];

export const presetTables: BitableTableDef[] = [
  {
    id: 'tasks',
    label: '研发任务',
    icon: 'task_alt',
    description: '核心研发任务迭代与进度跟踪',
    initialData: initialTasks,
    defaultColumns,
    presetViews,
    schemaVersion: 'demo-tasks-1'
  },
  {
    id: 'bugs',
    label: '缺陷追踪',
    icon: 'bug_report',
    description: '线上与测试环境 Bug 归档与跟进',
    initialData: initialBugs,
    defaultColumns: bugColumns,
    presetViews: bugViews,
    schemaVersion: 'demo-bugs-1'
  },
  {
    id: 'members',
    label: '团队成员',
    icon: 'people',
    description: '项目研发团队花名册与职责',
    initialData: initialMembers,
    defaultColumns: memberColumns,
    presetViews: memberViews,
    schemaVersion: 'demo-members-1'
  }
];
