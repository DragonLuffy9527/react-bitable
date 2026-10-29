# react-bitable

[![CI](https://github.com/DragonLuffy9527/react-bitable/actions/workflows/ci.yml/badge.svg)](https://github.com/DragonLuffy9527/react-bitable/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-005BAC.svg)](LICENSE)
[![React 18+](https://img.shields.io/badge/react-18%20%7C%2019-005BAC.svg)](package.json)

> 类飞书多维表格的 React 组件库。一份数据，六种视图，零后端。

![表格视图](docs/screenshots/grid.png)

| 看板视图 | 甘特视图 |
| --- | --- |
| ![看板](docs/screenshots/kanban.png) | ![甘特](docs/screenshots/gantt.png) |

| 画册视图 | 日历 / 表单 |
| --- | --- |
| ![画册](docs/screenshots/gallery.png) | 见 `npm run dev` 的 playground |


一个不依赖任何 UI 框架之外东西的 **多维表格引擎**：一个 `useBitable` hook 管状态与持久化，一套受控组件管渲染。
字段配置、筛选、排序、多级分组、条件染色、行内编辑、父子记录、六种视图切换 —— 全部开箱可用，
配置与数据自动落 `localStorage`。

- **纯客户端**：没有后端、没有数据库、没有鉴权，`npm run dev` 立刻能看效果
- **受控组件**：所有写操作通过回调交还给你，想接 API / IndexedDB / 协作后端都行
- **Tailwind 驱动**：外观 100% 由 utility class 描述，不进 CSS-in-JS，主题用 CSS 变量覆盖
- **TypeScript**：`BitableColumnConfig<T>` 泛型贯穿，字段 id 与行类型对齐

---

## 特性

| 能力 | 说明 |
| --- | --- |
| 六种视图 | 表格 grid / 看板 kanban / 画册 gallery / 甘特 gantt / 日历 calendar / 表单 form，共用同一份视图配置 |
| 字段配置 | 7 种字段类型、增删改、重命名、拖拽排序、调列宽、锁定（受控只读）、冻结列、视图级显隐 |
| 筛选 / 排序 | AND / OR 多条件筛选，7 种操作符；多字段排序 |
| 多级分组 | 飞书式嵌套分组，可逐级折叠、全部折叠 |
| 条件染色 | 单元格 / 整行染色，规则命中即生效，支持取色盘与业务色板 |
| 行内编辑 | 单元格点开即改，回车保存、Esc 取消、Tab 走格 |
| 父子记录 | 拖行首方块建立层级，父行可展开折叠 |
| 视图管理 | 新建 / 重命名 / 复制 / 删除 / 重置，协作视图与个人视图隔离，可锁定 |
| 撤销重做 | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y，批量写入只记一步；勾选集也能一起回退 |
| 拖拽填充 | 单元格右下角手柄下拉，Excel 式：数字递增、日期顺延、文本尾号递增 |
| 批量更新 | `updateCells` 一次 `setData` 写多格，只产生一步撤销 |
| 持久化 | 数据、列、视图、当前视图、schema 版本全部落 `localStorage`，刷新不丢 |
| SSR 安全 | 无 `localStorage` 环境自动降级为内存存储，不抛异常 |

---

## 快速开始

```bash
git clone https://github.com/DragonLuffy9527/react-bitable.git
cd react-bitable
npm install
npm run dev          # playground 跑在 http://localhost:5173
```

想看构建产物：

```bash
npm run build        # dist/index.js + dist/index.d.ts
npm run build:demo   # demo 静态站点
npm run typecheck    # tsc --noEmit
```

### 接进你自己的项目

库本体零 runtime 依赖（除 React），但从仓库安装需要先构建：

```bash
npm run build
npm pack             # 产出 react-bitable-0.1.0.tgz
# 然后在你的项目里
npm install /path/to/react-bitable-0.1.0.tgz
```

样式需要 Tailwind CSS v4：

```css
/* 你的全局 css */
@import 'tailwindcss';
@import 'react-bitable/styles.css';
```

> 用 Tailwind v3 也可以，把 `react-bitable/styles.css` 单独 import 进来，
> 并确保 `content` 覆盖 `node_modules/react-bitable/dist/*.js`。

### 最小示例

```tsx
import { useBitable, BitableViewTabs, BitableToolbar, BitableTable } from 'react-bitable';
import type { BitableColumnConfig, BitableViewConfig } from 'react-bitable';

interface Task {
  id: string;
  title: string;
  status: string;
  owner: string;
  dueDate: string;
}

const defaultColumns: BitableColumnConfig<Task>[] = [
  { id: 'title', label: '任务', type: 'text', minWidth: '260px', visible: true, editable: true },
  {
    id: 'status',
    label: '状态',
    type: 'select',
    width: '112px',
    visible: true,
    editable: true,
    options: [
      { label: '进行中', value: '进行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: '已完成', value: '已完成', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    ]
  },
  { id: 'owner', label: '负责人', type: 'text', width: '104px', visible: true, editable: true },
  { id: 'dueDate', label: '截止', type: 'date', width: '128px', visible: true, editable: true }
];

const presetViews: BitableViewConfig[] = [
  {
    id: 'view-all',
    name: '全部任务',
    icon: 'grid_view',
    viewType: 'grid',
    filterLogic: 'AND',
    filterRules: [],
    sortRules: [],
    groupByFieldId: null,
    density: 'medium',
    colorRules: [],
    visibleColumnIds: defaultColumns.map((c) => c.id),
    columnOrder: defaultColumns.map((c) => c.id)
  }
];

export function TaskTable() {
  const bt = useBitable<Task>({
    storageKey: 'my-task-table',
    initialData: [],
    defaultColumns,
    presetViews
  });

  return (
    <>
      <BitableViewTabs
        views={bt.views}
        activeViewId={bt.activeViewId}
        onSelectView={bt.handleSelectView}
        onCreateView={bt.handleCreateView}
        onDeleteView={bt.handleDeleteView}
      />
      <BitableToolbar
        columns={bt.columns}
        activeView={bt.activeView}
        searchQuery={bt.searchQuery}
        onSearchChange={bt.setSearchQuery}
        onAddRecord={() => bt.addRow()}
        onToggleColumnVisibility={bt.toggleColumnVisibility}
        onMoveColumn={bt.moveColumn}
        onAddCustomColumn={bt.addCustomColumn}
        onUpdateFilterRules={bt.setFilterRules}
        onUpdateFilterLogic={bt.setFilterLogic}
        onUpdateSortRules={bt.setSortRules}
        onSelectDensity={bt.setDensity}
        onUpdateColorRules={bt.setColorRules}
      />
      <BitableTable
        columns={bt.columns}
        groupedData={bt.groupedData}
        viewType={bt.activeView.viewType}
        viewConfig={bt.activeView}
        checkedIds={{}}
        onToggleCheck={() => {}}
        onToggleSelectAll={() => {}}
        density={bt.activeView.density}
        colorRules={bt.activeView.colorRules}
        onUpdateCell={bt.updateCell}
        onDeleteRow={bt.deleteRow}
      />
    </>
  );
}
```

完整可运行版本见 [`playground/DemoApp.tsx`](playground/DemoApp.tsx)。

---

## API

### `useBitable<T>(options)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `storageKey` | `string` | `localStorage` 命名空间前缀。**变化时整体重置**，多账套 / 多项目切换靠它 |
| `initialData` | `T[]` | 初始行数据。挂载后新增的 id 会增量并入，已删除的不会被补回 |
| `defaultColumns` | `BitableColumnConfig<T>[]` | 字段定义，列配置的唯一真源 |
| `presetViews` | `BitableViewConfig[]` | 预设视图，第一个视为主视图（不可删除） |
| `onDataChange?` | `(data: T[]) => void` | 数据变更回调，接后端时在这里发请求 |
| `schemaVersion?` | `string` | 字段表结构版本号。改字段定义后调大它，旧列配置会重置 |
| `onHistoryToast?` | `(message: string) => void` | 撤销 / 重做执行后的即时反馈，接到你自己的 toast |
| `selectionState?` | `{ checkedIds, setCheckedIds }` | 把页面的勾选集注册进撤销历史，Excel 式多选可被 Ctrl+Z 撤销 |

返回值按用途分五组：

```ts
// 状态
data, processedData, groupedData, columns, viewColumns, visibleColumns,
views, activeView, activeViewId, isMasterView,
collapsedGroups, isAllGroupsCollapsed, searchQuery,
primaryFieldId, parentFieldId

// 视图
handleSelectView, handleCreateView, handleDeleteView, renameView, duplicateView,
resetActiveView, updateViewConfig, setViewType, setViewScope, toggleViewLock

// 字段
toggleColumnVisibility, moveColumn, moveColumnById, addCustomColumn, deleteColumn,
toggleColumnLock, toggleColumnFreeze, updateColumnType, updateColumnConfig,
resetColumns, renameColumn, resizeColumn

// 数据
updateCell, updateCells, addRow, deleteRow, deleteRows, insertRow, duplicateRow,
detachRow, moveRow

// 撤销重做
undo, redo, canUndo, canRedo, undoLabel, redoLabel

// 视图配置
setFilterRules, setFilterLogic, setSortRules, setGroupByFieldId, setGroupRules,
setDensity, setColorRules, setSearchQuery,
toggleGroupCollapse, toggleAllGroupsCollapse
```

> **`columns` 还是 `viewColumns`？**
> `columns` 是字段全量定义；`viewColumns` 是「当前视图生效」的列——被当前视图
> `hiddenFieldIds` 命中的列会被覆盖成 `visible: false`。渲染层请一律传 `viewColumns`，
> 这样字段显隐才是**视图粒度**的（不同视图互不影响）。
>
> **批量写入用 `updateCells`**：一次调用只产生一步撤销记录；循环调 `updateCell`
> 会变成 N 步撤销，也会触发 N 次保存反馈。

### 组件

| 组件 | 作用 |
| --- | --- |
| `BitableTable` | 主容器。按 `viewType` 分发到 6 种视图，处理行选择、勾选、右键菜单、拖拽、父子层级 |
| `BitableViewTabs` | 视图页签栏：切换 / 新建 / 复制 / 删除 / 重命名 / 锁定 / 协作与个人视图切换 |
| `BitableToolbar` | 工具栏：添加记录、批量删除、字段配置、筛选、分组、排序、密度、染色、搜索、`extraActions` 插槽 |
| `BitableKanbanView` / `GalleryView` / `GanttView` / `CalendarView` / `FormView` | 各视图实现，一般不用直接引 |
| `EditableCell` | 单元格编辑器，按字段类型分发到 input / select / date / checkbox |
| `Bitable*Popover` | 字段、筛选、排序、分组、密度、染色、视图配置弹层 |

`extraActions` 用来把业务按钮挂到工具栏右侧；按钮文字包一层 `.tb-label` 后，
窄屏三档自适应（full / compact / ultra）会自动把文字折叠成图标。

几个容易漏接的 props：

| prop | 作用 |
| --- | --- |
| `onFillCells(updates)` | 拖拽填充（单元格右下角手柄下拉）的批量写入回调。不接会退化成逐格 `onUpdateCell`，产生 N 次保存反馈 |
| `onSelectRows(ids)` | Shift+点击范围选择回传的行集合，页面把勾选集整体替换为这批行 |
| `isLockProtectedColumn(id)` | 命中的已锁定列视为「后端固定字段」：锁图标显示红色且不可解锁 |
| `fillHeight` | 撑满父容器高度（父级需为确定高度的 flex 列），多台账页统一传 `true` 才能对齐底边 |
| `onOpenAttachment(row)` | 画册视图封面点「预览附件」时回传该行，由页面接到自己的附件查看器 |

### 纯函数工具

不依赖组件、可单独 import 使用：

| 导出 | 用途 |
| --- | --- |
| `toValueList` / `firstValue` | 单元格原始值 → 字符串数组 / 首个值（统一处理多值字段） |
| `findOption` / `resolveOptionList` / `FALLBACK_OPTION_COLOR` | 选项解析与缺省配色 |
| `normalizeUrl` / `displayUrl` / `initialsOf` / `isMultiValueType` | 链接规范化、头像首字母、多值类型判定 |
| `buildFillPlan` / `isFillableFieldType` | 拖拽填充计划：给定源区域与目标区域，算出 `{ rowId, fieldId, value }[]`（数字递增、日期顺延、文本尾号递增） |
| `incrementValue` / `incrementTrailingNumber` / `addDaysToDateText` | 填充用到的单步递增原子函数 |
| `buildCardModel` / `resolveCardFields` / `getFieldText` | 看板 / 画册 / 甘特的卡片模型 |
| `pickStatusColumn` / `pickDateColumn` / `formatTag` / `personFieldLabel` | 卡片取字段的启发式规则 |
| `SELECT_OPTION_PALETTE` | 新建选项时的取色盘 |

### 字段类型

`text` · `number` · `select` · `date` · `badge` · `boolean` · `action`

`BitableColumnConfig` 里几个值得注意的字段：

| 字段 | 说明 |
| --- | --- |
| `isLocked` | 锁定字段：禁止编辑、重命名、删除（主字段通常锁死） |
| `isFrozen` | 冻结列：横向滚动时固定在左侧 |
| `render(row, value, onUpdate?)` | 自定义渲染，接管该列的格子内容 |
| `resolveFiles(row)` | 附件列的文件来源。附件不在本行字段上时用它（如挂在关联记录上） |

---

## 持久化

`storageKey` 会展开成这些键：

```
{storageKey}_data           行数据
{storageKey}_columns        列配置（含自定义列、宽度、锁定）
{storageKey}_views          视图数组
{storageKey}_active_view_id 当前视图
{storageKey}_deleted_col_ids 被删掉的系统字段 id（防止重置时复活）
{storageKey}_schema_version 字段表结构版本号
```

切换 `storageKey`（多项目 / 多账套）时 hook 会整体重置内部状态，不会串数据。
接后端时把 `onDataChange` 接到 PATCH 接口即可，读的时候用接口结果做 `initialData`。

---

## 主题

默认主色是 `#005BAC`。改主题在 `:root` 覆盖变量：

```css
:root {
  --bitable-primary: #7c3aed;
  --bitable-primary-hover: #6d28d9;
  --bitable-primary-light: #f5f3ff;
  --bitable-primary-border: #ddd6fe;
}
```

> 组件内部仍有个别位置硬编码了 `#005BAC`（主要在图标的 hover 态与数字徽标）。
> 换主题时若发现残留，直接全局搜 `005BAC` 替换。

## 图标字体

组件用 Google **Material Symbols Outlined** 渲染图标。页面里需要引入字体，否则图标会显示成文字：

```html
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
  rel="stylesheet"
/>
```

内网 / 离线环境请把字体文件自托管，或在 `EditableCell` / `BitableToolbar` 里把 `<span className="material-symbols-outlined">` 换成你自己的 icon 组件。

---

## 目录结构

```
src/
├── index.ts                     统一出口
├── styles.css                   行为样式 + CSS 变量主题
├── types.ts                     字段 / 视图 / 筛选 / 染色 全部类型
├── useBitable.ts                状态中枢：持久化、筛选排序分组、撤销重做、所有写操作
├── cardModel.ts                 看板 / 画册 / 甘特共用的卡片模型
├── cellValue.ts                 单元格取值与选项解析（纯函数）
├── fillSeries.ts                拖拽填充计划（纯函数）
├── BitableTable.tsx             主容器 + 表格视图 + 父子记录 + 拖拽
├── BitableViewTabs.tsx          视图页签
├── BitableToolbar.tsx           工具栏（窄屏三档自适应）
├── BitableKanbanView.tsx        看板
├── BitableGalleryView.tsx       画册
├── BitableGanttView.tsx         甘特
├── BitableCalendarView.tsx      日历
├── BitableFormView.tsx          表单
├── EditableCell.tsx             单元格编辑器
└── Bitable*Popover.tsx          各类配置弹层
playground/                      demo（npm run dev）
```

---

## 已知限制

- **仅客户端**：持久化走 `localStorage`，多标签页 / 多人协作需要自己接后端。SSR 下会自动降级为内存存储（可用但不持久）。
- **无虚拟滚动**：万行级数据会卡，需要自己做窗口化。
- **`any` 未收干净**：`BitableColumnConfig<T = any>` 等位置保留了 `any`，泛型收紧要逐步做。
- **无测试**：仓库目前没有单元测试，靠 playground 手工回归。
- **图标依赖 Google Fonts**：离线环境需自托管字体。

## Roadmap

- [x] 列冻结渲染
- [x] 视图级列显隐与列顺序
- [x] 撤销 / 重做（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y）
- [x] 拖拽填充（Excel 式下拉）
- [ ] 虚拟滚动（万行级）
- [ ] 导出 CSV / XLSX
- [ ] 数据源适配层（REST / Supabase）
- [ ] Vitest + Testing Library 覆盖 hook 与筛选排序逻辑
- [ ] 去掉 Google Fonts 依赖，改内置 SVG 图标

---

## License

[MIT](LICENSE) © 2026 DragonLuffy9527
