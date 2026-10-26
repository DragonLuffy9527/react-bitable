import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BitableViewConfig, BitableViewType, BitableViewScope } from './types';

interface BitableViewTabsProps {
  views: BitableViewConfig[];
  activeViewId: string;
  onSelectView: (viewId: string) => void;
  onCreateView: (name: string, viewType?: BitableViewType) => void;
  onDeleteView: (viewId: string) => void;
  onDuplicateView?: (viewId: string) => void;
  onUpdateViewConfig?: (viewId: string, updates: Partial<BitableViewConfig>) => void;
}

export const BitableViewTabs: React.FC<BitableViewTabsProps> = ({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onDeleteView,
  onDuplicateView,
  onUpdateViewConfig
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  // 下拉菜单用 fixed 定位（标签栏是 overflow-x-auto，绝对定位会被裁剪）
  const [addMenuPos, setAddMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [tabMenuPos, setTabMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  // 鼠标移开自动隐藏（180ms 缓冲，便于从触发按钮移动到菜单）
  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setShowAddMenu(false);
      setAddMenuPos(null);
      setActiveMenuId(null);
      setTabMenuPos(null);
      closeTimerRef.current = null;
    }, 180);
  };
  useEffect(() => () => cancelClose(), []);

  // Close menus on outside click
  // 注意：两个下拉菜单用 Portal 渲染到 document.body，不在 containerRef 内，
  // 若不显式放行，mousedown 会在 click 之前就卸载菜单，导致菜单项点击「无任何反应」。
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const rawTarget = e.target as Node | null;
      const el = rawTarget instanceof Element ? rawTarget : (rawTarget?.parentElement ?? null);
      if (el && el.closest('[data-bitable-view-menu]')) return;
      if (!rawTarget || !containerRef.current || !containerRef.current.contains(rawTarget)) {
        setShowAddMenu(false);
        setAddMenuPos(null);
        setActiveMenuId(null);
        setTabMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const viewTypeOptions: { type: BitableViewType; label: string; icon: string; desc: string }[] = [
    { type: 'grid', label: '表格视图', icon: 'table_chart', desc: '传统二维网格，适宜海量数据细排' },
    { type: 'kanban', label: '看板视图', icon: 'view_kanban', desc: '按状态字段分泳道的卡片流转' },
    { type: 'calendar', label: '日历视图', icon: 'calendar_month', desc: '按日期字段在月历上排布记录' },
    { type: 'gantt', label: '甘特视图', icon: 'waterfall_chart', desc: '按阶段推进的里程碑横道图' },
    { type: 'gallery', label: '画册视图', icon: 'image', desc: '封面图 + 字段摘要的卡片画廊' },
    { type: 'form', label: '表单视图', icon: 'description', desc: '以表单形式逐项录入与提交记录' }
  ];

  const handleSelectCreateType = (type: BitableViewType, label: string) => {
    setShowAddMenu(false);
    setAddMenuPos(null);
    const count = views.filter((v) => v.viewType === type).length + 1;
    onCreateView(`${label} ${count}`, type);
  };

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-between border-b border-slate-200 bg-white px-2 pt-1 select-none text-[12.5px] relative"
    >
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
        {/* Left icon / navigator */}
        <div className="px-1.5 text-slate-400 flex items-center shrink-0">
          <span className="material-symbols-outlined text-[16px]">view_column</span>
        </div>

        {/* Tab List */}
        {views.map((v, index) => {
          const isActive = v.id === activeViewId;
          const isMaster = index === 0;
          const isLocked = !!v.isLocked;
          const isPersonal = v.scope === 'personal';
          const isMenuOpen = activeMenuId === v.id;

          const defaultIcon =
            v.viewType === 'kanban'
              ? 'view_kanban'
              : v.viewType === 'gallery'
              ? 'image'
              : v.viewType === 'gantt'
              ? 'waterfall_chart'
              : v.viewType === 'calendar'
              ? 'calendar_month'
              : v.viewType === 'form'
              ? 'description'
              : isMaster
              ? 'grid_on'
              : 'table_chart';

          return (
            <div
              key={v.id}
              onClick={() => onSelectView(v.id)}
              className={`h-8 px-2.5 rounded-t-md flex items-center gap-1.5 border-t border-x cursor-pointer transition-all shrink-0 font-medium group relative ${
                isActive
                  ? 'bg-white border-slate-300 text-[#005BAC] font-semibold shadow-xs -mb-px z-10'
                  : 'bg-slate-50 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={isMaster ? '主视图（不可删除）' : `业务视图: ${v.name}`}
            >
              {/* View Icon */}
              <span
                className={`material-symbols-outlined text-[15px] ${
                  isActive ? 'text-[#005BAC]' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              >
                {v.icon || defaultIcon}
              </span>

              {/* View Name */}
              <span className="truncate max-w-[130px]">{v.name}</span>

              {/* Status Badges: Lock & Personal */}
              {isLocked && (
                <span
                  className="material-symbols-outlined text-[12px] text-amber-600 -ml-0.5 shrink-0"
                  title="此视图已锁定配置"
                >
                  lock
                </span>
              )}
              {isPersonal && (
                <span
                  className="material-symbols-outlined text-[12px] text-sky-600 -ml-0.5 shrink-0"
                  title="个人私有视图"
                >
                  person
                </span>
              )}

              {/* Tab More Options Button ('...') */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMenuOpen) {
                    setActiveMenuId(null);
                    setTabMenuPos(null);
                  } else {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setTabMenuPos({ left: Math.min(r.left, window.innerWidth - 190), top: r.bottom + 4 });
                    setActiveMenuId(v.id);
                    setShowAddMenu(false);
                  }
                }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                className={`ml-0.5 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all ${
                  isMenuOpen || isActive ? 'opacity-90' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="视图操作菜单"
              >
                <span className="material-symbols-outlined text-[14px] block">more_vert</span>
              </button>

              {/* Context Menu Dropdown（Portal 到 body，避免被表头/滚动容器遮挡） */}
              {isMenuOpen && tabMenuPos && createPortal(
                <div
                  data-bitable-view-menu="tab"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                  style={{ position: 'fixed', left: tabMenuPos.left, top: tabMenuPos.top, zIndex: 9999 }}
                  className="w-44 bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-slate-700 text-[11.5px] animate-in fade-in zoom-in-95 duration-100"
                >
                  {/* Duplicate View */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      onDuplicateView?.(v.id);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] text-slate-400">content_copy</span>
                    <span>复制视图</span>
                  </button>

                  {/* Toggle Lock */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      onUpdateViewConfig?.(v.id, { isLocked: !isLocked });
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[15px] ${isLocked ? 'text-amber-600' : 'text-slate-400'}`}>
                      {isLocked ? 'lock_open' : 'lock'}
                    </span>
                    <span>{isLocked ? '解锁视图配置' : '锁定视图配置'}</span>
                  </button>

                  {/* Toggle Scope: Personal / Collaborative */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      onUpdateViewConfig?.(v.id, {
                        scope: isPersonal ? 'collaborative' : 'personal'
                      });
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] text-slate-400">
                      {isPersonal ? 'public' : 'person'}
                    </span>
                    <span>{isPersonal ? '转为协作视图' : '转为个人视图'}</span>
                  </button>

                  {/* Delete View (disabled for master view) */}
                  {!isMaster && views.length > 1 && (
                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuId(null);
                          onDeleteView(v.id);
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 text-red-600 text-left cursor-pointer font-medium"
                      >
                        <span className="material-symbols-outlined text-[15px] text-red-500">delete</span>
                        <span>删除视图</span>
                      </button>
                    </div>
                  )}
                </div>,
                document.body
              )}
            </div>
          );
        })}

        {/* Add View Dropdown Trigger */}
        <div className="relative shrink-0" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <button
            type="button"
            onClick={(e) => {
              if (showAddMenu) {
                setShowAddMenu(false);
                setAddMenuPos(null);
              } else {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setAddMenuPos({ left: Math.min(r.left, window.innerWidth - 230), top: r.bottom + 4 });
                setShowAddMenu(true);
                setActiveMenuId(null);
              }
            }}
            className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            title="新建视图"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>

          {/* Feishu Add View Dropdown Menu（Portal 到 body） */}
          {showAddMenu && addMenuPos && createPortal(
            <div
              data-bitable-view-menu="add"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              style={{ position: 'fixed', left: addMenuPos.left, top: addMenuPos.top, zIndex: 9999 }}
              className="w-56 bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 text-[12px] animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">
                基础视图
              </div>
              <div className="space-y-0.5">
                {viewTypeOptions.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleSelectCreateType(opt.type, opt.label)}
                    className="w-full p-2 flex items-start gap-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors cursor-pointer group"
                  >
                    <span className="material-symbols-outlined text-[18px] text-slate-500 group-hover:text-[#005BAC] mt-0.5">
                      {opt.icon}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800 group-hover:text-[#005BAC]">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
};
