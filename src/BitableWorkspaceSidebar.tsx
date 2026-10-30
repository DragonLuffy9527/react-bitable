import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { BitableTableDef, BitableWorkspaceFolder } from './workspace';
import { isFolderDescendant } from './workspace';
import { BitableIcon } from './BitableIcon';

export interface BitableWorkspaceSidebarProps {
  /** 全部表定义 */
  tables: BitableTableDef[];
  /** 当前选中的表 id */
  activeTableId: string;
  /** 切换当前表 */
  onSelectTable: (tableId: string) => void;
  /** 新建表回调：支持所属文件夹 folderId */
  onAddTable?: (input: {
    label: string;
    icon?: string;
    description?: string;
    folderId?: string | null;
  }) => void | string;
  /** 重命名表 */
  onRenameTable?: (tableId: string, label: string) => void;
  /** 删除表 */
  onRemoveTable?: (tableId: string) => boolean | void;
  /** 调整表顺序 */
  onMoveTable?: (fromIndex: number, toIndex: number) => void;
  /** 是否折叠为窄侧边栏 */
  collapsed?: boolean;
  /** 折叠/展开切换 */
  onToggleCollapse?: () => void;
  /** 工作区名称 */
  workspaceTitle?: string;
  /** 工作区图标 */
  workspaceIcon?: string;
  /** 底部插槽 */
  extraFooter?: React.ReactNode;
  /** 外层容器附加类名 */
  className?: string;

  // —— 文件夹与多层级分组 ——
  /** 文件夹列表 */
  folders?: BitableWorkspaceFolder[];
  /** 文件夹折叠状态映射：folderId -> boolean (true 为折叠) */
  folderCollapsed?: Record<string, boolean>;
  /** 新建文件夹 */
  onAddFolder?: (input: { name: string; parentId?: string | null; icon?: string }) => void | string;
  /** 重命名文件夹 */
  onRenameFolder?: (folderId: string, name: string) => void;
  /** 删除文件夹 */
  onRemoveFolder?: (folderId: string) => void;
  /** 展开 / 收起文件夹 */
  onToggleFolderCollapse?: (folderId: string) => void;
  /** 移动数据表到指定文件夹（null 表示根目录） */
  onMoveTableToFolder?: (tableId: string, targetFolderId: string | null) => void;
  /** 移动文件夹到指定父文件夹（null 表示根目录） */
  onMoveFolderToFolder?: (folderId: string, targetFolderId: string | null) => void;
  /** 拖拽排序调整顺序 */
  onReorderItems?: (dragId: string, targetId: string, position: 'before' | 'after') => void;
  /** 当前选中的文件夹 id（可选，外部受控） */
  selectedFolderId?: string | null;
  /** 选中文件夹变化回调 */
  onSelectFolder?: (folderId: string | null) => void;
}

const PRESET_ICONS = [
  { icon: 'table_chart', label: '表格' },
  { icon: 'task_alt', label: '任务' },
  { icon: 'checklist', label: '清单' },
  { icon: 'people', label: '成员' },
  { icon: 'inventory_2', label: '资产' },
  { icon: 'event', label: '日程' },
  { icon: 'bug_report', label: '缺陷' },
  { icon: 'receipt_long', label: '订单' }
];

