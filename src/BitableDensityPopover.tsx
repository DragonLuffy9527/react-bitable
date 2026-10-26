import React from 'react';
import { BitableDensity } from './types';

interface BitableDensityPopoverProps {
  density: BitableDensity;
  onSelectDensity: (density: BitableDensity) => void;
  onClose: () => void;
}

export const BitableDensityPopover: React.FC<BitableDensityPopoverProps> = ({
  density,
  onSelectDensity,
  onClose
}) => {
  const options: { id: BitableDensity; label: string; desc: string; icon: string }[] = [
    {
      id: 'compact',
      label: '紧凑行高 (32px)',
      desc: '单屏展示最多记录，高效快速浏览',
      icon: 'density_small'
    },
    {
      id: 'medium',
      label: '标准行高 (40px)',
      desc: '默认舒适高度，清晰易读',
      icon: 'density_medium'
    },
    {
      id: 'relaxed',
      label: '宽松行高 (50px)',
      desc: '适合包含换行描述和多标签的记录',
      icon: 'density_large'
    }
  ];

  return (
    <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 select-none text-slate-800 text-[12px]">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="material-symbols-outlined text-[16px] text-slate-500">height</span>
          <span>行高设置</span>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-slate-600 rounded p-0.5"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      <div className="space-y-1 py-2">
        {options.map((opt) => {
          const isSelected = density === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelectDensity(opt.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between p-2 rounded transition-colors text-left ${
                isSelected
                  ? 'bg-slate-100 text-slate-900 font-medium border border-slate-200'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-slate-500">{opt.icon}</span>
                <div>
                  <div className="font-medium text-[12px]">{opt.label}</div>
                  <div className="text-[10.5px] text-slate-400">{opt.desc}</div>
                </div>
              </div>
              {isSelected && (
                <span className="material-symbols-outlined text-[16px] text-[#005BAC]">check</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
