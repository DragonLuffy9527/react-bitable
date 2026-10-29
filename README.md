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
| 视图可写 | 看板拖卡片改状态、日历拖事件改日期、甘特拖色条改期、表单提交写回，六种视图都能改数据 |
| 字段配置 | 7 种字段类型、增删改、重命名、拖拽排序、调列宽、锁定（受控只读）、冻结列、视图级显隐 |
| 筛选 / 排序 | AND / OR 多条件筛选，**数字/日期列额外支持 大于 / 大于等于 / 小于 / 小于等于 / 介于**；多字段排序 |
| 多级分组 | 飞书式嵌套分组，可逐级折叠、全部折叠 |
| 分组汇总 | 组尾汇总行：求和 / 平均值 / 最大 / 最小 / 计数，按列配置，未分组时也能出底部合计 |
| 区域选择 | 点选单元格、Shift+方向键框选矩形区域，**Ctrl/Cmd+C 复制为 TSV**，可直接粘进 Excel |
| 粘贴 | **Ctrl/Cmd+V 从选区左上角铺开**，按列类型转换（数字/日期/布尔/多选），越界裁剪、锁定列跳过 |
| 行范围选择 | **Shift+点击行内任意位置选中连续多行**（锚点保持，可反复调整终点）；Ctrl/Cmd+点击切换单行 |
| 键盘导航 | 方向键在单元格间移动，Esc 取消选区；正在编辑输入框时不抢键 |
| 条件染色 | 单元格 / 整行染色，规则命中即生效，支持取色盘与业务色板 |
| 行内编辑 | 单元格点开即改，回车保存、Esc 取消、Tab 走格 |
| 父子记录 | 拖行首方块建立层级，父行可展开折叠 |
| 视图管理 | 新建 / 重命名 / 复制 / 删除 / 重置，协作视图与个人视图隔离，可锁定 |
| 撤销重做 | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y，批量写入只记一步；勾选集也能一起回退 |
| 拖拽填充 | 单元格右下角手柄下拉，Excel 式：数字递增、日期顺延、文本尾号递增 |
| 批量更新 | `updateCells` 一次 `setData` 写多格，只产生一步撤销 |
| 导入表格 | 上传 `.xlsx` / `.csv` / `.tsv`，自动识别字段类型与单选项，可逐列改类型后替换或追加 |
| 导出表格 | 导出当前视图（已筛选 / 排序后的记录、仅可见列）为 **.xlsx** 或 **.csv**，自研最小 OOXML 打包，不引 SheetJS |
| 虚拟滚动 | 只渲染可视区附近的行（默认 >150 行触发），**平铺与分组一视同仁**，导入几万行也不卡 |
| 数据源 | 可选 `dataSource` 接后端：挂载拉取 + **写后同步（diff + 防抖）**，自带 REST / 内存适配器；不传则纯本地 |
| 持久化 | 数据、列、视图、当前视图、schema 版本全部落 `localStorage`，刷新不丢 |
| SSR 安全 | 无 `localStorage` 环境自动降级为内存存储，不抛异常 |

---

## 视图交互

六种视图不只是渲染，都能改数据。所有写操作都通过回调交还宿主，组件本身不持有业务状态。

| 视图 | 交互 | 需要的配置 |
| --- | --- | --- |
| 表格 | 行内编辑、拖拽填充、拖拽换列、拖拽建父子记录、右键菜单 | `onUpdateCell` |
| 看板 | **拖卡片到别的泳道改状态**（含空泳道，可拖入没有记录的状态） | `kanbanFieldId` + `onUpdateCell` |
| 日历 | **拖事件条到别的日期格改日期**（保留原时间部分） | `calendarDateFieldId` + `onUpdateCell` |
| 甘特 | **真实时间轴**：按月/日双行表头定位；**拖色条整体改期**、**拖右边缘改结束日** | `ganttStartFieldId` + `ganttEndFieldId` + `onUpdateCells` |
| 画册 | 卡片浏览、点封面预览附件 | `galleryCoverFieldId` + `onOpenAttachment` |
| 表单 | **提交后新增一条记录**，按字段类型转换值 | `onCreateRow` |

几个实现上的约定：

