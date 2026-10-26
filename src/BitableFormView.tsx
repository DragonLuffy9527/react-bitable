import React, { useState } from 'react';
import { BitableColumnConfig, BitableViewConfig } from './types';

interface BitableFormViewProps<T extends { id: string }> {
  items: T[];
  columns: BitableColumnConfig<T>[];
  viewConfig?: BitableViewConfig;
}

const inputTypeOf = (col: BitableColumnConfig<any>): string => {
  if (col.type === 'number') return 'number';
  if (col.type === 'date') return 'date';
  return 'text';
};

export const BitableFormView = <T extends { id: string }>({
  items,
  columns,
  viewConfig
}: BitableFormViewProps<T>) => {
  const formFields = (viewConfig?.formFields && viewConfig.formFields.length > 0
    ? viewConfig.formFields
    : columns.filter((c) => c.visible && c.type !== 'action').map((c) => c.id)
  )
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is BitableColumnConfig<T> => !!c && c.type !== 'action');

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // 必填字段：视图配置里勾选的优先；未配置时默认前两个字段
  const requiredFields =
    viewConfig?.formRequiredFields && viewConfig.formRequiredFields.length > 0
      ? formFields.filter((c) => viewConfig.formRequiredFields!.includes(c.id))
      : formFields.slice(0, 2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = requiredFields.filter((c) => !String(values[c.id] ?? '').trim()).map((c) => c.label);
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="w-full h-full overflow-auto bg-slate-100/60 p-6">
        <div className="max-w-[560px] mx-auto bg-white border border-slate-200 rounded-xl shadow-xs p-8 text-center">
          <span className="material-symbols-outlined text-[42px] text-emerald-600">task_alt</span>
          <div className="text-[15px] font-bold text-slate-900 mt-2">
            {viewConfig?.formSuccessText || '表单已提交'}
          </div>
          <div className="text-[12px] text-slate-500 mt-1">
            记录已提交至「{viewConfig?.name || '表单视图'}」，可在表格视图查看。
          </div>
          <button
            type="button"
            onClick={() => {
              setValues({});
              setSubmitted(false);
            }}
            className="mt-4 h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            再填一份
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-slate-100/60 p-6 select-none">
      <form
        onSubmit={handleSubmit}
        className="max-w-[560px] mx-auto bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
      >
        {/* Form header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-[#005BAC]/[0.06] to-transparent">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#005BAC]">description</span>
            <h3 className="text-[15px] font-bold text-slate-900">{viewConfig?.name || '表单视图'}</h3>
          </div>
          <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
            {viewConfig?.description || '请按字段逐项填写，带 * 的为必填项；提交后写入当前数据表。'}
          </p>
          <div className="text-[10.5px] text-slate-400 mt-1.5">
            当前数据表共 {items.length} 条记录 · 表单展示 {formFields.length} 个字段
          </div>
        </div>

        {/* Fields */}
        <div className="px-6 py-4 space-y-3.5">
          {formFields.map((col) => {
            const required = requiredFields.some((c) => c.id === col.id);
            return (
              <label key={col.id} className="block">
                <div className="text-[11.5px] font-medium text-slate-700 mb-1">
                  {col.label}
                  {required && <span className="text-rose-500 ml-0.5">*</span>}
                </div>
                {col.options && col.options.length > 0 ? (
                  <select
                    value={values[col.id] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [col.id]: e.target.value }))}
                    className="w-full h-8 px-2 text-[12px] bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#005BAC] cursor-pointer"
                  >
                    <option value="">请选择</option>
                    {col.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={inputTypeOf(col)}
                    value={values[col.id] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [col.id]: e.target.value }))}
                    placeholder={`请输入${col.label}`}
                    className="w-full h-8 px-2.5 text-[12px] bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#005BAC]"
                  />
                )}
              </label>
            );
          })}

          {errors.length > 0 && (
            <div className="px-2.5 py-2 rounded-md bg-rose-50 border border-rose-200 text-[11px] text-rose-700">
              请填写必填项：{errors.join('、')}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-[10.5px] text-slate-400">提交后将新增一条记录（演示环境不落库）</span>
          <button
            type="submit"
            className="h-8 px-4 rounded bg-[#005BAC] hover:bg-[#004785] text-white text-[12px] font-medium cursor-pointer transition-colors"
          >
            {viewConfig?.formSubmitText || '提交'}
          </button>
        </div>
      </form>
    </div>
  );
};
