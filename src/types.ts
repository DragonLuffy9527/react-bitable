export type BitableFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'date'
  | 'badge'
  | 'boolean'
  | 'url'
  | 'user'
  | 'group'
  | 'attachment'
  | 'action';

/**
 * 字段类型元数据。label 为 UI 展示名，key 为持久化标识——**只改 label，不要改 key**。
 *
 * 顺序对齐飞书多维表的「常规」分组（本平台暂不提供「公式」与「查找引用」：
 * 两者都需要后端解析引擎，纯前端 SPA 无法真实求值，只能做假数据，故不引入）。
 * `badge` / `action` 是本平台扩展：前者用于彩色状态徽标，后者是后台程序参与计算匹配的只读列。
 */
export const BITABLE_FIELD_TYPE_META: Record<
  BitableFieldType,
  { label: string; icon: string; desc: string; color: string }
> = {
  text: { label: '文本', icon: 'short_text', desc: '常规文本输入与显示', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  select: { label: '单选', icon: 'radio_button_checked', desc: '预设候选项，单选枚举', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  multiSelect: { label: '多选', icon: 'checklist', desc: '预设候选项，可多值叠加', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  user: { label: '人员', icon: 'person', desc: '责任人 / 参与人，可多人', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  group: { label: '群组', icon: 'groups', desc: '部门 / 协作群组', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  date: { label: '日期', icon: 'calendar_today', desc: '年月日日期选择', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  attachment: { label: '附件', icon: 'attach_file', desc: 'PDF / 图片等附件文件', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  number: { label: '数字', icon: 'pin', desc: '数值、工程量、尺寸', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  boolean: { label: '复选框', icon: 'check_box', desc: '是/否、完成/未完成', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  url: { label: '超链接', icon: 'link', desc: '网址 / 云盘 / 二维码链接', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  badge: { label: '状态标签', icon: 'label', desc: '彩色胶囊状态徽标', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  action: {
    label: '后台字段',
    icon: 'dns',
    desc: '后台程序计算匹配，前端不可修改',
    color: 'text-slate-600 bg-slate-100 border-slate-200'
  }
};

export type BitableDensity = 'compact' | 'medium' | 'relaxed';

export interface BitableSelectOption {
  label: string;
  value: string;
  color?: string; // e.g. 'bg-blue-50 text-blue-700 border-blue-200'
}

export interface BitableColumnConfig<T = any> {
  id: string; // 字段key，例如 'code', 'title', 'discipline'
  label: string; // 显示表头文字
  type: BitableFieldType;
  width?: string; // tailwind width class or px
  minWidth?: string;
  visible: boolean; // 是否在表格中显示
  editable?: boolean; // 是否允许行内编辑
  isLocked?: boolean; // 是否锁定字段（锁定后受控只读，禁止编辑、重命名与删除）
  isFrozen?: boolean; // 是否冻结列（固定在表格左侧，横向滚动时不移出可视区）
  required?: boolean;
  options?: BitableSelectOption[]; // select 类型的备选值
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  description?: string;
  isCustom?: boolean; // 是否为用户自定义添加的字段
  // 自定义渲染函数（可选）
  render?: (row: T, value: any, onUpdate?: (val: any) => void) => React.ReactNode;
  /**
   * 附件来源解析（可选）。
   * 用于「附件不在本行字段上」的场景——例如技术文件台账的附件其实挂在关联图纸上，
   * 画册视图/附件列通过它拿到文件列表，而不是去读 row[col.id]。
   */
  resolveFiles?: (row: T) => { name: string; size?: string; url?: string }[];
}

export type FilterOperator = 
  | 'contains' 
  | 'not_contains' 
  | 'equals' 
  | 'not_equals' 
  | 'starts_with' 
  | 'is_empty' 
  | 'is_not_empty';

export interface BitableFilterRule {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
}

export interface BitableSortRule {
  id: string;
  fieldId: string;
  direction: 'asc' | 'desc';
}

export type BitableViewType = 'grid' | 'kanban' | 'gallery' | 'gantt' | 'calendar' | 'form';

export type BitableViewScope = 'collaborative' | 'personal';

export interface BitableGroupRule {
  id: string;
  fieldId: string;
  direction?: 'asc' | 'desc'; // 升序(默认) / 降序
}

export interface BitableGroupSection<T = any> {
  groupKey: string; // 唯一分组路径键，例如 "site:kai-tak__discipline:ARCH"
  parentKey?: string; // 父级分组键
  fieldId: string; // 当前分组字段
  fieldLabel: string; // 字段显示名
  groupValue: string; // 分组值，如 "建筑/ARCH"
  groupTitle: string; // 分组显示标题
  level: number; // 嵌套层级: 0 为顶层，1 为二级...
  direction: 'asc' | 'desc';
  items: T[]; // 属于该分支的所有数据项
  isLeaf: boolean; // 是否为最底层（叶子分组直接包含数据行）
}

export interface BitableColorRule {
  id: string;
  fieldId: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'notEmpty' | 'empty';
  value: string;
  bgClass?: string; // tailwind css
  textClass?: string;
  bgColor?: string; // 十六进制或 CSS 背景色，如 '#fef2f2'
  textColor?: string; // 十六进制或 CSS 字体色，如 '#b91c1c'
  borderColor?: string; // 十六进制边框色
  colorName?: string; // 色号名称
  scope: 'cell' | 'row';
  targetFieldId?: string; // 选填：染色目标字段（默认为匹配字段本身）
}

export interface BitableViewConfig {
  id: string;
  name: string;
  icon?: string;
  viewType?: BitableViewType; // grid(表格) | kanban(看板) | gallery(画册) | gantt(甘特) | calendar(日历) | form(表单)
  scope?: BitableViewScope; // 'collaborative' (协作视图) | 'personal' (个人视图)
  isLocked?: boolean; // 锁定视图配置，防止被协作者误修改
  pinned?: boolean; // 固定标签卡：不可删除/重命名
  description?: string; // 视图说明
  filterLogic: 'AND' | 'OR';
  filterRules: BitableFilterRule[];
  sortRules: BitableSortRule[];
  groupByFieldId: string | null; // 兼容旧版单一分组
  groupRules?: BitableGroupRule[]; // 飞书多级分组规则
  density: BitableDensity;
  colorRules: BitableColorRule[];
  visibleColumnIds: string[];
  columnOrder: string[];
  hiddenFieldIds?: string[]; // 视图级隐藏字段：仅当前视图不显示这些列，其他视图不受影响（飞书式字段显隐）
  // —— 父子记录（对齐飞书多维表，表格视图生效） ——
  parentChildEnabled?: boolean; // 开启后按「父级字段」建立行层级，父行可展开/折叠
  parentFieldId?: string | null; // 父级字段：其值填写父记录的主键值（如图号），留空即为顶层记录
  // —— 视图类型专属配置（新建视图时选定类型后，配置面板按类型显示对应项） ——
  kanbanFieldId?: string | null; // 看板：泳道分组字段（默认自动识别 状态/专业）
  galleryCoverFieldId?: string | null; // 画册：封面字段（默认蓝图占位）
  ganttStageFieldId?: string | null; // 甘特：阶段/版次字段（默认 REV 五阶段）
  calendarDateFieldId?: string | null; // 日历：日期字段（默认 updatedAt/date/timestamp）
  formSubmitText?: string; // 表单：提交按钮文案
  formFields?: string[]; // 表单：展示字段（空=全部可见字段）
  // —— 卡片配置（看板 / 画册 / 甘特共用，对齐飞书的「卡片配置」） ——
  cardTitleFieldId?: string | null; // 卡片标题字段（默认主字段）
  cardFields?: string[]; // 卡片上显示的字段 id（空=按列顺序自动取）
  galleryCardSize?: 'small' | 'medium' | 'large'; // 画册：卡片大小
  // —— 日历排布 ——
  calendarWeekStart?: 0 | 1; // 0=周日为每周第一天 1=周一（默认）
  calendarShowWeekend?: boolean; // 是否显示周六/周日（默认显示）
  // —— 表单 ——
  formRequiredFields?: string[]; // 必填字段 id（空=前两个字段）
  formSuccessText?: string; // 提交成功提示
}
