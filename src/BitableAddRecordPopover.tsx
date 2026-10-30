import React, { useState, useRef, useEffect } from 'react';
import { BitableIcon } from './BitableIcon';

export interface BitableAddRecordPopoverProps {
  /** 当前是否有选中行（单选或复选框勾选） */
  hasSelectedRow: boolean;
  /** 确认添加回调：count 为添加行数，position 为插入位置 */
  onConfirm: (count: number, position: 'below' | 'end') => void;
  /** 关闭弹层 */
  onClose: () => void;
}

export const BitableAddRecordPopover: React.FC<BitableAddRecordPopoverProps> = ({
  hasSelectedRow,
  onConfirm,
  onClose
}) => {
  const [rowCount, setRowCount] = useState<number>(1);
  const [position, setPosition] = useState<'below' | 'end'>(
    hasSelectedRow ? 'below' : 'end'
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleConfirm = () => {
    const validCount = Math.max(1, Math.min(1000, Number(rowCount) || 1));
    const effectivePos = hasSelectedRow ? position : 'end';
    onConfirm(validCount, effectivePos);
  };

  return (
    <div
      className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3.5 select-none text-slate-800 text-[12px]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部标题与关闭 */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <BitableIcon name="add" className="text-[16px] text-[#005BAC]" />
          <span>添加记录</span>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-slate-600 rounded p-0.5 cursor-pointer transition-colors"
          title="关闭"
        >
          <BitableIcon name="close" className="text-[16px]" />
        </button>
      </div>

      <div className="space-y-3">
        {/* 行数输入 */}
        <div>
          <label className="block text-[12px] font-medium text-slate-700 mb-1">
            添加行数
          </label>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={1000}
              value={rowCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setRowCount(isNaN(val) ? 1 : Math.max(1, Math.min(1000, val)));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-[13px] text-slate-800 font-mono focus:outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]"
            />
            <span className="text-[12px] text-slate-500 shrink-0 font-medium">行</span>
          </div>

          {/* 快捷增量按钮 */}
          <div className="flex items-center gap-1.5 mt-2">
            {[1, 5, 10, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  setRowCount(num);
                  inputRef.current?.focus();
                  inputRef.current?.select();
                }}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
                  rowCount === num
                    ? 'bg-blue-50 border-[#005BAC] text-[#005BAC] font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {num}行
              </button>
            ))}
          </div>
        </div>

        {/* 插入位置选项 */}
        {hasSelectedRow ? (
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
              插入位置
            </label>
            <div className="space-y-1 bg-slate-50/70 p-1.5 rounded border border-slate-200/70">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="add-position"
                  checked={position === 'below'}
                  onChange={() => setPosition('below')}
                  className="text-[#005BAC] focus:ring-[#005BAC]"
                />
                <span className="font-medium text-slate-800 text-[12px]">在所选行后添加</span>
                <span className="text-[10.5px] text-[#005BAC] bg-blue-100/70 px-1 py-0.2 rounded font-bold ml-auto">
                  默认
                </span>
              </label>
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="add-position"
                  checked={position === 'end'}
                  onChange={() => setPosition('end')}
                  className="text-[#005BAC] focus:ring-[#005BAC]"
                />
                <span className="text-slate-700 text-[12px]">在表格末尾追加</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="p-2 rounded bg-slate-50 border border-slate-200/80 text-[11.5px] text-slate-600 flex items-start gap-1.5">
            <BitableIcon name="info" className="text-[14px] text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span>未选中任何行，将默认在</span>
              <span className="font-semibold text-slate-800">表格末尾追加</span>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-[12px] text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1 text-[12px] bg-[#005BAC] text-white hover:bg-[#004785] rounded font-medium shadow-xs cursor-pointer transition-colors"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
};
