import React, { useState, useMemo } from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';
import { BitableIcon } from './BitableIcon';

export interface BitableFormViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  viewConfig?: BitableViewConfig;
  /**
   * 提交回调：拿到已按字段类型转换好的值。
   * 不传时表单退化为「只演示校验与成功页」，不写回数据。
   */
  onSubmit?: (values: Record<string, unknown>) => void;
}

const inputTypeOf = (col: BitableColumnConfig<any>): string => {
  if (col.type === 'number' || col.type === 'currency' || col.type === 'progress' || col.type === 'rating') return 'number';
  if (col.type === 'date') return 'date';
  if (col.type === 'url') return 'url';
  if (col.type === 'email') return 'email';
  if (col.type === 'phone') return 'tel';
  return 'text';
};

/**
 * 表单值 → 行数据。
 *
 * 表单里所有值都是字符串（受控 input 的天然形态），写入前必须按字段类型还原，
 * 否则数字列会变成 `"65"`、复选框会变成字符串 `"false"`。
 */
const coerceFormValue = (col: BitableColumnConfig<any>, raw: string): unknown => {
  const s = raw.trim();
  if (col.type === 'boolean') return s === 'true' || s === '1' || s === '是';
  if (!s) return '';
  switch (col.type) {
    case 'number':
    case 'currency': {
      const n = Number(s.replace(/,/g, '').replace(/[¥$€£]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'progress': {
      const n = Number(s.replace(/%/g, ''));
      return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
    }
    case 'rating': {
      const n = Number(s);
      return Number.isFinite(n) ? Math.min(col.maxRating || 5, Math.max(0, Math.round(n))) : null;
    }
    case 'multiSelect':
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    default:
      return s;
  }
};

export const BitableFormView = <T extends { id: string }>({
  items,
  columns,
  viewConfig,
  onSubmit
}: BitableFormViewProps<T>) => {
  const formFields = useMemo(() => {
    return (
      viewConfig?.formFields && viewConfig.formFields.length > 0
        ? viewConfig.formFields
        : columns.filter((c) => c.visible && c.type !== 'action').map((c) => c.id)
    )
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is BitableColumnConfig<T> => !!c && c.type !== 'action');
  }, [viewConfig?.formFields, columns]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedValues, setSubmittedValues] = useState<Record<string, unknown> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hoverRating, setHoverRating] = useState<{ fieldId: string; star: number } | null>(null);

  // 必填字段：视图配置里勾选的优先；未配置时默认前两个字段
  const requiredFields = useMemo(() => {
    return viewConfig?.formRequiredFields && viewConfig.formRequiredFields.length > 0
      ? formFields.filter((c) => viewConfig.formRequiredFields!.includes(c.id))
      : formFields.slice(0, 2);
  }, [viewConfig?.formRequiredFields, formFields]);

  // 计算填报进度
  const filledFieldsCount = useMemo(() => {
    return formFields.filter((c) => {
      const val = values[c.id];
      return val !== undefined && val !== null && String(val).trim() !== '';
    }).length;
  }, [formFields, values]);

  const filledRequiredCount = useMemo(() => {
    return requiredFields.filter((c) => {
      const val = values[c.id];
      return val !== undefined && val !== null && String(val).trim() !== '';
    }).length;
  }, [requiredFields, values]);

  const progressPercent = formFields.length > 0 ? Math.round((filledFieldsCount / formFields.length) * 100) : 0;

  const handleFieldChange = (fieldId: string, val: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: val }));
    if (fieldErrors[fieldId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleReset = () => {
    setValues({});
    setFieldErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    // 检查必填项
    requiredFields.forEach((c) => {
      const val = String(values[c.id] ?? '').trim();
      if (!val) {
        errors[c.id] = `请填写${c.label}`;
      }
    });

    // 检查邮箱格式
    formFields.forEach((c) => {
      const val = String(values[c.id] ?? '').trim();
      if (val && c.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[c.id] = '请输入有效的邮箱地址';
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    const payload: Record<string, unknown> = {};
    formFields.forEach((col) => {
      payload[col.id] = coerceFormValue(col, String(values[col.id] ?? ''));
    });

    if (onSubmit) {
      onSubmit(payload);
    }
    setSubmittedValues(payload);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="w-full h-full overflow-auto bg-slate-100/60 p-6 flex items-center justify-center select-none">
        <div className="w-full max-w-[560px] bg-white border border-slate-200/90 rounded-2xl shadow-sm p-8 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <BitableIcon name="task_alt" className="text-[36px]" />
          </div>
          <h3 className="text-[17px] font-bold text-slate-900">
            {viewConfig?.formSuccessText || '表单提交成功'}
          </h3>
          <p className="text-[12.5px] text-slate-500 mt-1.5 leading-relaxed">
            记录已同步保存至「{viewConfig?.name || '当前数据表'}」，可在表格或其他视图中随时查阅与流转。
          </p>

          {/* 提交明细卡片 */}
          {submittedValues && Object.keys(submittedValues).length > 0 && (
            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-left space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                已提交内容摘要
              </div>
              {formFields.slice(0, 5).map((col) => {
                const val = submittedValues[col.id];
                if (val === undefined || val === null || val === '') return null;
                return (
                  <div key={col.id} className="flex items-center justify-between text-[12px] py-0.5">
                    <span className="text-slate-500 font-medium">{col.label}</span>
                    <span className="text-slate-800 font-semibold truncate max-w-[280px]">
                      {Array.isArray(val)
                        ? val.join(', ')
                        : typeof val === 'boolean'
                        ? val ? '是' : '否'
                        : String(val)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setValues({});
                setSubmittedValues(null);
                setFieldErrors({});
                setSubmitted(false);
              }}
              className="h-9 px-5 rounded-lg bg-[#005BAC] hover:bg-[#004785] text-white text-[12.5px] font-medium shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <BitableIcon name="add" className="text-[16px]" />
              再填一份
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-slate-100/60 p-4 sm:p-6 select-none">
      <form
        onSubmit={handleSubmit}
        className="max-w-[580px] mx-auto bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden"
      >
        {/* 表单头部 */}
        <div className="relative px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-[#005BAC]/[0.07] via-sky-50/20 to-transparent">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#005BAC] text-white flex items-center justify-center shadow-xs">
                <BitableIcon name="description" className="text-[18px]" />
              </div>
              <h3 className="text-[16px] font-bold text-slate-900">{viewConfig?.name || '表单视图'}</h3>
            </div>
            {/* 填写进度标签 */}
            <div className="text-[11px] font-mono font-semibold text-slate-500 bg-white/80 px-2.5 py-1 rounded-full border border-slate-200/70 shadow-2xs">
              已填 {filledFieldsCount} / {formFields.length}
            </div>
          </div>

          <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">
            {viewConfig?.description || '请按字段逐项填写，带 * 的为必填项；提交后将直接同步至多维表。'}
          </p>

          <div className="text-[10.5px] text-slate-400 mt-2 flex items-center gap-2">
            <span>当前共 {items.length} 条记录</span>
            <span>·</span>
            <span>必填项完成度 {filledRequiredCount} / {requiredFields.length}</span>
          </div>

          {/* 顶部进度条 */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-[#005BAC] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 字段输入区 */}
        <div className="px-6 py-5 space-y-4">
          {formFields.map((col) => {
            const required = requiredFields.some((c) => c.id === col.id);
            const err = fieldErrors[col.id];
            const currentVal = values[col.id] ?? '';

            return (
              <div key={col.id} className="block">
                {/* 字段标签 */}
                <div className="flex items-center justify-between text-[12px] font-semibold text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1">
                    {col.label}
                    {required && <span className="text-rose-500 font-bold">*</span>}
                  </span>
                  {col.type === 'progress' && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {currentVal ? `${currentVal}%` : '0%'}
                    </span>
                  )}
                </div>

                {/* 各种字段类型的特化表单控件 */}
                {col.type === 'boolean' ? (
                  /* 布尔勾选框 */
                  <label className="inline-flex items-center gap-2.5 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer text-[12px] text-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentVal === 'true'}
                      onChange={(e) => handleFieldChange(col.id, e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded text-[#005BAC] accent-[#005BAC] cursor-pointer"
                    />
                    <span className="font-medium">{currentVal === 'true' ? '是 (已启用)' : '否 (未启用)'}</span>
                  </label>
                ) : col.type === 'rating' ? (
                  /* 评分控件：交互式五星打分 */
                  <div className="flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50/40">
                    {Array.from({ length: col.maxRating || 5 }).map((_, i) => {
                      const starNum = i + 1;
                      const activeRating = Number(currentVal) || 0;
                      const hovered = hoverRating?.fieldId === col.id ? hoverRating.star : null;
                      const isFilled = hovered !== null ? starNum <= hovered : starNum <= activeRating;

                      return (
                        <button
                          key={starNum}
                          type="button"
                          onMouseEnter={() => setHoverRating({ fieldId: col.id, star: starNum })}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => {
                            const next = activeRating === starNum ? '' : String(starNum);
                            handleFieldChange(col.id, next);
                          }}
                          className="p-1 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                          title={`${starNum} 星`}
                        >
                          <BitableIcon
                            name={isFilled ? 'star' : 'star_border'}
                            className={`text-[20px] transition-transform active:scale-125 ${
                              isFilled ? 'text-amber-400' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                    <span className="ml-2 text-[11px] font-mono text-slate-400">
                      {currentVal ? `${currentVal} / ${col.maxRating || 5} 分` : '点击评星'}
                    </span>
                  </div>
                ) : col.type === 'progress' ? (
                  /* 进度条控件：滑动条 + 数字 */
                  <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50/30">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={currentVal ? Number(currentVal) : 0}
                        onChange={(e) => handleFieldChange(col.id, e.target.value)}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#005BAC]"
                      />
                      <div className="relative w-16">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentVal}
                          onChange={(e) => {
                            const n = Math.min(100, Math.max(0, Number(e.target.value)));
                            handleFieldChange(col.id, String(n));
                          }}
                          placeholder="0"
                          className="w-full h-7 px-2 text-[12px] font-mono text-right bg-white border border-slate-200 rounded focus:outline-none focus:border-[#005BAC]"
                        />
                        <span className="absolute right-1.5 top-1 text-[11px] text-slate-400 pointer-events-none">%</span>
                      </div>
                    </div>
                  </div>
                ) : col.type === 'currency' ? (
                  /* 金额控件：前缀货币符号 */
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-[12.5px] font-bold text-slate-400 select-none">
                      {col.currencySymbol || '¥'}
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={currentVal}
                      onChange={(e) => handleFieldChange(col.id, e.target.value)}
                      placeholder={`请输入${col.label}`}
                      className={`w-full h-8.5 pl-7 pr-3 text-[12px] bg-white border rounded-lg focus:outline-none transition-all ${
                        err
                          ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20'
                          : 'border-slate-200 focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]'
                      }`}
                    />
                  </div>
                ) : col.type === 'multiSelect' && col.options && col.options.length > 0 ? (
                  /* 多选标签组 */
                  <div className="flex flex-wrap gap-1.5">
                    {col.options.map((o) => {
                      const picked = currentVal.split(',').filter(Boolean);
                      const checked = picked.includes(o.value);
                      return (
                        <label
                          key={o.value}
                          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11.5px] cursor-pointer transition-all ${
                            checked
                              ? 'bg-blue-50 border-[#005BAC] text-[#005BAC] font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? picked.filter((v) => v !== o.value)
                                : [...picked, o.value];
                              handleFieldChange(col.id, next.join(','));
                            }}
                            className="w-3.5 h-3.5 rounded text-[#005BAC] accent-[#005BAC] cursor-pointer"
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                ) : col.options && col.options.length > 0 ? (
                  /* 单选下拉 */
                  <select
                    value={currentVal}
                    onChange={(e) => handleFieldChange(col.id, e.target.value)}
                    className={`w-full h-8.5 px-2.5 text-[12px] bg-white border rounded-lg focus:outline-none cursor-pointer transition-all ${
                      err
                        ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20'
                        : 'border-slate-200 focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]'
                    }`}
                    aria-label={col.label}
                  >
                    <option value="">请选择{col.label}</option>
                    {col.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* 标准文本/日期/数字/邮箱/电话控件 */
                  <div className="relative flex items-center">
                    {col.type === 'email' && (
                      <BitableIcon name="mail" className="absolute left-2.5 text-slate-400 text-[14px] pointer-events-none" />
                    )}
                    {col.type === 'phone' && (
                      <BitableIcon name="phone" className="absolute left-2.5 text-slate-400 text-[14px] pointer-events-none" />
                    )}
                    {col.type === 'url' && (
                      <BitableIcon name="link" className="absolute left-2.5 text-slate-400 text-[14px] pointer-events-none" />
                    )}
                    <input
                      type={inputTypeOf(col)}
                      value={currentVal}
                      onChange={(e) => handleFieldChange(col.id, e.target.value)}
                      placeholder={`请输入${col.label}`}
                      className={`w-full h-8.5 text-[12px] bg-white border rounded-lg focus:outline-none transition-all ${
                        col.type === 'email' || col.type === 'phone' || col.type === 'url' ? 'pl-8 pr-3' : 'px-3'
                      } ${
                        err
                          ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20'
                          : 'border-slate-200 focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]'
                      }`}
                      aria-label={col.label}
                    />
                  </div>
                )}

                {/* 字段内联错误提示 */}
                {err && (
                  <div className="flex items-center gap-1 text-[11px] text-rose-500 mt-1 font-medium animate-in fade-in duration-150">
                    <BitableIcon name="error" className="text-[13px]" />
                    <span>{err}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            {onSubmit ? '提交后将自动新增一条记录至当前数据表' : '未接入写回：仅供本地校验与表单排版体验'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="h-8.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-[12px] font-medium transition-colors cursor-pointer"
            >
              清空
            </button>
            <button
              type="submit"
              className="h-8.5 px-5 rounded-lg bg-[#005BAC] hover:bg-[#004785] text-white text-[12px] font-medium cursor-pointer shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <BitableIcon name="send" className="text-[14px]" />
              <span>{viewConfig?.formSubmitText || '提交'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
