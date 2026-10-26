/**
 * react-bitable —— 类飞书多维表格的 React 组件库
 *
 * 一个 hook（useBitable）负责状态与持久化，一套受控组件负责视图渲染：
 * 表格 / 看板 / 画册 / 甘特 / 日历 / 表单 六种视图共享同一份数据与视图配置。
 */

// —— 类型与常量 ——
export * from './types';

// —— 状态中枢 ——
export { useBitable } from './useBitable';

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
