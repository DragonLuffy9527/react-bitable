import React, { useState } from 'react';
import { BitableColumnConfig, BitableViewConfig, BitableViewScope } from './types';
import { SUMMARY_LABELS, summaryOptionsFor } from './aggregate';
import type { BitableSummaryType } from './aggregate';

interface BitableViewConfigPopoverProps {
  activeView: BitableViewConfig;
  totalViews: number;
  isMasterView?: boolean;
  /** 字段列表：父子记录的「父级字段」选择器 */
  columns?: BitableColumnConfig<any>[];
  onRenameView: (newName: string) => void;
  onUpdateViewConfig?: (updates: Partial<BitableViewConfig>) => void;
  onDuplicateView: () => void;
  onResetView: () => void;
  onDeleteView: () => void;
  onClose: () => void;
}

/**
 * 字段多选（chip 形式）。
 * 用于「卡片显示字段」「表单必填字段」这类多选项——飞书里是勾选列表，
 * 这里用 chip 更省高度，且点击顺序即卡片上的展示顺序。
 */
const FieldChips: React.FC<{
  label: string;
  hint?: string;
  options: BitableColumnConfig<any>[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
}> = ({ label, hint, options, value, onChange, emptyLabel = '自动' }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-600">{label}</span>
      <button
        type="button"
        onClick={() => onChange([])}
        className="text-[10.5px] text-[#005BAC] hover:underline cursor-pointer"
        title="清空后按列顺序自动取"
      >
        {emptyLabel}
      </button>
    </div>
    <div className="flex flex-wrap gap-1 p-1.5 rounded-md border border-slate-200 bg-slate-50/60 max-h-[88px] overflow-y-auto">
      {options.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
            className={`px-1.5 py-0.5 rounded text-[10.5px] border transition-colors cursor-pointer ${
              on
                ? 'bg-[#005BAC] text-white border-[#005BAC]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
    {hint && <div className="text-[10px] text-slate-400 leading-relaxed">{hint}</div>}
  </div>
);

export const BitableViewConfigPopover: React.FC<BitableViewConfigPopoverProps> = ({
  activeView,
  totalViews,
  isMasterView = false,
  columns = [],
  onRenameView,
  onUpdateViewConfig,
  onDuplicateView,
  onResetView,
  onDeleteView,
  onClose
}) => {
  const [editingName, setEditingName] = useState(activeView.name);
  const [isRenaming, setIsRenaming] = useState(false);
  // 系统总表固定为协作视图
  const isScopeLocked = isMasterView;
  const currentScope: BitableViewScope = isScopeLocked ? 'collaborative' : (activeView.scope || 'collaborative');
  const currentViewType = activeView.viewType || 'grid';
  const isLocked = !!activeView.isLocked;
  const selCls =
    'flex-1 max-w-[220px] h-7 px-2 text-[11.5px] bg-white border border-slate-200 rounded-md hover:border-slate-300 focus:outline-none focus:border-[#005BAC] cursor-pointer';
  const fieldOptions = columns.filter((c) => c.type !== 'action');
  const dateFieldOptions = columns.filter((c) => c.type === 'date');
  // 汇总只对可计算的字段有意义：数字列能求和，日期列能取最大/最小
  const summaryColumns = columns.filter((c) => c.type === 'number' || c.type === 'date');

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingName.trim()) return;
    onRenameView(editingName.trim());
    setIsRenaming(false);
  };

  const handleChangeScope = (scope: BitableViewScope) => {
    if (isScopeLocked && scope === 'personal') return;
    if (onUpdateViewConfig) {
      onUpdateViewConfig({ scope });
    }
  };

  const handleToggleLock = () => {
    if (onUpdateViewConfig) {
      onUpdateViewConfig({ isLocked: !isLocked });
    }
  };

  // Group count calculation
  const groupCount =
    activeView.groupRules && activeView.groupRules.length > 0
      ? activeView.groupRules.length
      : activeView.groupByFieldId
      ? 1
      : 0;

  return (
    <div className="absolute left-0 top-full mt-1.5 w-[390px] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-4 select-none text-slate-800 text-[12px] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#005BAC]">tune</span>
          <span className="font-bold text-slate-900 text-[13px]">视图配置 (飞书多维表标准)</span>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] block">close</span>
        </button>
      </div>

      <div className="max-h-[460px] overflow-y-auto space-y-3.5 pt-3 pr-0.5">
        {/* 1. View Name */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
            <span>视图名称</span>
            {isLocked && (
              <span className="text-[10.5px] text-amber-600 font-normal flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                视图已锁定
              </span>
            )}
          </div>

          {isMasterView ? (
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-[12.5px]">
                <span className="material-symbols-outlined text-[16px] text-[#005BAC]">grid_on</span>
                <span>{activeView.name}</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] text-slate-500 bg-slate-200/70 rounded-full font-medium">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                系统基础总表 (不可删除)
              </span>
            </div>
          ) : !isRenaming ? (
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-[12.5px]">
                <span className="material-symbols-outlined text-[16px] text-[#005BAC]">
                  {activeView.icon || 'table_chart'}
                </span>
                <span>{activeView.name}</span>
              </div>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return;
                  setEditingName(activeView.name);
                  setIsRenaming(true);
                }}
                title={isLocked ? '视图已锁定，名称不可修改（先在下方解锁视图配置）' : '重命名视图'}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                  isLocked
                    ? 'text-slate-300 bg-slate-50 border-slate-200 cursor-not-allowed'
                    : 'text-[#005BAC] hover:bg-blue-50 border-blue-200 cursor-pointer'
                }`}
              >
                重命名
              </button>
            </div>
          ) : (
            <form onSubmit={handleRenameSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                autoFocus
                className="flex-1 h-7 px-2 text-[12px] bg-white border border-[#005BAC] rounded-md focus:outline-none focus:ring-1 focus:ring-[#005BAC] font-medium"
              />
              <button
                type="submit"
                className="h-7 px-2.5 bg-[#005BAC] text-white rounded-md text-[11.5px] font-medium hover:bg-[#004785] cursor-pointer"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="h-7 px-2 text-slate-500 hover:bg-slate-100 rounded-md text-[11.5px] cursor-pointer"
              >
                取消
              </button>
            </form>
          )}
        </div>

        {/* 2. Scope & Lock (Feishu Bitable Collaboration Features) */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-600">协作权限与共享范围</div>

          {/* Scope Selector: Collaborative vs Personal */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleChangeScope('collaborative')}
              className={`flex-1 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                currentScope === 'collaborative'
                  ? 'border-[#005BAC] bg-blue-50/60 text-[#005BAC] font-medium'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold">
                <span className="material-symbols-outlined text-[15px]">public</span>
                <span>协作视图</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">全项目工程团队可见协同</div>
            </button>

            <button
              type="button"
              onClick={() => handleChangeScope('personal')}
              disabled={isScopeLocked}
              title={
                isScopeLocked
                  ? '「总表」为系统基础总表，固定为协作视图，不可改为个人视图'
                  : '切换为个人视图，仅自己可见'
              }
              className={`flex-1 p-2 rounded-lg border text-left transition-all ${
                isScopeLocked
                  ? 'border-slate-200 bg-slate-50/80 text-slate-400 cursor-not-allowed opacity-70'
                  : currentScope === 'personal'
                  ? 'border-[#005BAC] bg-blue-50/60 text-[#005BAC] font-medium cursor-pointer'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold">
                <span className="material-symbols-outlined text-[15px]">person</span>
                <span>个人视图</span>
                {isScopeLocked && (
                  <span className="material-symbols-outlined text-[13px] text-slate-400">lock</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isScopeLocked ? '总表固定协作，不可切换' : '仅自己可见，不干扰他人'}
              </div>
            </button>
          </div>

          {isScopeLocked && (
            <div className="flex items-start gap-1.5 px-1 text-[10px] text-amber-700/90 leading-relaxed">
              <span className="material-symbols-outlined text-[12px] mt-px">info</span>
              <span>系统基础总表固定为协作视图（全项目可见），需要个人视图请在视图页签「+」新建。</span>
            </div>
          )}

          {/* Lock view toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[16px] ${isLocked ? 'text-amber-600' : 'text-slate-400'}`}>
                {isLocked ? 'lock' : 'lock_open'}
              </span>
              <div>
                <div className="text-[11.5px] font-bold text-slate-800">锁定当前视图配置</div>
                <div className="text-[10px] text-slate-400">开启后防止协作者误改筛选/排序/分组条件</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleLock}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                isLocked ? 'bg-[#005BAC]' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                  isLocked ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 3.5 视图类型专属配置（按当前视图类型显示） */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-600">
            {currentViewType === 'grid' && '表格视图 · 父子记录'}
            {currentViewType === 'kanban' && '看板视图 · 分组与卡片'}
            {currentViewType === 'gallery' && '画册视图 · 封面与卡片'}
            {currentViewType === 'gantt' && '甘特视图 · 阶段与条目'}
            {currentViewType === 'calendar' && '日历视图 · 日期与排布'}
            {currentViewType === 'form' && '表单视图 · 表单设置'}
          </div>

          {currentViewType === 'grid' && (
            <>
              <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/70">
                <div>
                  <div className="text-[11.5px] font-bold text-slate-800">启用父子记录</div>
                  <div className="text-[10px] text-slate-400">按父级字段建立行层级，父行可展开/折叠</div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateViewConfig?.({ parentChildEnabled: !activeView.parentChildEnabled })}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    activeView.parentChildEnabled ? 'bg-[#005BAC]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                      activeView.parentChildEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {activeView.parentChildEnabled && (
                <div className="space-y-1">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600 shrink-0">父级字段</span>
                    <select
                      value={activeView.parentFieldId || ''}
                      onChange={(e) => onUpdateViewConfig?.({ parentFieldId: e.target.value || null })}
                      className={selCls}
                    >
                      <option value="">请选择父级字段</option>
                      {fieldOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-[10px] text-slate-400 leading-relaxed">
                    该字段填写父记录的主键值（如图号 A-101），本行即成为其子记录；留空为顶层记录。
                  </div>
                </div>
              )}
            </>
          )}

          {currentViewType === 'kanban' && (
            <div className="space-y-1">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">泳道分组字段</span>
                <select
                  value={activeView.kanbanFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ kanbanFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">自动识别（状态/专业优先）</option>
                  {fieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {c.options && c.options.length > 0 ? '（单选）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                按所选字段的每个选项生成泳道，卡片可在泳道间流转；推荐单选字段（状态、专业、版次）。
              </div>
            </div>
          )}

          {currentViewType === 'gallery' && (
            <div className="space-y-1">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">封面字段</span>
                <select
                  value={activeView.galleryCoverFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ galleryCoverFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">默认蓝图占位</option>
                  {fieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                字段值为图片链接时直接作封面图，普通文本叠加在蓝图底纹上。
              </div>
            </div>
          )}

          {currentViewType === 'gantt' && (
            <div className="space-y-1">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">开始日期字段</span>
                <select
                  value={activeView.ganttStartFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ ganttStartFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">自动识别（含「开始」的日期字段）</option>
                  {dateFieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">结束日期字段</span>
                <select
                  value={activeView.ganttEndFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ ganttEndFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">自动识别（含「截止/结束」的日期字段）</option>
                  {dateFieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                按开始/结束日期铺出真实时间轴。可直接拖动色条整体改期，拖右边缘改结束日；
                只填了一端的记录按单日任务显示。
              </div>
            </div>
          )}

          {currentViewType === 'calendar' && (
            <div className="space-y-1">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">日期字段</span>
                <select
                  value={activeView.calendarDateFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ calendarDateFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">自动识别（更新时间/日期）</option>
                  {fieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                按所选日期字段把记录排布到月历，支持上月/下月切换。
              </div>
            </div>
          )}

          {currentViewType === 'form' && (
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">提交按钮文案</span>
                <input
                  type="text"
                  value={activeView.formSubmitText || ''}
                  placeholder="默认：提交"
                  onChange={(e) => onUpdateViewConfig?.({ formSubmitText: e.target.value })}
                  className="flex-1 max-w-[220px] h-7 px-2 text-[11.5px] bg-white border border-slate-200 rounded-md hover:border-slate-300 focus:outline-none focus:border-[#005BAC]"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">表单说明</span>
                <input
                  type="text"
                  value={activeView.description || ''}
                  placeholder="展示在表单标题下方"
                  onChange={(e) => onUpdateViewConfig?.({ description: e.target.value })}
                  className="flex-1 max-w-[220px] h-7 px-2 text-[11.5px] bg-white border border-slate-200 rounded-md hover:border-slate-300 focus:outline-none focus:border-[#005BAC]"
                />
              </label>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                表单字段取自当前可见字段（可在「字段」面板调整显隐）。
              </div>

              <FieldChips
                label="必填字段"
                options={fieldOptions}
                value={activeView.formRequiredFields || []}
                onChange={(next) => onUpdateViewConfig?.({ formRequiredFields: next })}
                emptyLabel="默认前两项"
                hint="勾选的字段提交时校验不能为空；按勾选顺序生效。"
              />
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">提交成功提示</span>
                <input
                  type="text"
                  value={activeView.formSuccessText || ''}
                  placeholder="默认：表单已提交"
                  onChange={(e) => onUpdateViewConfig?.({ formSuccessText: e.target.value })}
                  className="flex-1 max-w-[220px] h-7 px-2 text-[11.5px] bg-white border border-slate-200 rounded-md hover:border-slate-300 focus:outline-none focus:border-[#005BAC]"
                />
              </label>
            </div>
          )}

          {/* —— 卡片配置：看板 / 画册 / 甘特共用（对齐飞书「卡片配置」） —— */}
          {(currentViewType === 'kanban' ||
            currentViewType === 'gallery' ||
            currentViewType === 'gantt') && (
            <div className="space-y-1.5 pt-2 mt-0.5 border-t border-dashed border-slate-200">
              <div className="text-[11px] font-semibold text-slate-600">卡片配置</div>
              <label className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">标题字段</span>
                <select
                  value={activeView.cardTitleFieldId || ''}
                  onChange={(e) => onUpdateViewConfig?.({ cardTitleFieldId: e.target.value || null })}
                  className={selCls}
                >
                  <option value="">自动（第一个有值字段）</option>
                  {fieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <FieldChips
                label="显示字段"
                options={fieldOptions}
                value={activeView.cardFields || []}
                onChange={(next) => onUpdateViewConfig?.({ cardFields: next })}
                hint="卡片上只显示勾选的字段，顺序按勾选先后；不选则按列顺序自动取前 6 个。"
              />
            </div>
          )}

          {/* —— 画册：卡片大小 —— */}
          {currentViewType === 'gallery' && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] text-slate-600">卡片大小</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: 'small', label: '小', desc: '每行 6 张' },
                    { key: 'medium', label: '中', desc: '每行 4 张' },
                    { key: 'large', label: '大', desc: '每行 2 张' }
                  ] as const
                ).map((opt) => {
                  const on = (activeView.galleryCardSize || 'medium') === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => onUpdateViewConfig?.({ galleryCardSize: opt.key })}
                      className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                        on
                          ? 'border-[#005BAC] bg-blue-50/60 text-[#005BAC]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-[11.5px] font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* —— 日历：每周起始日 / 是否显示周末 —— */}
          {currentViewType === 'calendar' && (
            <div className="space-y-1.5 pt-2 mt-0.5 border-t border-dashed border-slate-200">
              <div className="text-[11px] font-semibold text-slate-600">排布方式</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 shrink-0">每周起始日</span>
                <div className="flex gap-1">
                  {[
                    { key: 1 as const, label: '周一' },
                    { key: 0 as const, label: '周日' }
                  ].map((opt) => {
                    const on = (activeView.calendarWeekStart ?? 1) === opt.key;
                    const disabled = activeView.calendarShowWeekend === false;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onUpdateViewConfig?.({ calendarWeekStart: opt.key })}
                        className={`h-6 px-2 rounded border text-[11px] transition-colors ${
                          disabled
                            ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                            : on
                            ? 'border-[#005BAC] bg-blue-50/60 text-[#005BAC] font-medium cursor-pointer'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/70">
                <div>
                  <div className="text-[11.5px] font-bold text-slate-800">显示周末</div>
                  <div className="text-[10px] text-slate-400">关闭后只保留周一至周五（每周 5 列）</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateViewConfig?.({ calendarShowWeekend: activeView.calendarShowWeekend === false })
                  }
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    activeView.calendarShowWeekend !== false ? 'bg-[#005BAC]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                      activeView.calendarShowWeekend !== false ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
          {/* —— 汇总：分组汇总 / 底部合计 —— */}
          {currentViewType === 'grid' && summaryColumns.length > 0 && (
            <div className="space-y-1.5 pt-2 mt-0.5 border-t border-dashed border-slate-200">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-600">汇总方式</div>
                {Object.keys(activeView.summaryRules || {}).length > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateViewConfig?.({ summaryRules: {} })}
                    className="text-[10px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    重置
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {summaryColumns.map((col) => {
                  const value = activeView.summaryRules?.[col.id] ?? '';
                  return (
                    <div key={col.id} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-600 truncate min-w-0">{col.label}</span>
                      <select
                        value={value}
                        onChange={(e) => {
                          const next = { ...(activeView.summaryRules || {}) };
                          const picked = e.target.value;
                          if (picked) next[col.id] = picked as BitableSummaryType;
                          else delete next[col.id];
                          onUpdateViewConfig?.({ summaryRules: next });
                        }}
                        className={`${selCls} shrink-0`}
                      >
                        <option value="">自动</option>
                        {summaryOptionsFor(col.type)
                          .filter((t) => t !== 'none')
                          .map((t) => (
                            <option key={t} value={t}>
                              {SUMMARY_LABELS[t]}
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                分组时数字列默认「求和」，组尾显示汇总行；未分组时只有显式配置才会出现底部合计行。
              </div>
            </div>
          )}
        </div>

        {/* 4. Active Rules Summary */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-600">当前视图已生效规则统计:</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
            <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100">
              <span>筛选过滤:</span>
              <strong className="text-slate-900 font-mono">{activeView.filterRules.length} 条</strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100">
              <span>多级分组:</span>
              <strong className="text-slate-900 font-mono">
                {groupCount > 0 ? `${groupCount} 级嵌套` : '平铺无分组'}
              </strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100">
              <span>组合排序:</span>
              <strong className="text-slate-900 font-mono">{activeView.sortRules.length} 级</strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100">
              <span>条件高亮:</span>
              <strong className="text-slate-900 font-mono">{activeView.colorRules.length} 条</strong>
            </div>
          </div>
        </div>

        {/* 5. Action Buttons */}
        <div className="pt-2 space-y-1.5 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              onDuplicateView();
              onClose();
            }}
            className="w-full h-8 px-3 flex items-center gap-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-slate-500">content_copy</span>
            <span>复制视图 (生成副本)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onResetView();
              onClose();
            }}
            className="w-full h-8 px-3 flex items-center gap-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-slate-500">restart_alt</span>
            <span>重置视图配置 (恢复初始状态)</span>
          </button>

          {isMasterView ? (
            <div className="w-full h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-[11px] select-none">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              <span>总表为系统基础视图，不可删除</span>
            </div>
          ) : totalViews > 1 ? (
            <button
              type="button"
              onClick={() => {
                onDeleteView();
                onClose();
              }}
              className="w-full h-8 px-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/40 hover:bg-red-50 text-red-700 text-[11.5px] cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[15px] text-red-600">delete</span>
              <span>删除此业务视图</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
