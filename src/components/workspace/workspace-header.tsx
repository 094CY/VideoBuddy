import { useState, useRef, useEffect } from 'react';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Save, Undo2, Redo2, Download, Play, Square,
  MoreHorizontal, Activity, History, MessageSquare,
  Sun, Moon, Settings, BookmarkPlus,
} from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeStore } from '@/stores/theme-store';
import { useProjectStore } from '@/stores/project-store';
import { useSettingsPanelStore } from '@/stores/settings-panel-store';
import { toast } from 'sonner';

interface WorkspaceHeaderProps {
  project: Project;
  onBack: () => void;
  hideBack?: boolean;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isExecuting: boolean;
  onExecute: () => void;
  onCancelExecution: () => void;
  onToggleExecution: () => void;
  onToggleVersions: () => void;
  onToggleComments?: () => void;
  onToggleExport?: () => void;
  canSaveAsTemplate?: boolean;
  onSaveAsTemplate?: () => void;
}

export function WorkspaceHeader({
  project,
  onBack,
  hideBack = false,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isExecuting,
  onExecute,
  onCancelExecution,
  onToggleExecution,
  onToggleVersions,
  onToggleComments,
  onToggleExport,
  canSaveAsTemplate,
  onSaveAsTemplate,
}: WorkspaceHeaderProps) {
  const { theme, toggleTheme } = useThemeStore();
  const openSettings = useSettingsPanelStore((state) => state.openSettings);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSaveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      // 空名称不落库，回退为原项目名
      setName(project.name);
      setEditing(false);
      return;
    }
    if (trimmed !== project.name) {
      useProjectStore.getState().updateProject(project.id, { name: trimmed });
      toast.success('项目已重命名');
    }
    setEditing(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-12 flex items-center justify-between px-3 flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-2">
          {!hideBack && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="返回工作台">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">返回仪表盘</TooltipContent>
            </Tooltip>
          )}

          {editing ? (
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              className="h-7 w-48 text-sm"
            />
          ) : (
            <button
              className="text-sm font-medium hover:text-foreground transition truncate max-w-[200px]"
              onClick={() => setEditing(true)}
            >
              {project.name}
            </button>
          )}
        </div>

        {/* Center */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="flex items-center gap-2">
                撤销 <kbd className="text-[10px] px-1 py-0.5 rounded bg-accent">⌘Z</kbd>
              </div>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="flex items-center gap-2">
                重做 <kbd className="text-[10px] px-1 py-0.5 rounded bg-accent">⌘⇧Z</kbd>
              </div>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Execute workflow */}
          {isExecuting ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={onCancelExecution}
            >
              <Square className="w-3 h-3 mr-1" /> 停止
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={onExecute}
                >
                  <Play className="w-3 h-3 mr-1" /> 执行
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">执行整个工作流</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 高频操作直显，其余收进「更多」 */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onSave}>
                <Save className="w-3.5 h-3.5 mr-1" /> 保存
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">保存（⌘S）</TooltipContent>
          </Tooltip>

          {canSaveAsTemplate && onSaveAsTemplate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onSaveAsTemplate}
            >
              <BookmarkPlus className="w-3.5 h-3.5 mr-1" /> 存为模板
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleExport?.()} aria-label="导出素材" title="导出素材">
                <Download className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">导出素材</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="更多操作">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onToggleExecution?.()}>
                <Activity className="w-3.5 h-3.5 mr-2" />执行面板
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleVersions?.()}>
                <History className="w-3.5 h-3.5 mr-2" />版本历史
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleComments?.()}>
                <MessageSquare className="w-3.5 h-3.5 mr-2" />批注
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === 'dark'
                  ? <Sun className="w-3.5 h-3.5 mr-2" />
                  : <Moon className="w-3.5 h-3.5 mr-2" />}
                {theme === 'dark' ? '日间模式' : '暗色模式'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSettings('models')}>
                <Settings className="w-3.5 h-3.5 mr-2" />模型与设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  );
}
