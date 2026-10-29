/**
 * react-bitable —— 类飞书多维表格的 React 组件库
 *
 * 一个 hook（useBitable）负责状态与持久化，一套受控组件负责视图渲染：
 * 表格 / 看板 / 画册 / 甘特 / 日历 / 表单 六种视图共享同一份数据与视图配置。
 *
 * 本文件是唯一推荐的公共入口；内部实现可能随次版本重构，不建议深链引用。
 */

// —— 类型与常量 ——
export * from './types';

// —— 状态中枢 ——
export { useBitable, SELECT_OPTION_PALETTE } from './useBitable';

// —— 卡片模型（看板 / 画册 / 甘特共用） ——
export {
  buildCardModel,
  getFieldText,
  resolveCardFields,
  pickStatusColumn,
  pickDateColumn,
  formatTag,
  personFieldLabel
} from './cardModel';
export type { CardField, CardModel, CardModelOptions } from './cardModel';

// —— 单元格取值 / 选项解析（纯函数，可脱离组件使用） ——
export {
  toValueList,
  firstValue,
  findOption,
  FALLBACK_OPTION_COLOR,
  resolveOptionList,
  normalizeUrl,
  displayUrl,
  initialsOf,
  isMultiValueType
} from './cellValue';

// —— 拖拽填充计划（Excel 式下拉，纯函数） ——
export {
  isFillableFieldType,
  incrementTrailingNumber,
  addDaysToDateText,
  incrementValue,
  buildFillPlan
} from './fillSeries';
export type { BitableFillUpdate, BuildFillPlanOptions } from './fillSeries';

// —— 主视图容器（内部按 viewType 分发到 6 种视图） ——
export { BitableTable } from './BitableTable';

// —— 视图类型 ——
export { BitableKanbanView } from './BitableKanbanView';
export { BitableGalleryView } from './BitableGalleryView';
export { BitableGanttView } from './BitableGanttView';
export { BitableCalendarView } from './BitableCalendarView';
export { BitableFormView } from './BitableFormView';

// —— 外壳：视图页签 / 工具栏 ——
export { BitableViewTabs } from './BitableViewTabs';
export { BitableToolbar } from './BitableToolbar';

// —— 单元格编辑器 ——
export { EditableCell } from './EditableCell';

// —— 配置弹层 ——
export { BitableFieldConfigPopover } from './BitableFieldConfigPopover';
export { BitableFilterPopover } from './BitableFilterPopover';
export { BitableSortPopover } from './BitableSortPopover';
export { BitableGroupPopover } from './BitableGroupPopover';
export { BitableColorRulePopover, businessColorSwatches, colorMatrixPalette } from './BitableColorRulePopover';
export { BitableDensityPopover } from './BitableDensityPopover';
export { BitableViewConfigPopover } from './BitableViewConfigPopover';
