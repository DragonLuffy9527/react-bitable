import React, { useState } from 'react';
import { BitableColumnConfig, BitableColorRule } from './types';

interface BitableColorRulePopoverProps<T> {
  columns: BitableColumnConfig<T>[];
  colorRules: BitableColorRule[];
  onUpdateRules: (rules: BitableColorRule[]) => void;
  onClose: () => void;
}

export interface ColorSwatchItem {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  bgClass: string;
  textClass: string;
}

// 1. 经典工程业务色系 (含 16 种经典配色方案)
export const businessColorSwatches: ColorSwatchItem[] = [
  // 预警红橙
  { label: '预警浅红', bgColor: '#fef2f2', textColor: '#b91c1c', borderColor: '#fca5a5', bgClass: 'bg-red-50', textClass: 'text-red-700' },
  { label: '玫瑰警示', bgColor: '#fff1f2', textColor: '#be123c', borderColor: '#fecdd3', bgClass: 'bg-rose-50', textClass: 'text-rose-700' },
  { label: '珊瑚鲜橙', bgColor: '#fff7ed', textColor: '#c2410c', borderColor: '#fdba74', bgClass: 'bg-orange-50', textClass: 'text-orange-700' },
  
  // 关注黄
  { label: '关注暖黄', bgColor: '#fefce8', textColor: '#a16207', borderColor: '#fde047', bgClass: 'bg-yellow-50', textClass: 'text-yellow-800' },
  { label: '待定琥珀', bgColor: '#fffbeb', textColor: '#b45309', borderColor: '#fcd34d', bgClass: 'bg-amber-50', textClass: 'text-amber-800' },
  { label: '金黄高亮', bgColor: '#fef08a', textColor: '#854d0e', borderColor: '#eab308', bgClass: 'bg-amber-100', textClass: 'text-amber-900' },

  // 核准绿
  { label: '核准浅绿', bgColor: '#ecfdf5', textColor: '#047857', borderColor: '#6ee7b7', bgClass: 'bg-emerald-50', textClass: 'text-emerald-700' },
  { label: '翠绿生效', bgColor: '#f0fdf4', textColor: '#15803d', borderColor: '#86efac', bgClass: 'bg-green-50', textClass: 'text-green-700' },
  { label: '薄荷清爽', bgColor: '#f0fdfa', textColor: '#0f766e', borderColor: '#5eead4', bgClass: 'bg-teal-50', textClass: 'text-teal-700' },

  // 提示蓝
  { label: '主题浅蓝', bgColor: '#eff6ff', textColor: '#005BAC', borderColor: '#93c5fd', bgClass: 'bg-blue-50', textClass: 'text-[#005BAC]' },
  { label: '提示天蓝', bgColor: '#f0f9ff', textColor: '#0369a1', borderColor: '#7dd3fc', bgClass: 'bg-sky-50', textClass: 'text-sky-700' },
  { label: '青蓝信息', bgColor: '#ecfeff', textColor: '#0e7490', borderColor: '#67e8f9', bgClass: 'bg-cyan-50', textClass: 'text-cyan-700' },

  // 基准紫
  { label: '基准浅紫', bgColor: '#faf5ff', textColor: '#7e22ce', borderColor: '#d8b4fe', bgClass: 'bg-purple-50', textClass: 'text-purple-700' },
  { label: '重点靛青', bgColor: '#eef2ff', textColor: '#4338ca', borderColor: '#a5b4fc', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700' },
  { label: '浪漫洋红', bgColor: '#fdf2f8', textColor: '#be185d', borderColor: '#f472b6', bgClass: 'bg-pink-50', textClass: 'text-pink-700' },

  // 归档灰
  { label: '中性银灰', bgColor: '#f8fafc', textColor: '#475569', borderColor: '#cbd5e1', bgClass: 'bg-slate-50', textClass: 'text-slate-700' },
  { label: '归档中灰', bgColor: '#f1f5f9', textColor: '#334155', borderColor: '#94a3b8', bgClass: 'bg-slate-100', textClass: 'text-slate-800' }
];

// 2. 24 色色块矩阵
export const colorMatrixPalette: { name: string; hex: string; text: string }[] = [
  // 第一行：红橙系
  { name: '淡粉红', hex: '#fee2e2', text: '#991b1b' },
  { name: '珊瑚橙', hex: '#ffedd5', text: '#9a3412' },
  { name: '杏仁黄', hex: '#fed7aa', text: '#ea580c' },
  { name: '玫瑰浅红', hex: '#fecdd3', text: '#9f1239' },
  { name: '暖柿红', hex: '#fca5a5', text: '#7f1d1d' },
  { name: '鲜活橙', hex: '#fdba74', text: '#7c2d12' },

  // 第二行：黄绿系
  { name: '柔和黄', hex: '#fef9c3', text: '#854d0e' },
  { name: '柠檬黄', hex: '#fef08a', text: '#713f12' },
  { name: '苹果青', hex: '#ecfccb', text: '#3f6212' },
  { name: '嫩草绿', hex: '#dcfce7', text: '#166534' },
  { name: '碧绿浅青', hex: '#a7f3d0', text: '#065f46' },
  { name: '翡翠绿', hex: '#86efac', text: '#14532d' },

  // 第三行：青蓝系
  { name: '薄荷青', hex: '#ccfbf1', text: '#115e59' },
  { name: '冰川蓝', hex: '#e0f2fe', text: '#075985' },
  { name: '天水蓝', hex: '#bae6fd', text: '#0369a1' },
  { name: '主题浅蓝', hex: '#dbeafe', text: '#005BAC' },
  { name: '晴空蓝', hex: '#bfdbfe', text: '#1e40af' },
  { name: '靛青蓝', hex: '#93c5fd', text: '#1e3a8a' },

  // 第四行：紫粉中性系
  { name: '浅薰衣草', hex: '#ede9fe', text: '#5b21b6' },
  { name: '紫罗兰', hex: '#ddd6fe', text: '#4c1d95' },
  { name: '丁香粉紫', hex: '#fae8ff', text: '#86198f' },
  { name: '淡银灰', hex: '#f8fafc', text: '#334155' },
  { name: '中冷灰', hex: '#f1f5f9', text: '#1e293b' },
  { name: '铅板灰', hex: '#e2e8f0', text: '#0f172a' }
];

// 智能文字色亮度反差计算
function getContrastTextColor(hexColor: string): string {
  const cleanHex = hexColor.replace('#', '').trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return '#0f172a';
  const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.slice(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 145 ? '#0f172a' : '#ffffff';
}

export const BitableColorRulePopover = <T,>({
  columns,
  colorRules,
  onUpdateRules,
  onClose
}: BitableColorRulePopoverProps<T>) => {
  // 调色盘选项卡：'swatches' | 'matrix' | 'custom'
  const [pickerTab, setPickerTab] = useState<'swatches' | 'matrix' | 'custom'>('matrix');

  const handleAddRule = () => {
    const firstCol = columns[0]?.id || '';
    const defaultColor = businessColorSwatches[0];
    const newRule: BitableColorRule = {
      id: `color_${Date.now()}`,
      fieldId: firstCol,
      operator: 'contains',
      value: '',
      bgColor: defaultColor.bgColor,
      textColor: defaultColor.textColor,
      borderColor: defaultColor.borderColor,
      bgClass: defaultColor.bgClass,
      textClass: defaultColor.textClass,
      colorName: defaultColor.label,
      scope: 'cell'
    };
    onUpdateRules([...colorRules, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    onUpdateRules(colorRules.filter((r) => r.id !== id));
  };

  const handleChangeRule = (id: string, updates: Partial<BitableColorRule>) => {
    onUpdateRules(
      colorRules.map((r) => {
        if (r.id === id) {
          return { ...r, ...updates };
        }
        return r;
      })
    );
  };

  const handleApplyColorSwatch = (ruleId: string, swatch: ColorSwatchItem) => {
    handleChangeRule(ruleId, {
      bgColor: swatch.bgColor,
      textColor: swatch.textColor,
      borderColor: swatch.borderColor,
      bgClass: swatch.bgClass,
      textClass: swatch.textClass,
      colorName: swatch.label
    });
  };

  const handleApplyMatrixColor = (ruleId: string, hex: string, name: string) => {
    const autoText = getContrastTextColor(hex);
    handleChangeRule(ruleId, {
      bgColor: hex,
      textColor: autoText,
      borderColor: hex,
      bgClass: '',
      textClass: '',
      colorName: name
    });
  };

  const handleCustomHexChange = (ruleId: string, hex: string) => {
    let clean = hex.trim();
    if (!clean.startsWith('#') && clean.length > 0) {
      clean = '#' + clean;
    }
    const autoText = getContrastTextColor(clean);
    handleChangeRule(ruleId, {
      bgColor: clean,
      textColor: autoText,
      borderColor: clean,
      bgClass: '',
      textClass: '',
      colorName: '自定义色'
    });
  };

  return (
    <div className="absolute left-0 top-full mt-1.5 w-[560px] max-w-[calc(100vw-32px)] bg-white border border-slate-200 rounded-lg shadow-2xl z-50 p-3.5 select-none text-slate-800 text-[12px] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="material-symbols-outlined text-[17px] text-[#005BAC]">palette</span>
          <span className="text-[13px] font-bold">条件格式与填色面板</span>
          {colorRules.length > 0 && (
            <span className="text-[11px] font-normal px-2 py-0.2 rounded-full bg-blue-50 text-[#005BAC] border border-blue-200">
              {colorRules.length} 条已配置
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {colorRules.length > 0 && (
            <button
              onClick={() => onUpdateRules([])}
              type="button"
              className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-red-50"
            >
              清空全部
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] block">close</span>
          </button>
        </div>
      </div>

      <div className="text-[11.5px] text-slate-500 py-1.5 flex items-center justify-between">
        <span>满足匹配规则的记录或单元格将自动渲染醒目背景与文字色，提升工程审图核对效率</span>
      </div>

      {/* Rules list */}
      <div className="py-1 space-y-2.5 max-h-[62vh] overflow-y-auto overflow-x-hidden pr-1">
        {colorRules.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-[12px] bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
            <span className="material-symbols-outlined text-[32px] text-slate-300 block">format_color_fill</span>
            <div className="font-medium text-slate-600">暂无生效的填色规则</div>
            <div className="text-[11px] text-slate-400">点击下方按钮可针对任意字段添加高亮着色规则</div>
          </div>
        ) : (
          colorRules.map((rule, idx) => {
            const currentBg = rule.bgColor || '#fef2f2';
            const currentText = rule.textColor || '#b91c1c';

            return (
              <div
                key={rule.id}
                className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200 hover:border-slate-300 transition-all space-y-2.5 shadow-2xs"
              >
                {/* Condition Row */}
                <div className="flex items-center gap-1.5 flex-nowrap">
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">
                    规则 {idx + 1}：当
                  </span>

                  {/* Field Select */}
                  <select
                    value={rule.fieldId}
                    onChange={(e) => handleChangeRule(rule.id, { fieldId: e.target.value })}
                    className="h-7 px-2 text-[11.5px] bg-white border border-slate-300 rounded text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#005BAC] shrink-0 max-w-[130px] truncate"
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={rule.operator || 'contains'}
                    onChange={(e) => handleChangeRule(rule.id, { operator: e.target.value as any })}
                    className="h-7 px-1.5 text-[11.5px] bg-white border border-slate-300 rounded text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#005BAC] shrink-0"
                  >
                    <option value="contains">包含</option>
                    <option value="equals">等于</option>
                    <option value="startsWith">开头为</option>
                    <option value="notEmpty">不为空</option>
                    <option value="empty">为空</option>
                  </select>

                  {/* Value Input */}
                  {rule.operator !== 'empty' && rule.operator !== 'notEmpty' && (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => handleChangeRule(rule.id, { value: e.target.value })}
                      placeholder="匹配文本（如 进行中、P0）"
                      className="flex-1 min-w-0 h-7 px-2 text-[11.5px] bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                    />
                  )}

                  {/* Scope dropdown */}
                  <select
                    value={rule.scope}
                    onChange={(e) => handleChangeRule(rule.id, { scope: e.target.value as any })}
                    className="h-7 px-1.5 text-[11px] bg-white border border-slate-300 rounded text-slate-700 font-medium focus:outline-none cursor-pointer shrink-0"
                    title="选择填色作用范围"
                  >
                    <option value="cell">仅当前单元格</option>
                    <option value="row">高亮整行记录</option>
                  </select>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rule.id)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 cursor-pointer shrink-0 transition-colors"
                    title="删除此规则"
                  >
                    <span className="material-symbols-outlined text-[16px] block">delete</span>
                  </button>
                </div>

                {/* Color Palette Panel */}
                <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2.5">
                    {/* Tabs */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPickerTab('matrix')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            pickerTab === 'matrix'
                              ? 'bg-[#005BAC] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          多色号矩阵 (24色)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPickerTab('swatches')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            pickerTab === 'swatches'
                              ? 'bg-[#005BAC] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          工程业务色系 (16色)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPickerTab('custom')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            pickerTab === 'custom'
                              ? 'bg-[#005BAC] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          自定义调色 (HEX / 吸色)
                        </button>
                      </div>

                      <span className="text-[10.5px] font-mono text-slate-400">
                        当前色号: <strong className="text-slate-700">{currentBg.toUpperCase()}</strong>
                      </span>
                    </div>

                    {/* Tab 1: 24-Color Grid Matrix */}
                    {pickerTab === 'matrix' && (
                      <div className="space-y-1.5">
                        <div className="text-[10.5px] text-slate-500 font-medium">
                          点击任意色块立即为该规则赋值（自动适配高对比度可读文字）：
                        </div>
                        <div className="grid grid-cols-6 gap-1.5 p-1 bg-slate-50 rounded-md border border-slate-100">
                          {colorMatrixPalette.map((chip) => {
                            const isChipSelected =
                              currentBg.toLowerCase() === chip.hex.toLowerCase();
                            return (
                              <button
                                key={chip.name + chip.hex}
                                type="button"
                                onClick={() => handleApplyMatrixColor(rule.id, chip.hex, chip.name)}
                                style={{ backgroundColor: chip.hex }}
                                title={`${chip.name} (${chip.hex})`}
                                className={`h-8 rounded-md border flex items-center justify-center transition-all cursor-pointer relative group ${
                                  isChipSelected
                                    ? 'ring-2 ring-[#005BAC] border-slate-900 scale-105 shadow-sm'
                                    : 'border-slate-300 hover:scale-105 hover:shadow-xs'
                                }`}
                              >
                                {isChipSelected ? (
                                  <span
                                    className="material-symbols-outlined text-[15px] font-bold"
                                    style={{ color: chip.text }}
                                  >
                                    check
                                  </span>
                                ) : (
                                  <span
                                    className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate px-0.5"
                                    style={{ color: chip.text }}
                                  >
                                    {chip.name.slice(0, 2)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Business Color Swatches (16 色带文字标签) */}
                    {pickerTab === 'swatches' && (
                      <div className="space-y-1.5">
                        <div className="text-[10.5px] text-slate-500 font-medium">
                          经过工业工程严谨校正的标准业务色卡（点击即可应用）：
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {businessColorSwatches.map((swatch) => {
                            const isSwatchSelected =
                              currentBg.toLowerCase() === swatch.bgColor.toLowerCase() ||
                              rule.colorName === swatch.label;
                            return (
                              <button
                                key={swatch.label}
                                type="button"
                                onClick={() => handleApplyColorSwatch(rule.id, swatch)}
                                style={{
                                  backgroundColor: swatch.bgColor,
                                  color: swatch.textColor,
                                  borderColor: isSwatchSelected
                                    ? swatch.textColor
                                    : swatch.borderColor
                                }}
                                className={`h-7 px-2 rounded border flex items-center justify-between text-[11px] font-bold cursor-pointer transition-all ${
                                  isSwatchSelected
                                    ? 'ring-2 ring-[#005BAC] shadow-xs scale-102'
                                    : 'hover:opacity-90'
                                }`}
                              >
                                <span className="truncate">{swatch.label}</span>
                                {isSwatchSelected && (
                                  <span className="material-symbols-outlined text-[13px] ml-1">
                                    check
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Custom Hex & Native Color Picker */}
                    {pickerTab === 'custom' && (
                      <div className="space-y-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex items-center gap-3">
                          {/* Native color picker */}
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-600 font-medium">
                              原生色盘拾色:
                            </label>
                            <input
                              type="color"
                              value={currentBg.startsWith('#') && currentBg.length === 7 ? currentBg : '#fee2e2'}
                              onChange={(e) => handleCustomHexChange(rule.id, e.target.value)}
                              className="w-8 h-8 rounded border border-slate-300 p-0.5 cursor-pointer bg-white"
                              title="点击打开系统调色轮"
                            />
                          </div>

                          {/* Hex text input */}
                          <div className="flex items-center gap-1.5 flex-1">
                            <label className="text-[11px] text-slate-600 font-medium shrink-0">
                              HEX 色号:
                            </label>
                            <input
                              type="text"
                              value={currentBg}
                              onChange={(e) => handleCustomHexChange(rule.id, e.target.value)}
                              placeholder="#E0F2FE"
                              className="w-24 h-7 px-2 font-mono text-[11px] bg-white border border-slate-300 rounded text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-[#005BAC]"
                            />
                          </div>

                          {/* Text Color Adjustment */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] text-slate-600 font-medium shrink-0">
                              文字色:
                            </label>
                            <input
                              type="color"
                              value={currentText.startsWith('#') && currentText.length === 7 ? currentText : '#0f172a'}
                              onChange={(e) => handleChangeRule(rule.id, { textColor: e.target.value })}
                              className="w-7 h-7 rounded border border-slate-300 p-0.5 cursor-pointer bg-white"
                              title="调整前景文字颜色"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleChangeRule(rule.id, {
                                  textColor: getContrastTextColor(currentBg)
                                })
                              }
                              className="text-[10px] text-[#005BAC] hover:underline px-1 py-0.5"
                              title="根据背景亮度自动推荐最佳对比文字"
                            >
                              自动对比
                            </button>
                          </div>
                        </div>

                        {/* Interactive live preview banner */}
                        <div
                          className="p-2 rounded-md border flex items-center justify-between shadow-2xs"
                          style={{
                            backgroundColor: currentBg,
                            color: currentText,
                            borderColor: rule.borderColor || currentText + '50'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                            <span className="font-bold text-[12px]">
                              单元格渲染预览效果：Draft 预审稿 · 重点版本标注
                            </span>
                          </div>
                          <span className="font-mono text-[10.5px] opacity-80">
                            {currentBg} / {currentText}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={handleAddRule}
          className="h-7 px-3 flex items-center gap-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] font-medium cursor-pointer transition-colors shadow-2xs"
        >
          <span className="material-symbols-outlined text-[15px] text-[#005BAC]">add</span>
          <span>添加填色规则</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="h-7 px-4 bg-[#005BAC] text-white rounded text-[11.5px] font-medium hover:bg-[#004785] cursor-pointer shadow-xs transition-colors"
        >
          完成
        </button>
      </div>
    </div>
  );
};