export const BitableWorkspaceSidebar: React.FC<BitableWorkspaceSidebarProps> = ({
  tables,
  activeTableId,
  onSelectTable,
  onAddTable,
  onRenameTable,
  onRemoveTable,
  onMoveTable,
  collapsed = false,
  onToggleCollapse,
  workspaceTitle = '工作区',
  workspaceIcon = 'space_dashboard',
  extraFooter,
  className = '',
  // 文件夹相关
  folders = [],
  folderCollapsed = {},
  onAddFolder,
  onRenameFolder,
  onRemoveFolder,
  onToggleFolderCollapse,
  onMoveTableToFolder,
  onMoveFolderToFolder,
  onReorderItems,
  selectedFolderId: controlledSelectedFolderId,
  onSelectFolder
}) => {
  // 表菜单状态
  const [activeTableMenuId, setActiveTableMenuId] = useState<string | null>(null);
  const [tableMenuPos, setTableMenuPos] = useState<{ left: number; top: number } | null>(null);

  // 文件夹菜单状态
  const [activeFolderMenuId, setActiveFolderMenuId] = useState<string | null>(null);
  const [folderMenuPos, setFolderMenuPos] = useState<{ left: number; top: number } | null>(null);

  // 表内联重命名状态
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);
  const [renameTableDraft, setRenameTableDraft] = useState('');
  const renameTableInputRef = useRef<HTMLInputElement>(null);

  // 文件夹内联重命名状态
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  // 新建表弹窗状态
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);
  const [newTableTitle, setNewTableTitle] = useState('');
  const [newTableIcon, setNewTableIcon] = useState('table_chart');
  const [newTableFolderId, setNewTableFolderId] = useState<string | null>(null);

  // 新建文件夹弹窗状态
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);

  // 删除表确认
  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null);

  // 删除文件夹确认
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  // 搜索过滤
  const [searchFilter, setSearchFilter] = useState('');

  // 当前点中/选中的文件夹 ID（支持受控/非受控）
  const [internalSelectedFolderId, setInternalSelectedFolderId] = useState<string | null>(null);
  const selectedFolderId =
    controlledSelectedFolderId !== undefined ? controlledSelectedFolderId : internalSelectedFolderId;

  const setSelectedFolderId = useCallback(
    (folderId: string | null) => {
      setInternalSelectedFolderId(folderId);
      onSelectFolder?.(folderId);
    },
    [onSelectFolder]
  );

  // 拖拽状态
  const [draggingItem, setDraggingItem] = useState<{ type: 'table' | 'folder'; id: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isOverRootDropZone, setIsOverRootDropZone] = useState(false);

  // 校验已选中的文件夹是否存在
  useEffect(() => {
    if (selectedFolderId && !folders.some((f) => f.id === selectedFolderId)) {
      setSelectedFolderId(null);
    }
  }, [folders, selectedFolderId, setSelectedFolderId]);

  // 当前选中的文件夹对象
  const selectedFolder = useMemo(
    () => (selectedFolderId ? folders.find((f) => f.id === selectedFolderId) ?? null : null),
    [folders, selectedFolderId]
  );

  // 聚焦重命名输入框
  useEffect(() => {
    if (renamingTableId && renameTableInputRef.current) {
      renameTableInputRef.current.focus();
      renameTableInputRef.current.select();
    }
  }, [renamingTableId]);

  useEffect(() => {
    if (renamingFolderId && renameFolderInputRef.current) {
      renameFolderInputRef.current.focus();
      renameFolderInputRef.current.select();
    }
  }, [renamingFolderId]);

  // 点击外部关闭悬浮菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-workspace-menu]')) return;
      setActiveTableMenuId(null);
      setTableMenuPos(null);
      setActiveFolderMenuId(null);
      setFolderMenuPos(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 组织树状层级关系
  const { folderChildrenMap, tableChildrenMap, rootFolders, rootTables } = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const fMap = new Map<string | null, BitableWorkspaceFolder[]>();
    const tMap = new Map<string | null, BitableTableDef[]>();

    folders.forEach((f) => {
      const parent = f.parentId && folderIds.has(f.parentId) ? f.parentId : null;
      if (!fMap.has(parent)) fMap.set(parent, []);
      fMap.get(parent)!.push(f);
    });

    tables.forEach((t) => {
      const parent = t.folderId && folderIds.has(t.folderId) ? t.folderId : null;
      if (!tMap.has(parent)) tMap.set(parent, []);
      tMap.get(parent)!.push(t);
    });

    return {
      folderChildrenMap: fMap,
      tableChildrenMap: tMap,
      rootFolders: fMap.get(null) ?? [],
      rootTables: tMap.get(null) ?? []
    };
  }, [folders, tables]);

  // 计算文件夹下包含的全部表数量（递归子文件夹）
  const getFolderTableCount = useCallback(
    (folderId: string): number => {
      let count = (tableChildrenMap.get(folderId) ?? []).length;
      const subFolders = folderChildrenMap.get(folderId) ?? [];
      subFolders.forEach((sub) => {
        count += getFolderTableCount(sub.id);
      });
      return count;
    },
    [tableChildrenMap, folderChildrenMap]
  );

  // 扁平化可用文件夹列表（带层级缩进标签），供选择所属文件夹下拉框使用
  const flattenedFolderOptions = useMemo(() => {
    const list: { id: string; name: string; level: number }[] = [];
    const traverse = (parentId: string | null, level: number) => {
      const subs = folderChildrenMap.get(parentId) ?? [];
      subs.forEach((sub) => {
        list.push({ id: sub.id, name: sub.name, level });
        traverse(sub.id, level + 1);
      });
    };
    traverse(null, 0);
    return list;
  }, [folderChildrenMap]);

  // 表重命名
  const startRenameTable = (table: BitableTableDef) => {
    setActiveTableMenuId(null);
    setRenamingTableId(table.id);
    setRenameTableDraft(table.label);
  };

  const commitRenameTable = (tableId: string) => {
    if (!renamingTableId) return;
    const trimmed = renameTableDraft.trim();
    if (trimmed && onRenameTable) {
      onRenameTable(tableId, trimmed);
    }
    setRenamingTableId(null);
  };

  // 文件夹重命名
  const startRenameFolder = (folder: BitableWorkspaceFolder) => {
    setActiveFolderMenuId(null);
    setRenamingFolderId(folder.id);
    setRenameFolderDraft(folder.name);
  };

  const commitRenameFolder = (folderId: string) => {
    if (!renamingFolderId) return;
    const trimmed = renameFolderDraft.trim();
    if (trimmed && onRenameFolder) {
      onRenameFolder(folderId, trimmed);
    }
    setRenamingFolderId(null);
  };

  // 提交新建表
  const handleCreateTableSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTableTitle.trim() || '未命名数据表';
    if (onAddTable) {
      onAddTable({
        label: title,
        icon: newTableIcon,
        folderId: newTableFolderId
      });
    }
    setIsAddTableModalOpen(false);
    setNewTableTitle('');
    setNewTableIcon('table_chart');
    setNewTableFolderId(null);
  };

  // 提交新建文件夹
  const handleCreateFolderSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newFolderName.trim() || '新建文件夹';
    if (onAddFolder) {
      const createdId = onAddFolder({
        name,
        parentId: newFolderParentId,
        icon: 'folder'
      });
      // 若是在折叠的文件夹下新建，自动展开该父文件夹
      if (newFolderParentId && folderCollapsed[newFolderParentId]) {
        onToggleFolderCollapse?.(newFolderParentId);
      }
      if (typeof createdId === 'string') {
        setSelectedFolderId(createdId);
      }
    }
    setIsAddFolderModalOpen(false);
    setNewFolderName('');
    setNewFolderParentId(null);
  };

  // 打开新建文件夹弹窗：未指定 parentId 时优先使用当前点中/选中的文件夹 selectedFolderId
  const openCreateFolderModal = (parentId?: string | null) => {
    setNewFolderName('新建文件夹');
    const effectiveParentId = parentId !== undefined ? parentId : selectedFolderId;
    setNewFolderParentId(effectiveParentId);
    setIsAddFolderModalOpen(true);
  };

  // 打开新建表弹窗：未指定 folderId 时优先使用当前点中/选中的文件夹 selectedFolderId
  const openCreateTableModal = (folderId?: string | null) => {
    setNewTableTitle('');
    setNewTableIcon('table_chart');
    const effectiveFolderId = folderId !== undefined ? folderId : selectedFolderId;
    setNewTableFolderId(effectiveFolderId);
    setIsAddTableModalOpen(true);
  };

  // 拖拽处理
  const handleDragStart = (
    e: React.DragEvent,
    item: { type: 'table' | 'folder'; id: string }
  ) => {
    e.stopPropagation();
    setDraggingItem(item);
    e.dataTransfer.setData('text/plain', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverFolderId(null);
    setIsOverRootDropZone(false);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingItem) return;
    if (draggingItem.type === 'folder') {
      if (isFolderDescendant(folders, draggingItem.id, folderId)) return;
    }
    setDragOverFolderId(folderId);
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingItem) return;

    if (draggingItem.type === 'table') {
      onMoveTableToFolder?.(draggingItem.id, targetFolderId);
    } else if (draggingItem.type === 'folder') {
      if (!isFolderDescendant(folders, draggingItem.id, targetFolderId)) {
        onMoveFolderToFolder?.(draggingItem.id, targetFolderId);
      }
    }
    handleDragEnd();
  };

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingItem) return;

    if (draggingItem.type === 'table') {
      onMoveTableToFolder?.(draggingItem.id, null);
    } else if (draggingItem.type === 'folder') {
      onMoveFolderToFolder?.(draggingItem.id, null);
    }
    handleDragEnd();
  };

  // 渲染单个数据表项
  const renderTableItem = (table: BitableTableDef, level: number) => {
    const isActive = table.id === activeTableId;
    const isRenaming = renamingTableId === table.id;
    const isDragging = draggingItem?.type === 'table' && draggingItem?.id === table.id;

    if (searchFilter && !table.label.toLowerCase().includes(searchFilter.toLowerCase())) {
      return null;
    }

    if (collapsed) {
      return (
        <button
          key={table.id}
          onClick={() => onSelectTable(table.id)}
          title={table.label}
          className={`relative w-9 h-9 mx-auto flex items-center justify-center rounded-lg transition-colors ${
            isActive
              ? 'bg-[#005BAC]/10 text-[#005BAC] font-medium'
              : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
          }`}
        >
          {isActive && (
            <span className="absolute left-0 top-2 bottom-2 w-1 bg-[#005BAC] rounded-r" />
          )}
          <BitableIcon name={table.icon || 'table_chart'} className="text-lg" />
        </button>
      );
    }

    return (
      <div
        key={table.id}
        draggable={!isRenaming}
        onDragStart={(e) => handleDragStart(e, { type: 'table', id: table.id })}
        onDragEnd={handleDragEnd}
        onClick={() => onSelectTable(table.id)}
        onDoubleClick={() => startRenameTable(table)}
        style={{ paddingLeft: `${10 + level * 14}px` }}
        className={`group relative flex items-center justify-between py-1.5 pr-2 rounded-lg cursor-pointer text-xs transition-colors select-none ${
          isActive
            ? 'bg-[#005BAC]/10 text-[#005BAC] font-medium'
            : 'text-slate-700 hover:bg-slate-200/70'
        } ${isDragging ? 'opacity-40 border border-dashed border-[#005BAC]' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BitableIcon
            name={table.icon || 'table_chart'}
            className={`text-lg shrink-0 ${
              isActive ? 'text-[#005BAC]' : 'text-slate-500 group-hover:text-slate-700'
            }`}
          />

          {isRenaming ? (
            <input
              ref={renameTableInputRef}
              type="text"
              value={renameTableDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameTableDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRenameTable(table.id);
                if (e.key === 'Escape') setRenamingTableId(null);
              }}
              onBlur={() => commitRenameTable(table.id)}
              className="w-full px-1.5 py-0.5 text-xs bg-white border border-[#005BAC] rounded outline-none shadow-xs text-slate-800"
            />
          ) : (
            <span className="truncate" title={table.label}>
              {table.label}
            </span>
          )}
        </div>

        {/* 悬停更多操作按钮 */}
        {!isRenaming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTableMenuPos({
                left: Math.min(window.innerWidth - 180, rect.right + 4),
                top: Math.min(window.innerHeight - 200, rect.top)
              });
              setActiveTableMenuId(table.id);
            }}
            title="表设置"
            className={`opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-300/80 text-slate-500 hover:text-slate-800 transition-opacity shrink-0 ${
              activeTableMenuId === table.id ? '!opacity-100 bg-slate-300/80 text-slate-800' : ''
            }`}
          >
            <BitableIcon name="more_vert" className="text-base" />
          </button>
        )}
      </div>
    );
  };

  // 递归渲染文件夹树
  const renderFolderItem = (folder: BitableWorkspaceFolder, level: number) => {
    const isCollapsedFolder = folderCollapsed[folder.id] ?? false;
    const isRenaming = renamingFolderId === folder.id;
    const isFolderDropTarget = dragOverFolderId === folder.id;
    const isDragging = draggingItem?.type === 'folder' && draggingItem?.id === folder.id;
    const isSelected = selectedFolderId === folder.id;
    const tableCount = getFolderTableCount(folder.id);

    const subFolders = folderChildrenMap.get(folder.id) ?? [];
    const childTables = tableChildrenMap.get(folder.id) ?? [];

    if (collapsed) {
      return (
        <div key={folder.id} className="py-1">
          {childTables.map((t) => renderTableItem(t, 0))}
        </div>
      );
    }

    return (
      <div key={folder.id} className="space-y-0.5">
        {/* 文件夹标题栏 */}
        <div
          data-testid={`folder-item-${folder.id}`}
          draggable={!isRenaming}
          onDragStart={(e) => handleDragStart(e, { type: 'folder', id: folder.id })}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverFolder(e, folder.id)}
          onDragLeave={() => {
            if (dragOverFolderId === folder.id) setDragOverFolderId(null);
          }}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          style={{ paddingLeft: `${8 + level * 14}px` }}
          className={`group relative flex items-center justify-between py-1.5 pr-2 rounded-lg cursor-pointer text-xs select-none transition-all ${
            isFolderDropTarget
              ? 'bg-blue-100/70 border border-[#005BAC] text-[#005BAC] shadow-xs'
              : isSelected
              ? 'bg-[#005BAC]/10 text-[#005BAC] font-medium ring-1 ring-[#005BAC]/30'
              : 'text-slate-700 hover:bg-slate-200/60'
          } ${isDragging ? 'opacity-40 border border-dashed border-slate-400' : ''}`}
          onClick={() => {
            if (selectedFolderId === folder.id) {
              onToggleFolderCollapse?.(folder.id);
            } else {
              setSelectedFolderId(folder.id);
              if (isCollapsedFolder) {
                onToggleFolderCollapse?.(folder.id);
              }
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRenameFolder(folder);
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* 展开/折叠三角 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFolderCollapse?.(folder.id);
              }}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer shrink-0 transition-transform"
            >
              <BitableIcon
                name={isCollapsedFolder ? 'chevron_right' : 'expand_more'}
                className="text-sm leading-none"
              />
            </button>

            {/* 文件夹图标 */}
            <BitableIcon
              name={isCollapsedFolder ? 'folder' : 'folder_open'}
              className={`text-base shrink-0 ${isSelected ? 'text-[#005BAC]' : 'text-amber-500'}`}
            />

            {/* 文件夹名 */}
            {isRenaming ? (
              <input
                ref={renameFolderInputRef}
                type="text"
                value={renameFolderDraft}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameFolderDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRenameFolder(folder.id);
                  if (e.key === 'Escape') setRenamingFolderId(null);
                }}
                onBlur={() => commitRenameFolder(folder.id)}
                className="w-full px-1.5 py-0.5 text-xs bg-white border border-[#005BAC] rounded outline-none shadow-xs text-slate-800"
              />
            ) : (
              <span
                className={`truncate ${
                  isSelected ? 'font-semibold text-[#005BAC]' : 'font-semibold text-slate-800'
                }`}
                title={folder.name}
              >
                {folder.name}
              </span>
            )}

            {/* 表格数量徽标 */}
            {!isRenaming && (
              <span className="text-[10px] text-slate-400 font-medium px-1 rounded-full bg-slate-200/60 shrink-0">
                {tableCount}
              </span>
            )}
          </div>

          {/* 悬停快速操作 */}
          {!isRenaming && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateTableModal(folder.id);
                }}
                title="在此文件夹新建表"
                className="p-0.5 rounded hover:bg-slate-300/80 text-slate-500 hover:text-slate-900"
              >
                <BitableIcon name="add" className="text-sm" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateFolderModal(folder.id);
                }}
                title="新建子文件夹"
                className="p-0.5 rounded hover:bg-slate-300/80 text-slate-500 hover:text-slate-900"
              >
                <BitableIcon name="create_new_folder" className="text-sm" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setFolderMenuPos({
                    left: Math.min(window.innerWidth - 180, rect.right + 4),
                    top: Math.min(window.innerHeight - 200, rect.top)
                  });
                  setActiveFolderMenuId(folder.id);
                }}
                title="文件夹设置"
                className="p-0.5 rounded hover:bg-slate-300/80 text-slate-500 hover:text-slate-900"
              >
                <BitableIcon name="more_vert" className="text-sm" />
              </button>
            </div>
          )}
        </div>

        {/* 展开内容：嵌套子文件夹与数据表 */}
        {!isCollapsedFolder && (
          <div className="space-y-0.5 relative">
            {/* 子文件夹递归 */}
            {subFolders.map((sub) => renderFolderItem(sub, level + 1))}

            {/* 当前文件夹内的数据表 */}
            {childTables.map((t) => renderTableItem(t, level + 1))}

            {/* 空文件夹轻量占位 */}
            {subFolders.length === 0 && childTables.length === 0 && (
              <div
                style={{ paddingLeft: `${24 + level * 14}px` }}
                className="py-1 text-[11px] text-slate-400 italic select-none"
              >
                空文件夹（可拖入表格或点击右上角+号新增）
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`relative flex flex-col h-full bg-slate-50 border-r border-slate-200 select-none transition-all duration-200 shrink-0 ${
        collapsed ? 'w-13' : 'w-64'
      } ${className}`}
    >
      {/* 头部：工作区标题与操作 */}
      <div className="flex items-center justify-between h-12 px-3 border-b border-slate-200">
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            title={`${workspaceTitle} (点击展开)`}
            className="w-8 h-8 mx-auto flex items-center justify-center rounded-md hover:bg-slate-200/80 text-slate-700 transition-colors"
          >
            <BitableIcon name={workspaceIcon} className="text-xl text-[#005BAC]" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <BitableIcon name={workspaceIcon} className="text-xl text-[#005BAC] shrink-0" />
              <span className="font-semibold text-sm text-slate-800 truncate" title={workspaceTitle}>
                {workspaceTitle}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0 font-medium">
                {tables.length}
              </span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {onAddTable && (
                <button
                  onClick={() => openCreateTableModal(selectedFolderId)}
                  title={selectedFolder ? `在「${selectedFolder.name}」下新建数据表` : '新建数据表'}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <BitableIcon name="add" className="text-lg" />
                </button>
              )}
              {onAddFolder && (
                <button
                  onClick={() => openCreateFolderModal(selectedFolderId)}
                  title={selectedFolder ? `在「${selectedFolder.name}」下新建子文件夹` : '新建文件夹'}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <BitableIcon name="create_new_folder" className="text-lg" />
                </button>
              )}
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="折叠侧边栏"
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <BitableIcon name="chevron_left" className="text-lg" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 搜索框（非折叠且表数量 >= 6 时呈现） */}
      {!collapsed && tables.length >= 6 && (
        <div className="p-2 border-b border-slate-100">
          <div className="relative">
            <BitableIcon name="search" className="absolute left-2 top-2 text-sm text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="搜索数据表..."
              className="w-full pl-7 pr-2 py-1 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]/20"
            />
          </div>
        </div>
      )}

      {/* 数据表与文件夹树 */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedFolderId(null);
          }
        }}
        onDragOver={(e) => {
          if (draggingItem) {
            e.preventDefault();
            setIsOverRootDropZone(true);
          }
        }}
        onDragLeave={() => setIsOverRootDropZone(false)}
        onDrop={handleDropOnRoot}
        className="flex-1 overflow-y-auto react-bitable-scroll p-2 space-y-1"
      >
        {/* 顶层文件夹 */}
        {rootFolders.map((folder) => renderFolderItem(folder, 0))}

        {/* 顶层数据表 */}
        {rootTables.map((table) => renderTableItem(table, 0))}

        {/* 拖入顶层引导区域（仅在拖拽且悬停到底部空白时显示） */}
        {draggingItem && isOverRootDropZone && (
          <div className="py-2 px-3 my-1 border-2 border-dashed border-[#005BAC] rounded-lg bg-blue-50/60 text-center text-[11px] text-[#005BAC] font-medium animate-in fade-in duration-100">
            放开以移出至工作区根目录
          </div>
        )}

        {tables.length === 0 && !collapsed && (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            暂无数据表，请点击下方新建
          </div>
        )}
      </div>

      {/* 底部区：并排新建数据表与新建文件夹 */}
      <div className="p-2 border-t border-slate-200 bg-white/60">
        {collapsed ? (
          <div className="space-y-1">
            {onAddTable && (
              <button
                onClick={() => openCreateTableModal(selectedFolderId)}
                title={selectedFolder ? `在「${selectedFolder.name}」下新建数据表` : '新建数据表'}
                className="w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <BitableIcon name="add" className="text-lg" />
              </button>
            )}
            {onAddFolder && (
              <button
                onClick={() => openCreateFolderModal(selectedFolderId)}
                title={selectedFolder ? `在「${selectedFolder.name}」下新建子文件夹` : '新建文件夹'}
                className="w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <BitableIcon name="create_new_folder" className="text-lg" />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {onAddTable && (
                <button
                  type="button"
                  onClick={() => openCreateTableModal(selectedFolderId)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-dashed border-slate-300 hover:border-[#005BAC] hover:bg-[#005BAC]/5 text-slate-600 hover:text-[#005BAC] text-xs font-medium transition-colors"
                  title={selectedFolder ? `在「${selectedFolder.name}」下新建数据表` : '新建数据表'}
                >
                  <BitableIcon name="add" className="text-base shrink-0" />
                  <span className="truncate">新建数据表</span>
                </button>
              )}
              {onAddFolder && (
                <div className="flex-1 flex items-center gap-0.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => openCreateFolderModal(selectedFolderId)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border border-dashed border-slate-300 hover:border-[#005BAC] hover:bg-[#005BAC]/5 text-slate-600 hover:text-[#005BAC] text-xs font-medium transition-colors truncate"
                    title={
                      selectedFolder
                        ? `点中文件夹【${selectedFolder.name}】：点击新建子文件夹`
                        : '新建文件夹'
                    }
                  >
                    <BitableIcon name="create_new_folder" className="text-base shrink-0" />
                    <span className="truncate">
                      {selectedFolder ? '新建子文件夹' : '新建文件夹'}
                    </span>
                  </button>
                  {selectedFolder && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFolderId(null);
                      }}
                      title={`取消选中「${selectedFolder.name}」（在根目录新建）`}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                    >
                      <BitableIcon name="close" className="text-xs" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {extraFooter && <div className="mt-2">{extraFooter}</div>}
          </>
        )}
      </div>

      {/* 表悬浮操作菜单 (Portal) */}
      {activeTableMenuId && tableMenuPos && (
        <TableActionMenu
          tableId={activeTableMenuId}
          tables={tables}
          folders={flattenedFolderOptions}
          position={tableMenuPos}
          onClose={() => {
            setActiveTableMenuId(null);
            setTableMenuPos(null);
          }}
          onRename={() => {
            const table = tables.find((t) => t.id === activeTableMenuId);
            if (table) startRenameTable(table);
          }}
          onMoveToFolder={(folderId) => {
            onMoveTableToFolder?.(activeTableMenuId, folderId);
            setActiveTableMenuId(null);
          }}
          onDelete={() => {
            setConfirmDeleteTableId(activeTableMenuId);
            setActiveTableMenuId(null);
          }}
        />
      )}

      {/* 文件夹悬浮操作菜单 (Portal) */}
      {activeFolderMenuId && folderMenuPos && (
        <FolderActionMenu
          folderId={activeFolderMenuId}
          position={folderMenuPos}
          onClose={() => {
            setActiveFolderMenuId(null);
            setFolderMenuPos(null);
          }}
          onAddSubTable={() => {
            openCreateTableModal(activeFolderMenuId);
            setActiveFolderMenuId(null);
          }}
          onAddSubFolder={() => {
            openCreateFolderModal(activeFolderMenuId);
            setActiveFolderMenuId(null);
          }}
          onRename={() => {
            const folder = folders.find((f) => f.id === activeFolderMenuId);
            if (folder) startRenameFolder(folder);
            setActiveFolderMenuId(null);
          }}
          onDelete={() => {
            setConfirmDeleteFolderId(activeFolderMenuId);
            setActiveFolderMenuId(null);
          }}
        />
      )}

      {/* 新建数据表弹窗 (Portal) */}
      {isAddTableModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <BitableIcon name="table_chart" className="text-lg text-[#005BAC]" />
                  <span className="font-medium text-sm text-slate-800">新建数据表</span>
                </div>
                <button
                  onClick={() => setIsAddTableModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 rounded p-1"
                >
                  <BitableIcon name="close" className="text-base" />
                </button>
              </div>

              <form onSubmit={handleCreateTableSubmit} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    表名称
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="输入数据表名称"
                    value={newTableTitle}
                    onChange={(e) => setNewTableTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]/20"
                  />
                </div>

                {/* 所属文件夹选择 */}
                {folders.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      所属文件夹
                    </label>
                    <select
                      value={newTableFolderId ?? ''}
                      onChange={(e) => setNewTableFolderId(e.target.value || null)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-[#005BAC]"
                    >
                      <option value="">根目录（顶层）</option>
                      {flattenedFolderOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {`${'　'.repeat(opt.level)}📁 ${opt.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    表图标
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_ICONS.map((item) => (
                      <button
                        key={item.icon}
                        type="button"
                        onClick={() => setNewTableIcon(item.icon)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all ${
                          newTableIcon === item.icon
                            ? 'border-[#005BAC] bg-[#005BAC]/5 text-[#005BAC] font-medium'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <BitableIcon name={item.icon} className="text-xl" />
                        <span className="text-[10px]">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddTableModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#005BAC] hover:bg-[#004785] text-white font-medium rounded-md shadow-xs transition-colors"
                  >
                    创建数据表
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 新建文件夹弹窗 (Portal) */}
      {isAddFolderModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <BitableIcon name="create_new_folder" className="text-lg text-amber-500 shrink-0" />
                  <span className="font-medium text-sm text-slate-800 truncate">
                    {newFolderParentId
                      ? `新建子文件夹（上级：${folders.find((f) => f.id === newFolderParentId)?.name ?? '已选文件夹'}）`
                      : '新建文件夹'}
                  </span>
                </div>
                <button
                  onClick={() => setIsAddFolderModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 rounded p-1 shrink-0"
                >
                  <BitableIcon name="close" className="text-base" />
                </button>
              </div>

              <form onSubmit={handleCreateFolderSubmit} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    文件夹名称
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="输入文件夹名称"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]/20"
                  />
                </div>

                {folders.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-600">
                        上级目录
                      </label>
                      {newFolderParentId && (
                        <button
                          type="button"
                          onClick={() => setNewFolderParentId(null)}
                          className="text-[11px] text-[#005BAC] hover:underline cursor-pointer"
                        >
                          改为根目录
                        </button>
                      )}
                    </div>
                    <select
                      value={newFolderParentId ?? ''}
                      onChange={(e) => setNewFolderParentId(e.target.value || null)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-[#005BAC]"
                    >
                      <option value="">根目录（顶层）</option>
                      {flattenedFolderOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {`${'　'.repeat(opt.level)}📁 ${opt.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddFolderModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#005BAC] hover:bg-[#004785] text-white font-medium rounded-md shadow-xs transition-colors"
                  >
                    {newFolderParentId ? '创建子文件夹' : '创建文件夹'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 删除表确认弹窗 (Portal) */}
      {confirmDeleteTableId &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-4 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <BitableIcon name="warning" className="text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">确定删除数据表？</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    表定义将从工作区侧边栏移除，已输入的数据保存在本地，可随时通过代码恢复。
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTableId(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onRemoveTable) onRemoveTable(confirmDeleteTableId);
                    setConfirmDeleteTableId(null);
                  }}
                  className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-xs transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 删除文件夹确认弹窗 (Portal) */}
      {confirmDeleteFolderId &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-4 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <BitableIcon name="warning" className="text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">确定删除文件夹？</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    删除文件夹不会删除其中的数据表。文件夹内的所有数据表和子文件夹将自动提升至上一级。
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFolderId(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onRemoveFolder) onRemoveFolder(confirmDeleteFolderId);
                    setConfirmDeleteFolderId(null);
                  }}
                  className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-xs transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};

// ==========================================
// 数据表操作悬浮菜单 (含「移动到文件夹」)
// ==========================================

interface TableActionMenuProps {
  tableId: string;
  tables: BitableTableDef[];
  folders: { id: string; name: string; level: number }[];
  position: { left: number; top: number };
  onClose: () => void;
  onRename: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
}

const TableActionMenu: React.FC<TableActionMenuProps> = ({
  tableId,
  tables,
  folders,
  position,
  onClose,
  onRename,
  onMoveToFolder,
  onDelete
}) => {
  const [showFolderSubmenu, setShowFolderSubmenu] = useState(false);
  const currentTable = tables.find((t) => t.id === tableId);
  const isOnlyOne = tables.length <= 1;

  return createPortal(
    <div
      data-workspace-menu="true"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 text-xs text-slate-700 animate-in fade-in duration-100"
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left transition-colors cursor-pointer"
      >
        <BitableIcon name="edit" className="text-base text-slate-500" />
        <span>重命名</span>
      </button>

      {/* 移动到文件夹 */}
      {folders.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => setShowFolderSubmenu(true)}
          onMouseLeave={() => setShowFolderSubmenu(false)}
        >
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <BitableIcon name="drive_file_move" className="text-base text-slate-500" />
              <span>移动到...</span>
            </div>
            <BitableIcon name="chevron_right" className="text-sm text-slate-400" />
          </button>

          {showFolderSubmenu && (
            <div className="absolute left-full top-0 ml-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 max-h-56 overflow-y-auto react-bitable-scroll z-50">
              <button
                type="button"
                onClick={() => {
                  onMoveToFolder(null);
                  onClose();
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  !currentTable?.folderId ? 'text-[#005BAC] font-bold bg-blue-50/50' : 'text-slate-700'
                }`}
              >
                <BitableIcon name="space_dashboard" className="text-sm text-slate-400" />
                <span>根目录</span>
              </button>

              {folders.map((f) => {
                const isSelected = currentTable?.folderId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onMoveToFolder(f.id);
                      onClose();
                    }}
                    style={{ paddingLeft: `${12 + f.level * 10}px` }}
                    className={`w-full text-left pr-3 py-1.5 text-xs hover:bg-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer truncate ${
                      isSelected ? 'text-[#005BAC] font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <BitableIcon name="folder" className="text-sm text-amber-500 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="h-px bg-slate-100 my-1" />

      <button
        disabled={isOnlyOne}
        onClick={() => {
          if (!isOnlyOne) onDelete();
          onClose();
        }}
        title={isOnlyOne ? '至少保留一张数据表' : '删除该数据表'}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
          isOnlyOne
            ? 'opacity-40 cursor-not-allowed text-slate-400'
            : 'text-rose-600 hover:bg-rose-50'
        }`}
      >
        <BitableIcon name="delete" className="text-base" />
        <span>删除表</span>
      </button>
    </div>,
    document.body
  );
};

// ==========================================
// 文件夹操作悬浮菜单
// ==========================================

interface FolderActionMenuProps {
  folderId: string;
  position: { left: number; top: number };
  onClose: () => void;
  onAddSubTable: () => void;
  onAddSubFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const FolderActionMenu: React.FC<FolderActionMenuProps> = ({
  folderId,
  position,
  onClose,
  onAddSubTable,
  onAddSubFolder,
  onRename,
  onDelete
}) => {
  return createPortal(
    <div
      data-workspace-menu="true"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 text-xs text-slate-700 animate-in fade-in duration-100"
    >
      <button
        onClick={() => {
          onAddSubTable();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left transition-colors cursor-pointer"
      >
        <BitableIcon name="add" className="text-base text-slate-500" />
        <span>新建数据表</span>
      </button>

      <button
        onClick={() => {
          onAddSubFolder();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left transition-colors cursor-pointer"
      >
        <BitableIcon name="create_new_folder" className="text-base text-slate-500" />
        <span>新建子文件夹</span>
      </button>

      <div className="h-px bg-slate-100 my-1" />

      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left transition-colors cursor-pointer"
      >
        <BitableIcon name="edit" className="text-base text-slate-500" />
        <span>重命名</span>
      </button>

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
      >
        <BitableIcon name="delete" className="text-base" />
        <span>删除文件夹</span>
      </button>
    </div>,
    document.body
  );
};
