import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SearchField } from '@/components/ui/search-field';
import { confirmAction } from '@/components/shared/confirm-store';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useSidebarStore, type SidebarPanel } from '@/stores/sidebar-store';
import { useThemeStore } from '@/stores/theme-store';
import { useProjectStore } from '@/stores/project-store';
import { AppLogo } from '@/pages/login';
import { useSettingsPanelStore } from '@/stores/settings-panel-store';
import { useT } from '@/lib/i18n';
import {
  LayoutGrid,
  Sparkles,
  Library,
  Zap,
  Settings,
  Sun,
  Moon,
  User,
  LogOut,
  ChevronUp,
  Trash2,
  Copy,
  MoreHorizontal,
  Pencil,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,

  BookOpen,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

/** URL 路径 → 面板类型的映射 */
const pathToPanel: Record<string, SidebarPanel> = {
  '/dashboard': 'dashboard',
  '/templates': 'templates',
  '/assets': 'assets',
  '/skills': 'skills',
};

/** 面板类型 → URL 路径的映射 */
const panelToPath: Record<SidebarPanel, string> = {
  dashboard: '/dashboard',
  templates: '/templates',
  assets: '/assets',
  skills: '/skills',
};

// ── 用户菜单 ─────────────────────────────────────────────────────────────────
function UserMenu({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // 计算菜单位置（定位在按钮上方）
  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      bottom: `${window.innerHeight - rect.top + 6}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: 99999,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [open]);

  // 点外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = user?.name?.[0]?.toUpperCase() || user?.account?.[0]?.toUpperCase() || 'U';

  const menuContent = open ? (
    <div
      ref={menuRef}
      className="rounded-xl border border-border bg-card shadow-xl py-1 overflow-hidden"
      style={menuStyle}
    >
      {/* 用户信息头 */}
      <div className="px-3 py-2 border-b border-border/50 mb-1">
        <p className="text-[12px] font-medium text-foreground truncate">{user?.name || user?.account}</p>
        {user?.name && <p className="text-[10px] text-muted-foreground truncate">{user?.account}</p>}
      </div>
      {/* 设置 */}
      <button
        onClick={() => { setOpen(false); onOpenSettings(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
        设置
      </button>
      {/* 使用指南 */}
      <button
        onClick={() => { setOpen(false); navigate('/guide'); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" strokeWidth={1.8} />
        使用指南
      </button>
      {/* 外观切换 */}
      <button
        onClick={() => { toggleTheme(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        {theme === 'dark'
          ? <Sun className="w-3.5 h-3.5" strokeWidth={1.8} />
          : <Moon className="w-3.5 h-3.5" strokeWidth={1.8} />
        }
        {theme === 'dark' ? '日间' : '夜间'}
      </button>
      <div className="my-1 border-t border-border/50" />
      {/* 退出 */}
      <button
        onClick={() => { setOpen(false); logout(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-500/70 hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" strokeWidth={1.8} />
        退出登录
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-muted-foreground text-[11px] font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate text-muted-foreground">{user?.name || user?.account}</p>
        </div>
        <ChevronUp className={cn('w-3 h-3 text-gray-400 transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {mounted && createPortal(menuContent, document.body)}
    </>
  );
}

// ── 主布局 ───────────────────────────────────────────────────────────────────
export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activePanel, collapsed, historyOpen, agentOpen, canvasOpen, toggleHistory, toggleAgent, toggleCanvas, setActivePanel, setCollapsed } = useSidebarStore();
  const tr = useT();
  const navItems: { key: SidebarPanel; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />, label: tr('nav.newTask') },
    { key: 'templates', icon: <Sparkles className="w-4 h-4" strokeWidth={1.8} />, label: tr('nav.templates') },
    { key: 'assets', icon: <Library className="w-4 h-4" strokeWidth={1.8} />, label: tr('nav.assets') },
    { key: 'skills', icon: <Zap className="w-4 h-4" strokeWidth={1.8} />, label: tr('nav.skills') },
  ];
  const { projects, deleteProject, duplicateProject, updateProject } = useProjectStore();
  const openSettings = useSettingsPanelStore((state) => state.openSettings);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setCollapsed]);

  // URL 变更时同步面板状态
  useEffect(() => {
    if (location.pathname.startsWith('/task/') || location.pathname.startsWith('/canvas/')) return;
    const panel = pathToPanel[location.pathname];
    if (panel && panel !== activePanel) {
      setActivePanel(panel);
    }
  }, [location.pathname]);

  const handleNav = (key: SidebarPanel) => {
    setActivePanel(key);
    navigate(panelToPath[key]);
  };

  // 当前打开的项目 id（从路径 /project/:id 提取）
  const onTaskPage = location.pathname.startsWith('/task/') || location.pathname.startsWith('/canvas/');
  const currentProjectId = onTaskPage || location.pathname.startsWith('/project/')
    ? location.pathname.split('/')[2]
    : null;

  // 侧边栏只显示当前账号的项目
  const currentUserId = useAuthStore((s) => s.user?.id);
  const filteredProjects = projects.filter((p) =>
    (!p.ownerId || p.ownerId === currentUserId) &&
    (sidebarSearch === '' || p.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
  );
  const agentProjects = filteredProjects.filter((p) => p.taskMode === 'agent');
  const canvasProjects = filteredProjects.filter((p) => p.taskMode !== 'agent');

  const renderProjectRow = (project: (typeof projects)[number]) => {
                const isCurrentProject = project.id === currentProjectId;
                return (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
                    }}
                    className={cn(
                      'group relative flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors',
                      isCurrentProject
                        ? 'bg-foreground/[0.08] text-foreground'
                        : 'text-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                    )}
                    onClick={() => {
                      // 根据 project 保存的 taskMode 恢复正确的路由参数
                      const proj = project as unknown as Record<string, unknown>;
                      const mode = (proj.taskMode as string) || '';
                      const otype = (proj.outputType as string) || '';
                      if (mode === 'agent') {
                        navigate(`/task/${project.id}?outputType=${otype || 'video'}`);
                      } else {
                        navigate(`/canvas/${project.id}`);
                      }
                    }}
                    onMouseEnter={() => setHoveredProjectId(project.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                  >
                    {renamingId === project.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            const next = renameValue.trim();
                            if (next) { updateProject(project.id, { name: next }); toast.success('已重命名'); }
                            setRenamingId(null);
                          }
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => setRenamingId(null)}
                        className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[13px] leading-snug"
                        aria-label="项目名称"
                      />
                    ) : (
                      <span className="flex-1 truncate text-[13px] leading-snug">{project.name}</span>
                    )}
                    {hoveredProjectId === project.id || openMenuId === project.id ? (
                      <DropdownMenu onOpenChange={(open) => setOpenMenuId(open ? project.id : null)}>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="项目操作"
                            title="项目操作"
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-foreground/10 text-muted-foreground flex-shrink-0"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onSelect={() => { setRenameValue(project.name); setRenamingId(project.id); }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> 重命名
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { duplicateProject(project.id); toast.success('已复制'); }}>
                            <Copy className="w-3.5 h-3.5 mr-2" /> 复制项目
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={async () => {
                              const ok = await confirmAction({
                                title: `删除项目「${project.name}」？`,
                                description: '项目及其工作流会一并删除，此操作不可恢复。',
                                confirmText: '删除', destructive: true,
                              });
                              if (!ok) return;
                              deleteProject(project.id);
                              toast.success('已删除');
                              if (isCurrentProject) navigate('/dashboard');
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除项目
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">{formatDate(project.updatedAt)}</span>
                    )}
                  </div>
                );
  };

  return (
    <div className="flex h-screen bg-background">
      {/* ===== 侧边栏（macOS 风格悬浮圆角） ===== */}
      <aside
        className={cn(
          'flex flex-col flex-shrink-0 transition-all duration-200 m-2 mr-1 rounded-xl',
          collapsed ? 'w-[52px]' : 'w-[280px]',
          'bg-sidebar/95 backdrop-blur-xl',
          'border border-black/[0.06] dark:border-white/[0.06]'
        )}
      >
        {/* Logo 即侧栏开关：折叠态点 Logo 展开，不另设展开图标 */}
        <div className="h-11 flex items-center gap-2 px-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            className="flex-shrink-0 rounded-xl transition-opacity hover:opacity-80"
          >
            <AppLogo size="sm" />
          </button>
          {!collapsed && (
            <>
              <span className="font-semibold text-[14px] tracking-tight truncate text-muted-foreground">VideoBuddy</span>
              <button
                onClick={() => setCollapsed(true)}
                className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition"
                title="收起侧边栏"
                aria-label="收起侧边栏"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* 搜索框 — 新任务上方，折叠时隐藏 */}
        {!collapsed && (
          <div className="px-2 pb-1">
            <SearchField
              value={sidebarSearch}
              onValueChange={setSidebarSearch}
              placeholder={tr('nav.search')}
              size="sm"
              variant="sidebar"
              containerClassName="w-full"
            />
          </div>
        )}

        {/* 主导航 */}
        <nav className={cn('px-2 py-1 space-y-0.5', collapsed && 'flex flex-col items-center')}>
          {navItems.map((item) => {
            const isActive = !onTaskPage && item.key === activePanel;
            return (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-2.5 py-2 rounded-md text-[14px] transition-colors w-full',
                  collapsed ? 'justify-center px-0 w-8 h-8' : 'px-3',
                  isActive
                    ? 'bg-foreground/[0.08] text-foreground font-medium'
                    : 'text-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                )}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* 历史项目：带箭头提示的可折叠主分组 */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-2 mt-5 pt-4 min-h-0">
            <button
              type="button"
              onClick={toggleHistory}
              aria-expanded={historyOpen}
              aria-label={historyOpen ? '收起任务记录' : '展开任务记录'}
              className="w-full flex items-center gap-2 px-3 mb-2 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {historyOpen
                ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
              <span>{tr('nav.history')}</span>
              <span className="ml-auto text-[11px] tabular-nums">{filteredProjects.length}</span>
            </button>
            {historyOpen && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={toggleAgent}
                aria-expanded={agentOpen}
                aria-label={agentOpen ? '收起 Agent 任务' : '展开 Agent 任务'}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {agentOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                <span>{tr('nav.agentTasks')}</span>
                <span className="ml-auto text-[11px] tabular-nums">{agentProjects.length}</span>
              </button>
              {agentOpen && (
                <div className="space-y-0.5 pl-2">
              {agentProjects.map((project) => (
                <div key={project.id}>{renderProjectRow(project)}</div>
              ))}
              {agentProjects.length === 0 && (
                <p className="px-3 py-1.5 text-[12px] text-muted-foreground">暂无 Agent 任务</p>
              )}
                </div>
              )}

              <button
                type="button"
                onClick={toggleCanvas}
                aria-expanded={canvasOpen}
                aria-label={canvasOpen ? '收起画布项目' : '展开画布项目'}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {canvasOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                <span>{tr('nav.canvasProjects')}</span>
                <span className="ml-auto text-[11px] tabular-nums">{canvasProjects.length}</span>
              </button>
              {canvasOpen && (
                <div className="space-y-0.5 pl-2">
                  {canvasProjects.map((project) => (
                    <div key={project.id}>{renderProjectRow(project)}</div>
                  ))}
                  {canvasProjects.length === 0 && (
                    <p className="px-3 py-1.5 text-[12px] text-muted-foreground">暂无画布项目</p>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* 折叠时弹性空间 */}
        {collapsed && <div className="flex-1" />}

        {/* 底部用户区 */}
        <div className="px-2 pb-3 flex-shrink-0">
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="w-8 h-8 mx-auto rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
              title="账号菜单"
            >
              <User className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          ) : (
            <UserMenu onOpenSettings={() => openSettings('profile')} />
          )}
        </div>
      </aside>

      {/* ===== 主内容区（macOS 风格悬浮圆角） ===== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>

    </div>
  );
}
