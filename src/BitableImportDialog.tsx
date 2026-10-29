import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BitableColumnConfig, BitableFieldType } from './types';
import {
  buildImportResult,
  parseSpreadsheetFile,
  DEFAULT_MAX_IMPORT_BYTES,
  DEFAULT_MAX_IMPORT_ROWS,
  type ParsedWorkbook
} from './spreadsheet';

export type BitableImportMode = 'replace' | 'append';

export interface BitableImportPayload<T = any> {
  mode: BitableImportMode;
  sheetName: string;
  columns: BitableColumnConfig<T>[];
  rows: T[];
  fileName: string;
}

interface BitableImportDialogProps<T = any> {
  open: boolean;
  onClose: () => void;
  onImport: (payload: BitableImportPayload<T>) => void;
  /** 已有列定义。追加模式下用来提示「哪些列会并到已有字段」 */
  existingColumns?: BitableColumnConfig<T>[];
  /** 追加模式是否可选（比如首屏还没有任何数据时可以关掉） */
  allowAppend?: boolean;
  maxBytes?: number;
  maxRows?: number;
}

/** 导入时可选的目标字段类型。badge / attachment / action 这些展示型或程序型字段不开放 */
const IMPORTABLE_TYPES: { value: BitableFieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '复选框' },
  { value: 'url', label: '超链接' },
  { value: 'user', label: '人员' },
  { value: 'group', label: '群组' }
];

const TYPE_LABEL: Record<string, string> = IMPORTABLE_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<string, string>
);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 预览单元格显示：布尔用符号、空值用占位、其余直接转文本 */
function previewText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