- **字段锁定即只读**：`isLocked` 或 `editable: false` 的字段，对应视图的拖拽会自动禁用，不会出现「拖了但写不进去」。
- **甘特一次拖拽只算一步撤销**：改期要同时动开始和结束两个字段，所以走 `onUpdateCells` 批量写；只接 `onUpdateCell` 会变成两步撤销。
- **时间不被静默抹掉**：日历和甘特写回日期时，如果原值带 `HH:mm` 会保留，不会把 `09:30` 变成 `00:00`。
- **甘特缺日期不崩**：只填一端的记录按单日任务显示，两端颠倒会自动纠正，都没填的行显示「未设置日期」。

---

## 筛选、汇总与复制

### 操作符按列类型分流

文本列没有「大于」这种说法，数字列也不需要「包含」，所以操作符列表随列类型变化：

| 列类型 | 可用操作符 |
| --- | --- |
| 文本 / 单选 / 多选 / 成员 | 包含、不包含、等于、不等于、开头是、为空、不为空 |
| 数字 / 日期 | 等于、不等于、**大于、大于等于、小于、小于等于、介于**、为空、不为空 |

求值口径（`src/filtering.ts`，纯函数）：

- **数字列**自动剥掉千分位、货币符号、百分号再比较，`¥2,500` 与 `2500` 等价；
- **日期列**兼容 `2026-10-08` / `2026/10/08` / `2026-10-08 09:30`，按时间戳比大小；
- **空值不参与大小比较**——不是当成 0，否则 `数量 < 100` 会把没填数量的行也算进去；
- **「介于」上下界写反也照常工作**，不让用户为顺序买单；
- 换字段时若原操作符不适用，自动降级为默认操作符，不会留下「数字列 大于 abc」的死条件。

### 分组汇总

分组时数字列默认按「求和」出组尾汇总行，日期列可配置取最大/最小日期。汇总方式在「视图配置 → 汇总方式」里按列设置，选「自动」即沿用默认，选具体方式即覆盖，清空配置可恢复。

```ts
updateViewConfig(activeViewId, {
  summaryRules: { amount: 'sum', due: 'max', owner: 'count' } // 'none' 可关掉某列的自动求和
});
```

- 非叶子分组汇总的是**全部后代记录**，不只是直接子行；
- 未分组时默认不出汇总行，只有显式配了 `summaryRules` 才出底部合计行；
- 数值计算跳过空值，平均值不会被系统性拉低。

### 区域选择与复制

| 操作 | 效果 |
| --- | --- |
| 点击单元格 | 选中并设为锚点 |
| Shift + 方向键 | 从锚点扩展成矩形选区 |
| 方向键 | 逐格移动（编辑输入框时不抢键） |
| Ctrl / Cmd + C | 复制选区为 TSV，粘进 Excel 自动分列 |
| Esc | 取消选区 |

**Shift + 点击 = 选行，不是选单元格**：在行内任意位置（含复选框、行号）Shift+点击，会把锚点行到当前行的**整行勾选集**一次性选中，锚点保持不动，所以可以连续 Shift+点击反复调整终点。这条路径走 `onSelectRows`；宿主没接时退化为用 `onToggleCheck` 逐行对账（区间外的取消、区间内的勾上），调用次数只与当前勾选数 + 区间长度有关，不随总行数增长。

配合「Shift+点击选行」，单元格编辑器在 Shift 按下时**不会进入编辑态**——否则输入框会抢走焦点，范围选择看起来像没生效。

复制走 `navigator.clipboard`，非安全上下文（http 内网）自动降级到 `execCommand`。宿主可通过 `onCopyCells` 拿到 `{ text, rows, columns }` 做「已复制 3×2」之类的提示。

### 粘贴

Ctrl / Cmd + V 从**选区左上角**开始铺开矩阵，与 Excel 一致。剪贴板按 TSV 解析（Excel / 飞书 / Google Sheets 复制的标准格式），支持 `"..."` 包裹的含逗号、含换行的单元格。

