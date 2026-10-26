# Contributing

欢迎提 issue 和 PR。先看下面几条，能省掉一轮来回。

## 本地开发

```bash
npm install
npm run dev        # playground，改代码即时热更新
npm run typecheck  # 提交前必须过
npm run build      # 库构建 + 生成 d.ts
```

## 提交前自检

1. `npm run typecheck` 无错误
2. `npm run build` 通过（产物在 `dist/`，不进版本库）
3. playground 里点一遍受影响的视图：表格 / 看板 / 画册 / 甘特 / 日历 / 表单
4. 切一次 `storageKey`（demo 顶部「清空本地缓存」后刷新），确认没有串数据

## 代码约定

- **不做跨层依赖**：`src/` 里不出现任何业务字段名（图号、项目、专业等）。字段一律通过 `BitableColumnConfig` 传入。
- **视图配置集中在 `BitableViewConfig`**：新增视图级配置项先加类型，再在 `BitableViewConfigPopover` 暴露 UI，最后在对应视图消费。
- **所有写操作走 hook**：组件不直接改 `data` / `columns` / `views`，一律回调给 `useBitable`。
- **样式只用 utility class**：不进 CSS-in-JS。`src/styles.css` 只放 Tailwind 表达不了的行为样式。
- **中文注释**：解释「为什么」，不写「做了什么」。

## 新增一种视图类型

1. `src/types.ts` 的 `BitableViewType` 加字面量
2. 写 `BitableXxxView.tsx`，props 参考 `BitableGanttView`（`items` / `columns` / `viewConfig` / 行选择回调）
3. `BitableTable.tsx` 的 `viewType` 分发里加分支
4. `BitableViewTabs.tsx` 的 `viewTypeOptions` 加选项（图标用 Material Symbols 名）
5. `BitableViewConfigPopover.tsx` 加该类型的专属配置项

## 报告问题

请附上：复现步骤、期望结果、实际结果、浏览器版本，以及能复现的列配置片段（`defaultColumns` + `presetViews`）。