export function BitableImportDialog<T = any>({
  open,
  onClose,
  onImport,
  existingColumns = [],
  allowAppend = true,
  maxBytes = DEFAULT_MAX_IMPORT_BYTES,
  maxRows = DEFAULT_MAX_IMPORT_ROWS
}: BitableImportDialogProps<T>) {
  const [stage, setStage] = useState<'pick' | 'preview'>('pick');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<BitableImportMode>('replace');
  const [typeOverrides, setTypeOverrides] = useState<Record<number, BitableFieldType>>({});
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 每次关闭都复位，避免下次打开还停在上一个文件的预览上
  useEffect(() => {
    if (open) return;
    setStage('pick');
    setLoading(false);
    setError(null);
    setWorkbook(null);
    setFileInfo(null);
    setSheetIndex(0);
    setHasHeader(true);
    setMode('replace');
    setTypeOverrides({});
    setDragging(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const parsed = await parseSpreadsheetFile(file, { maxBytes, maxRows });
        setWorkbook(parsed);
        setFileInfo({ name: file.name, size: file.size });
        setSheetIndex(0);
        setTypeOverrides({});
        setStage('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : '文件解析失败，请检查格式');
      } finally {
        setLoading(false);
      }
    },
    [maxBytes, maxRows]
  );

  const activeSheet = workbook?.sheets[sheetIndex];

  const result = useMemo(() => {
    if (!activeSheet) return null;
    return buildImportResult<T>(activeSheet, {
      hasHeader,
      typeOverrides,
      idPrefix: 'imp'
    });
  }, [activeSheet, hasHeader, typeOverrides]);

  /** 追加模式下，表头能对上已有字段的列会被并进去，这里提前算出来给用户看 */
  const mergeHint = useMemo(() => {
    if (mode !== 'append' || !result) return null;
    const existingLabels = new Set(existingColumns.map((c) => c.label.trim()));
    const matched = result.columns.filter((c) => existingLabels.has(c.label.trim())).length;
    return { matched, added: result.columns.length - matched };
  }, [mode, result, existingColumns]);

  if (!open) return null;

  const canConfirm = !!result && result.columns.length > 0 && !loading;

  const confirm = () => {
    if (!result || !activeSheet) return;
    onImport({
      mode,
      sheetName: activeSheet.name,
      columns: result.columns,
      rows: result.rows,
      fileName: fileInfo?.name ?? activeSheet.name
    });
    onClose();
  };

  const previewRows = result ? result.rows.slice(0, 6) : [];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="导入 Excel 为多维表"
        className="w-full max-w-[980px] max-h-[88vh] flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden text-[12px] text-slate-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-[#005BAC]">upload_file</span>
            <div>
              <div className="text-[13.5px] font-semibold text-slate-900">导入 Excel / CSV</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                上传后自动识别字段类型，可逐列调整再导入
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
            title="关闭"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto">
          {stage === 'pick' && (
            <div className="p-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-14 cursor-pointer transition-colors ${
                  dragging
                    ? 'border-[#005BAC] bg-blue-50/60'
                    : 'border-slate-300 bg-slate-50/60 hover:border-[#005BAC]/60 hover:bg-blue-50/30'
                }`}
              >
                <span className="material-symbols-outlined text-[40px] text-slate-400">
                  {loading ? 'hourglass_top' : 'cloud_upload'}
                </span>
                <div className="text-center">
                  <div className="text-[13px] font-medium text-slate-800">
                    {loading ? '正在解析…' : '把文件拖到这里，或点击选择'}
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-1">
                    支持 .xlsx / .csv / .tsv，单个文件 ≤ {formatBytes(maxBytes)}，最多 {maxRows.toLocaleString()} 行
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    老版 .xls 请先在 Excel / WPS 里另存为 .xlsx
                  </div>
                </div>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
                  <span className="material-symbols-outlined text-[16px] leading-none mt-0.5">error</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {stage === 'preview' && workbook && activeSheet && result && (
            <div className="p-5 space-y-3">
              {/* 文件信息 + 重新选择 */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[17px] text-emerald-600">description</span>
                  <span className="font-medium text-slate-800 truncate max-w-[420px]" title={fileInfo?.name}>
                    {fileInfo?.name}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {fileInfo ? formatBytes(fileInfo.size) : ''} · {activeSheet.rowCount} 行 × {activeSheet.colCount} 列
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage('pick');
                    setWorkbook(null);
                    setError(null);
                  }}
                  className="h-7 px-2.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  重新选择
                </button>
              </div>

              {/* 多工作表切换 */}
              {workbook.sheets.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 mr-1">工作表</span>
                  {workbook.sheets.map((s, i) => (
                    <button
                      key={`${s.name}_${i}`}
                      type="button"
                      onClick={() => {
                        setSheetIndex(i);
                        setTypeOverrides({});
                      }}
                      className={`h-7 px-2.5 rounded border cursor-pointer transition-colors ${
                        i === sheetIndex
                          ? 'bg-[#005BAC] text-white border-[#005BAC]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* 选项 */}
              <div className="flex items-center gap-5 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => {
                      setHasHeader(e.target.checked);
                      setTypeOverrides({});
                    }}
                    className="accent-[#005BAC] cursor-pointer"
                  />
                  <span>首行作为字段名</span>
                </label>

                <div className="flex items-center gap-3">
                  <span className="text-slate-500">导入方式</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="bitable-import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      className="accent-[#005BAC] cursor-pointer"
                    />
                    <span>替换当前表</span>
                  </label>
                  {allowAppend && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="bitable-import-mode"
                        checked={mode === 'append'}
                        onChange={() => setMode('append')}
                        className="accent-[#005BAC] cursor-pointer"
                      />
                      <span>追加记录</span>
                    </label>
                  )}
                </div>

                {mergeHint && (
                  <span className="text-[11px] text-slate-500">
                    {mergeHint.matched > 0
                      ? `${mergeHint.matched} 列并入已有字段${mergeHint.added > 0 ? `，新增 ${mergeHint.added} 列` : ''}`
                      : '表头与现有字段均不匹配，将全部新增'}
                  </span>
                )}
              </div>

              {mode === 'replace' && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                  <span className="material-symbols-outlined text-[16px] leading-none mt-0.5">warning</span>
                  <span>替换会清空当前表的记录与字段，原有筛选/排序/分组条件也会重置。可用 Ctrl+Z 撤销。</span>
                </div>
              )}

              {/* 预览表 */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-auto max-h-[320px]">
                  <table className="border-collapse text-[11.5px] w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50">
                        <th className="w-10 px-2 py-1.5 border-b border-r border-slate-200 text-slate-400 font-normal">
                          #
                        </th>
                        {result.columns.map((col, i) => (
                          <th
                            key={col.id}
                            className="px-2 py-1.5 border-b border-r border-slate-200 text-left align-top min-w-[130px]"
                          >
                            <div className="font-medium text-slate-700 truncate max-w-[160px]" title={col.label}>
                              {col.label}
                            </div>
                            <select
                              value={col.type}
                              onChange={(e) =>
                                setTypeOverrides((prev) => ({
                                  ...prev,
                                  [i]: e.target.value as BitableFieldType
                                }))
                              }
                              className="mt-1 w-full h-6 px-1 rounded border border-slate-200 bg-white text-[11px] text-slate-600 cursor-pointer"
                            >
                              {IMPORTABLE_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, rowIndex) => (
                        <tr key={String((row as any).id)} className={rowIndex % 2 ? 'bg-slate-50/40' : 'bg-white'}>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 text-slate-400 text-center">
                            {rowIndex + 1}
                          </td>
                          {result.columns.map((col) => {
                            const text = previewText((row as any)[col.id]);
                            return (
                              <td
                                key={col.id}
                                className="px-2 py-1.5 border-b border-r border-slate-100 max-w-[220px]"
                              >
                                {text ? (
                                  <span className="block truncate" title={text}>
                                    {text}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length > previewRows.length && (
                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                    仅预览前 {previewRows.length} 行，实际将导入 {result.rows.length} 行
                  </div>
                )}
              </div>

              {/* 类型统计 */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-slate-500 mr-1">识别结果</span>
                {Array.from(new Set(result.columns.map((c) => c.type))).map((t) => {
                  const count = result.columns.filter((c) => c.type === t).length;
                  return (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                    >
                      {TYPE_LABEL[t] ?? t} × {count}
                    </span>
                  );
                })}
              </div>

              {workbook.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 space-y-0.5">
                  {workbook.warnings.map((w, i) => (
                    <div key={i}>· {w}</div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
                  <span className="material-symbols-outlined text-[16px] leading-none mt-0.5">error</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50/60 shrink-0">
          <div className="text-[11px] text-slate-500 truncate">
            {stage === 'preview' && result
              ? `${result.columns.length} 个字段 · ${result.rows.length} 条记录`
              : '导入后可随时在字段配置里改类型'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-7 px-3 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className={`h-7 px-3.5 rounded font-medium text-white transition-colors ${
                canConfirm
                  ? 'bg-[#005BAC] hover:bg-[#004785] cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {mode === 'append' ? '追加导入' : '导入并替换'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