| 情况 | 处理方式 |
| --- | --- |
| 剪贴板是单个值（无 `\t`、无换行） | 只写当前格，**不切分**——避免一段含逗号的普通文本被拆成两列 |
| 行长度不齐（Excel 复制的短行） | 缺的格子按「清空」写入 |
| 超出表格底部 / 右侧 | 裁剪，不报错（粘到表尾通常只想填满剩下的行） |
| 字段被 `isLocked` 或 `editable: false` | 跳过并计入 `skipped`，不会出现「粘了但没保存」 |
| 正在编辑单元格 | 不拦截，交给浏览器原生粘贴 |

值按列类型转换（`src/clipboard.ts`，纯函数）：

- 数字列：`¥2,500` → `2500`、`85%` → `0.85`、`1,234.5` → `1234.5`；**转不了就原样保留文本**，不静默丢数据
- 日期列：`2026/10/08` → `2026-10-08`，带时间的保留 `HH:mm`
- 布尔列：`是 / 否 / true / false / 1 / 0` → `true / false`
- 多选列：按 `,`、`、`、`;`、`|` 切分成数组
- 空字符串：清空该格

写入走 `onUpdateCells`，**整次粘贴只产生一步撤销**；未接时退化为逐格 `onUpdateCell`。粘贴后选区会自动扩到刚落下的矩形，落点一眼可见。

### 导出

`exportView(format, filename?)` 导出的是**当前视图的可见结果**：筛选、排序已应用，隐藏列不导出。

- **.xlsx**：自己拼最小 OOXML 包（ZIP 用存储模式，不压缩），数字/布尔保留真实类型，Excel 里能直接求和；不引 SheetJS（约 800KB）；
- **.csv**：RFC 4180 转义 + UTF-8 BOM，中文版 Excel 打开不乱码；数字列输出纯数字而非 `¥2,500`，否则会被当文本。

### 虚拟滚动

行数超过 `virtualThreshold`（默认 150）时，只渲染可视区上下各 12 行，其余用占位行撑出滚动条高度。

- 行高固定（32 / 40 / 52px，随密度变化），偏移可以直接算，不需要测量 DOM；
- **分组也支持**：把「分组标题 + 数据行 + 汇总行」摊平成一条滚动坐标系，每组记录自己的起始像素与行号区间，窗口跨组计算。整组落在窗口外时连分组标题一起跳过；
- 滚动位置按行高量化，滚一屏只触发几次重渲染，不是每像素一次；
- 分组标题按 30px 估算，估算误差会被 12 行 overscan 吸收；
- 已知取舍：虚拟滚动开启时，跨屏拖拽填充需要目标行在可视区内（DOM 里没有的行无法被拖到）。

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

## 嵌入到已有平台

这个库的定位是**引擎**而不是**应用**：它不假设自己有路由、有后端、有全局状态，可以直接塞进你已有的系统里当一块积木。嵌入时只需要守住这几条契约。

**1. 数据入口只有一个，就是 `initialData`。**
宿主拿到后端数据后传进来，库不自己发请求。数据变更通过 `onDataChange` 回传，你决定是 PATCH 到接口还是写 IndexedDB。

```tsx
const bt = useBitable<Task>({
  storageKey: `task-table-${projectId}`,   // 按业务实体切命名空间
  initialData: tasksFromApi,
  defaultColumns: columnsFromApi,
  presetViews: viewsFromApi,
  onDataChange: (next) => api.saveTasks(next),   // 唯一的写出口
  schemaVersion: 'v3'                            // 后端字段变了就调大，旧缓存自动重置
});
```

**2. 多实例天然隔离，不需要额外的 Provider。**
`storageKey` 是完整的命名空间（`_data` / `_columns` / `_views` / `_active_view_id` / `_schema_version`）。同一个页面挂两个表、或者一个平台里嵌十个业务页，只要 `storageKey` 不同就互不干扰。

> 注意：**同一个 `storageKey` 不要挂两个实例**。两个 `useBitable` 会各自往同一个 key 写，互相覆盖。需要只读展示（比如仪表盘）时，读 `localStorage` 而不是再起一个 hook。

**3. 可以只嵌一部分。**
不想给用户看工具栏，就只渲染 `BitableTable`；只要看板，就把 `viewType` 固定成 `'kanban'`。所有弹层和工具栏都是独立组件，按需引入。

