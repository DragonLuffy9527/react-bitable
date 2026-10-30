import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BitableViewConfig, BitableViewType, BitableViewScope } from './types';
import { BitableIcon } from './BitableIcon';

interface BitableViewTabsProps {
  views: BitableViewConfig[];
  activeViewId: string;
  onSelectView: (viewId: string) => void;
  onCreateView: (name: string, viewType?: BitableViewType) => void;
  onDeleteView: (viewId: string) => void;
  onDuplicateView?: (viewId: string) => void;
  onUpdateViewConfig?: (viewId: string, updates: Partial<BitableViewConfig>) => void;
  /** 重命名视图（空名/重名不提交，由调用方决定是否提示） */
  onRenameView?: (viewId: string, newName: string) => void;
}

export const BitableViewTabs: React.FC<BitableViewTabsProps> = ({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onDeleteView,
  onDuplicateView,
  onUpdateViewConfig,
  onRenameView
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  // 下拉菜单用 fixed 定位（标签栏是 overflow-x-auto，绝对定位会被裁剪）
  const [addMenuPos, setAddMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [tabMenuPos, setTabMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  // 标签内联重命名
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // 用 ref 记录正在编辑的 id：避免 Enter 提交后 input 卸载再触发 blur 造成二次提交/覆盖
  const renamingRef = useRef<string | null>(null);
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
    { type: 'kanban', label: '看板视图', icon: 'view_kanban', desc: '按状态/专业泳道卡片流转' },
    { type: 'calendar', label: '日历视图', icon: 'calendar_month', desc: '按日期字段在月历上排布记录' },
    { type: 'gantt', label: '甘特视图', icon: 'waterfall_chart', desc: '出图进度里程碑横道图' },
    { type: 'gallery', label: '画册视图', icon: 'image', desc: '图纸大图与CAD矢量卡片画廊' },
    { type: 'form', label: '表单视图', icon: 'description', desc: '以表单形式逐项录入与提交记录' }
  ];

  const handleSelectCreateType = (type: BitableViewType, label: string) => {
    setShowAddMenu(false);
    setAddMenuPos(null);
    const count = views.filter((v) => v.viewType === type).length + 1;
    onCreateView(`${label} ${count}`, type);
  };

  // ---- 视图重命名（菜单项 / 双击标签） ----
  const startRename = (v: BitableViewConfig, isMaster: boolean) => {
    // 「总表」为系统基础视图，名称不可改（与 useBitable.renameView 保持一致）
    if (isMaster) return;
    // 已锁定视图禁止重命名：锁定保护覆盖「配置+名称」，需先在菜单中解锁
    if (v.isLocked) return;
    renamingRef.current = v.id;
    setRenameDraft(v.name);
    setRenamingId(v.id);
    setActiveMenuId(null);
    setTabMenuPos(null);
    setShowAddMenu(false);
    setAddMenuPos(null);
  };

  const cancelRename = () => {
    renamingRef.current = null;
    setRenamingId(null);
  };

  const commitRename = (viewId: string) => {
    if (renamingRef.current !== viewId) return;
    renamingRef.current = null;
    setRenamingId(null);
    const next = renameDraft.trim();
    const current = views.find((v) => v.id === viewId);
    if (!current || !next || next === current.name) return;
    onRenameView?.(viewId, next);
  };

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-between border-b border-slate-200 bg-white px-2 pt-1 select-none text-[12.5px] relative"
    >
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
        {/* Left icon / navigator */}
        <div className="px-1.5 text-slate-400 flex items-center shrink-0">
          <BitableIcon name="view_column" className="text-[16px]" />
        </div>

        {/* Tab List */}
        {views.map((v, index) => {
          const isActive = v.id === activeViewId;
          const isMaster = index === 0 || v.name === '总表';
          const isPinned = !!v.pinned; // 固定标签卡：不可删除/重命名
          const isFixed = isMaster || isPinned;
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
              title={
                isMaster
                  ? '总表 (系统基础视图，不可删除)'
                  : isPinned
                  ? `${v.name} (固定视图，不可删除)`
                  : `业务视图: ${v.name}`
              }
            >
              {/* View Icon */}
              <BitableIcon
                name={v.icon || defaultIcon}
                className={`text-[15px] ${
                  isActive ? 'text-[#005BAC]' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />

              {/* View Name（双击进入内联重命名） */}
              {renamingId === v.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  maxLength={30}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => commitRename(v.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(v.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  className="h-[22px] w-[112px] shrink-0 select-text rounded border border-[#005BAC] bg-white px-1 text-[12.5px] font-medium text-slate-800 outline-none ring-2 ring-[#005BAC]/15"
                  title="回车确认 / Esc 取消"
                />
              ) : (
                <span
                  className="truncate max-w-[130px]"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(v, isMaster);
                  }}
                  title={
                    isMaster
                      ? '总表（系统基础视图，不可重命名）'
                      : isLocked
                      ? '视图已锁定，名称不可修改（可在「⋯」菜单解锁后重命名）'
                      : '双击可重命名'
                  }
                >
                  {v.name}
                </span>
              )}

              {/* Status Badges: Lock & Personal（与「⋯」一致，悬停/菜单打开时才显现，避免页签挂满橙色小锁） */}
              {isLocked && (
                <BitableIcon
                  name="lock"
                  className={`text-[10px] text-amber-600 -ml-0.5 shrink-0 transition-opacity duration-150 ${
                    isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="此视图已锁定配置"
                />
              )}
              {isPersonal && (
                <BitableIcon
                  name="person"
                  className="text-[12px] text-sky-600 -ml-0.5 shrink-0"
                  title="个人私有视图"
                />
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
                <BitableIcon name="more_vert" className="text-[14px] block" />
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
                  {/* Rename View（总表 / 已锁定视图均不可重命名） */}
                  <button
                    type="button"
                    disabled={isMaster || isLocked}
                    onClick={() => {
                      if (isMaster || isLocked) return;
                      startRename(v, isMaster);
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${
                      isMaster || isLocked
                        ? 'text-slate-300 cursor-not-allowed'
                        : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                    title={
                      isMaster
                        ? '「总表」为系统基础视图，名称不可修改'
                        : isLocked
                        ? '视图已锁定，名称不可修改（请先解锁视图配置）'
                        : '重命名视图'
                    }
                  >
                    <BitableIcon
                      name="edit"
                      className={`text-[15px] ${isMaster || isLocked ? 'text-slate-300' : 'text-slate-400'}`}
                    />
                    <span>重命名视图</span>
                  </button>

                  {/* Duplicate View */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      onDuplicateView?.(v.id);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <BitableIcon name="content_copy" className="text-[15px] text-slate-400" />
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
                    <BitableIcon
                      name={isLocked ? 'lock_open' : 'lock'}
                      className={`text-[15px] ${isLocked ? 'text-amber-600' : 'text-slate-400'}`}
                    />
                    <span>{isLocked ? '解锁视图配置' : '锁定视图配置'}</span>
                  </button>

                  {/* Toggle Scope: Personal / Collaborative —— 总表固定协作，不可切换 */}
                  <button
                    type="button"
                    disabled={isMaster}
                    title={isMaster ? '「总表」为系统基础总表，固定为协作视图，不可改为个人视图' : undefined}
                    onClick={() => {
                      if (isMaster) return;
                      setActiveMenuId(null);
                      onUpdateViewConfig?.(v.id, {
                        scope: isPersonal ? 'collaborative' : 'personal'
                      });
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${
                      isMaster
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <BitableIcon
                      name={isMaster ? 'lock' : isPersonal ? 'public' : 'person'}
                      className={`text-[15px] ${isMaster ? 'text-slate-300' : 'text-slate-400'}`}
                    />
                    <span>{isMaster ? '总表固定协作视图' : isPersonal ? '转为协作视图' : '转为个人视图'}</span>
                  </button>

                  {/* Delete View (disabled for master / pinned views) */}
                  {!isFixed && views.length > 1 && (
                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuId(null);
                          onDeleteView(v.id);
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 text-red-600 text-left cursor-pointer font-medium"
                      >
                        <BitableIcon name="delete" className="text-[15px] text-red-500" />
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
            <BitableIcon name="add" className="text-[16px]" />
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
                    <BitableIcon
                      name={opt.icon}
                      className="text-[18px] text-slate-500 group-hover:text-[#005BAC] mt-0.5"
                    />
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