**4. 尺寸由父容器决定。**
`BitableTable` 传 `fillHeight` 时撑满父级高度（父级要是确定高度的 flex 列），否则沿用视口截断。嵌在 Tab、抽屉、弹窗里时优先用 `fillHeight`。

**5. 主题靠 CSS 变量，不靠构建配置。**

```css
:root {
  --bitable-primary: #7c3aed;
  --bitable-primary-hover: #6d28d9;
  --bitable-primary-light: #f5f3ff;
  --bitable-primary-border: #ddd6fe;
}
```

**6. 图标字体要自托管。**
组件用 Google Material Symbols。内网 / 离线平台请把字体文件放进自己的静态资源，或替换 `material-symbols-outlined` 那一层的图标组件。

**7. SSR 安全但不持久。**
没有 `localStorage` 的环境会自动降级为内存存储，不会抛异常，但刷新即丢。服务端渲染的平台请在客户端挂载后再依赖持久化。

---

## 接后端（数据源适配层）

默认只存 `localStorage`。传一个 `dataSource` 就能接自己的后端——**不传时行为与纯本地版完全一致**。

```ts
interface BitableDataSource<T> {
  loadRows(): Promise<T[]>;                       // 必填
  createRows?(rows: T[]): Promise<void>;
  updateRows?(patches: { rowId: string; patch: Partial<T> }[]): Promise<void>;
  deleteRows?(rowIds: string[]): Promise<void>;
}
```

```tsx
const { data, syncState, reloadFromSource, flushSync } = useBitable({
  storageKey: 'orders',
  initialData: [],
  defaultColumns,
  presetViews,
  dataSource: createRestDataSource({ baseUrl: '/api/orders' }),
  onSyncStateChange: (s) => s.status === 'error' && toast(`同步失败：${s.error}`)
});
```

### 为什么是「写后同步 + 差分」而不是在每个操作里埋回调

所有写入口——行内编辑、拖拽填充、粘贴、导入、批量删除、撤销重做——最终都落到同一个 `data` 快照上。与其在十几个 mutation 函数里逐个埋同步回调（漏一个就静默丢数据），不如**比对新旧快照**得出增量：

- **自动覆盖全部写入口**，包括以后新增的；
- patch **只带真正变化的字段**，后端可以按字段合并，避免「改一格却整行覆盖」冲掉别人的并发修改；
- 连续编辑用 300ms 防抖合成一批，拖拽填充 20 格只发一次请求。

### 失败不丢改动

写失败时**基线停在旧值、最新快照保留**，`syncState.pending` 记录还有多少处没同步，调 `flushSync()` 重试同一批 diff。也可以接 `onSyncStateChange` 弹提示、显示重试按钮。

| 状态 | 含义 |
| --- | --- |
| `loading` | 正在 `loadRows()`，此时不推送本地改动 |
| `ready` + `pending: 0` | 已同步 |
| `ready` + `pending: N` | 有 N 处改动还在防抖队列里 |
| `error` | 上一次写入失败，`error` 是原因，`pending` 是待重试处数 |

### 两个现成适配器

```ts
// REST：GET {baseUrl} / POST {baseUrl} / PATCH {baseUrl}/{id} / DELETE {baseUrl}/{id}
createRestDataSource({ baseUrl: '/api/rows', headers: () => ({ Authorization: token }), mapRow })

// 内存：演示、单测、离线队列的落点，可注入延迟与失败率
createMemoryDataSource(seed, { latency: 300, failRate: 0.1 })
```

### 几条要知道的约定

- **远端是权威**：`loadRows()` 会覆盖本地缓存，别指望它做合并（需要合并就在适配器里自己做）。
- **只读数据源合法**：只实现 `loadRows` 即可，未实现的写入方法会被跳过而不是报错。
- **列配置与视图仍存本地**：`dataSource` 只管行数据。字段定义、筛选、分组、染色这些视图配置目前还在 `localStorage`，多端共享需要另外接。
- **`storageKey` 仍是缓存命名空间**：换账套时数据源也应该换（`dataSource` 变化会触发重新加载）。

---

## 导入 Excel / CSV

上传一个表格文件，直接变成一张多维表：自动识别字段类型、自动生成单选项、可逐列改类型后导入。

```tsx
import { BitableImportDialog } from 'react-bitable';

const [importOpen, setImportOpen] = useState(false);

<BitableToolbar onAddRecord={...} onImport={() => setImportOpen(true)} />

<BitableImportDialog
  open={importOpen}
  onClose={() => setImportOpen(false)}
  existingColumns={columns}
  onImport={({ mode, columns, rows }) => importTable({ columns, rows, mode })}
/>
```

`importTable` 来自 `useBitable`，返回 `{ columns, rows }` 表示导入后的字段数与记录数。

### 支持的格式

| 格式 | 说明 |
| --- | --- |
| `.xlsx` | 原生解析，支持多工作表、共享字符串、日期格式、稀疏单元格 |
| `.csv` | 自动识别 `,` `;` `\t` 分隔符；支持引号包裹、字段内换行、`""` 转义 |
| `.tsv` | 按制表符解析 |

限制：单文件 ≤ 20MB、≤ 50000 行（`maxBytes` / `maxRows` 可调）。老版 `.xls`（OLE 二进制）不支持，会提示另存为 `.xlsx`。

**编码**：UTF-8 / UTF-8 BOM / UTF-16 / **GBK** 都能正确解码——中文 Excel 另存的 CSV 默认是 GBK，这一条是专门为它做的。

### 类型推断规则

按「布尔 → 数字 → 日期 → 超链接 → 单选 → 文本」的顺序判定，每类要求 ≥95% 的非空样本命中：

| 判定 | 依据 | 示例 |
| --- | --- | --- |
| 复选框 | 全为 `TRUE/FALSE` `是/否` `✓/✗` | `是` `否` |
| 数字 | 纯数字、千分位、货币前缀、百分号 | `128000` `1,280.50` `¥3200` `65%` |
| 日期 | `YYYY-MM-DD` `YYYY/M/D` `YYYY年M月D日` `M/D/YYYY` 及带时间 | `2026-10-08` |
| 超链接 | 以 `http(s)://` 或 `www.` 开头 | `https://…` |
| 单选 | 去重值 ≤20、出现过重复、重复率够高、单值 ≤20 字符 | `进行中/已完成` |
| 文本 | 以上都不满足 | 长句、编号、姓名 |

> 百分数会存成小数（`65%` → `0.65`），这样排序和求和才正确。

### 两种导入模式

- **替换当前表**：字段与记录整体替换。视图页签保留，但筛选 / 排序 / 分组 / 染色 / 隐藏列等依赖旧字段的配置会被清空——否则规则指向已不存在的字段，会把所有行筛空。
- **追加记录**：按表头把新列并入已有字段（同名复用、异名新增），只追加记录，已有字段的 id、类型、染色规则都不动。

两种模式都只产生**一步撤销**，误导入按 `Ctrl+Z` 整体退回。

### 为什么不用 SheetJS

`.xlsx` 本质是个 ZIP 包着若干 XML，浏览器原生就有 `DecompressionStream('deflate-raw')` 和 `DOMParser`。自己读大约 400 行，换来的是**运行时依然零依赖**（gzip 后约 +4KB）。引入 SheetJS 会让包体增加约 800KB，与「零 runtime 依赖」的定位冲突。

纯函数也可以单独用，不经过 UI：

```ts
import { parseSpreadsheetFile, buildImportResult } from 'react-bitable';

const wb = await parseSpreadsheetFile(file);
const { columns, rows } = buildImportResult(wb.sheets[0], { hasHeader: true });
```

| 导出 | 用途 |
| --- | --- |
| `parseSpreadsheetFile(file)` | 统一入口，按内容嗅探 xlsx / csv / tsv |
| `parseXlsx(buffer)` / `parseDelimited(text)` | 分格式解析 |
| `buildImportResult(sheet, opts)` | 矩阵 → `columns` + `rows`，`opts.typeOverrides` 可按列下标强制类型 |
| `inferColumnType(values)` | 单列类型推断，返回 `{ type, options, confidence }` |
| `normalizeDateText` / `parseNumberText` / `parseBooleanText` | 单值归一化原子函数 |
| `normalizeMatrix` | 去尾部空行空列、补齐宽度 |

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
| `dataSource?` | `BitableDataSource<T>` | 数据源适配层。传了就挂载拉取 + 写后同步；不传纯本地 |
| `syncDebounceMs?` | `number` | 同步防抖间隔，默认 300ms |
| `onSyncStateChange?` | `(state) => void` | 同步状态变化，用来弹「已同步 / 失败重试」 |

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
importTable,  // 导入 Excel / CSV：{ columns, rows, mode: 'replace' | 'append' }
exportView,   // 导出当前视图：exportView('xlsx' | 'csv', filename?)
detachRow, moveRow

// 数据源同步（未传 dataSource 时恒为 idle）
syncState, reloadFromSource, flushSync

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
| `BitableToolbar` | 工具栏：添加记录、批量删除、导入表格、导出、字段配置、筛选、分组、排序、密度、染色、搜索、`extraActions` 插槽 |
| `BitableImportDialog` | 导入弹窗：拖拽上传 → 预览 → 逐列改类型 → 替换 / 追加 |
| `BitableKanbanView` / `GalleryView` / `GanttView` / `CalendarView` / `FormView` | 各视图实现，一般不用直接引 |
| `EditableCell` | 单元格编辑器，按字段类型分发到 input / select / date / checkbox |
| `Bitable*Popover` | 字段、筛选、排序、分组、密度、染色、视图配置弹层 |

`extraActions` 用来把业务按钮挂到工具栏右侧；按钮文字包一层 `.tb-label` 后，
窄屏三档自适应（full / compact / ultra）会自动把文字折叠成图标。

几个容易漏接的 props：

| prop | 作用 |
| --- | --- |
| `onFillCells(updates)` | 拖拽填充（单元格右下角手柄下拉）的批量写入回调。不接会退化成逐格 `onUpdateCell`，产生 N 次保存反馈 |
| `onSelectRows(ids)` | Shift+点击范围选择回传的行集合，页面把勾选集整体替换为这批行。**不接也能用**（组件会用 `onToggleCheck` 对账），但接上更准、更快 |
| `onUndo` / `onRedo` / `canUndo` / `canRedo` / `undoLabel` / `redoLabel` | 工具栏的撤销 / 重做按钮。**这组不传，按钮不渲染**（快捷键 Ctrl+Z / Ctrl+Shift+Z 由 hook 自己接管，不受影响） |
| `isLockProtectedColumn(id)` | 命中的已锁定列视为「后端固定字段」：锁图标显示红色且不可解锁 |
| `fillHeight` | 撑满父容器高度（父级需为确定高度的 flex 列），多台账页统一传 `true` 才能对齐底边 |
| `onOpenAttachment(row)` | 画册视图封面点「预览附件」时回传该行，由页面接到自己的附件查看器 |
| `onUpdateCells(updates, label?)` | 批量写回，一次只算一步撤销。甘特拖拽改期用它同时改开始与结束；`label` 会进撤销提示 |
| `onCreateRow(values)` | 表单视图提交回调，值已按字段类型转换好（数字→number、复选框→boolean、多选→string[]）。不接则表单只做校验不写回 |
| `onCopyCells({ text, rows, columns })` | 单元格区域复制回调，`text` 是 TSV。接上就能提示「已复制 3×2」 |
| `onPasteCells({ rows, columns, sourceRows, sourceColumns, skipped })` | 粘贴完成回调，可据此提示「已粘贴 3×2，跳过 1 个锁定格」 |
| `virtualThreshold` | 平铺大表启用虚拟滚动的行数阈值，默认 `150`；传 `0` 关闭 |

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
| `applyFilterRules` / `matchesRule` / `compareValues` | 筛选求值：给定行、规则与列类型，返回是否命中。仪表盘等只读场景可直接复用同一套口径 |
| `resolveComparableKind` / `operatorsFor` / `TEXT_OPERATORS` / `ORDERED_OPERATORS` | 操作符适用范围与比较语义，保证 UI 放开的能力和求值端一致 |
| `computeSummary` / `resolveSummaryType` / `formatNumber` | 分组汇总：`{ count, cells }`，跳过空值，数字千分位、日期取极值时保留原格式 |
| `buildCsv` / `buildXlsx` / `exportRows` / `downloadBlob` | 导出：TSV/CSV 转义、最小 OOXML 打包、浏览器下载（SSR 下静默跳过） |
| `cellToText` / `columnLetter` / `crc32` | 导出底层原子函数 |
| `parseClipboardMatrix` / `coercePastedValue` / `buildPastePlan` | 粘贴：剪贴板 TSV → 矩阵 → 按列类型转换 → 落到具体 `{ rowId, fieldId, value }`，越界裁剪与锁定列跳过都在这里 |
| `createRestDataSource` / `createMemoryDataSource` | 数据源适配器：REST 资源式接口 / 内存实现（可注入延迟与失败率） |
| `createSyncQueue` / `diffRows` / `snapshotRows` | 同步引擎：快照差分（只带变化字段）+ 防抖批量写 + 失败保留待重试 |

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
├── filtering.ts                 筛选求值：比较语义 + 操作符适用范围（纯函数）
├── aggregate.ts                 分组汇总：求和/平均/极值/计数（纯函数）
├── exportTable.ts               CSV / 最小 OOXML xlsx 导出（纯函数 + 下载入口）
├── clipboard.ts                 剪贴板 TSV 解析与粘贴计划（纯函数）
├── dataSource.ts                数据源适配层：diff / 同步队列 / REST 与内存适配器
├── fillSeries.ts                拖拽填充计划（纯函数）
├── spreadsheet.ts               Excel / CSV 解析与字段类型推断（纯函数，零依赖）
├── BitableTable.tsx             主容器 + 表格视图 + 父子记录 + 拖拽
├── BitableViewTabs.tsx          视图页签
├── BitableToolbar.tsx           工具栏（窄屏三档自适应）
├── BitableKanbanView.tsx        看板
├── BitableGalleryView.tsx       画册
├── BitableGanttView.tsx         甘特
├── BitableCalendarView.tsx      日历
├── BitableFormView.tsx          表单
├── EditableCell.tsx             单元格编辑器
├── BitableImportDialog.tsx      导入 Excel / CSV 弹窗
└── Bitable*Popover.tsx          各类配置弹层
playground/                      demo（npm run dev）
```

---

## 已知限制

- **行数据可接后端，列与视图仍在本机**：`dataSource` 只同步行；字段定义、筛选、分组、染色存在 `localStorage`，多端共享要另外接。多人协作还需要自己加冲突解决与实时推送。
- **虚拟滚动开启时跨屏拖拽填充受限**：DOM 里没有渲染的行无法被拖到，需要目标行在可视区内。
- **`any` 未收干净**：`BitableColumnConfig<T = any>` 等位置保留了 `any`，泛型收紧要逐步做。
- **无测试**：仓库目前没有单元测试，靠 playground 手工回归（纯函数模块可单独 import 测，`filtering` / `aggregate` / `exportTable` 都已用临时脚本验过边界）。
- **图标依赖 Google Fonts**：离线环境需自托管字体。

## Roadmap

- [x] 列冻结渲染
- [x] 视图级列显隐与列顺序
- [x] 撤销 / 重做（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y）
- [x] 拖拽填充（Excel 式下拉）
- [x] 导入 Excel / CSV（零依赖 xlsx 解析 + 类型推断）
- [x] 六种视图全部可写（看板拖拽换列、日历拖拽改期、表单写回、甘特真实时间轴）
- [x] 数字 / 日期比较操作符（大于、大于等于、小于、小于等于、介于）
- [x] 分组汇总与底部合计
- [x] 单元格区域选择、方向键导航、Ctrl+C 复制为 TSV
- [x] Ctrl+V 粘贴（TSV → 多格批量写入，按列类型转换）
- [x] 导出 CSV / XLSX（零依赖）
- [x] 虚拟滚动（平铺与分组）
- [x] 数据源适配层（行级 CRUD + 写后同步 + REST / 内存适配器）
- [ ] 列配置与视图同步到后端
- [ ] 实时协作（WebSocket / Supabase Realtime）
- [ ] Vitest + Testing Library 覆盖 hook 与筛选排序逻辑
- [ ] 去掉 Google Fonts 依赖，改内置 SVG 图标

---

## License

[MIT](LICENSE) © 2026 DragonLuffy9527
