import { confirmAction } from '@/components/shared/confirm-store';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useModelStore } from '@/stores/model-store';
import { PROTOCOLS, getProtocol, SERVICE_PRESETS, getServicePreset } from '@/config/model-catalog';
import { useTeamStore } from '@/stores/team-store';
import { useUsageStore } from '@/stores/usage-store';
import { useProjectStore } from '@/stores/project-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { GuidePage } from '@/pages/guide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  X,
  Cpu,
  Users,
  User,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Crown,
  BarChart3,
  Lock,
  UserPlus,
  Copy,
  Download,
  Upload,
  HardDrive,
  BookOpen,
  ToggleRight,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useT, useLocaleStore, type Locale } from '@/lib/i18n';
import { ManagedServicesSettings } from '@/components/workspace/managed-services-settings';
import { LocalModelsSettings } from '@/components/workspace/local-models-settings';
import type { ModelType } from '@/types';

/** 允许出现在 URL 里的分区。非法值一律回退到「个人」 */
const SETTINGS_SECTIONS = ['profile', 'accounts', 'models', 'team', 'usage', 'data', 'guide'] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function normalizeSection(raw: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.includes(raw as SettingsSection) ? (raw as SettingsSection) : 'profile';
}

export function SettingsPage({ onClose, initialSection }: {
  onClose?: () => void;
  initialSection?: SettingsSection;
}) {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin());

  // 两种使用场景：
  // 1) 独立页（/settings/models）— 分区由 URL 决定，刷新后保持在当前分区
  // 2) 弹窗（MainLayout 内点击头像）— 不侵入地址栏，用本地 state
  const tr = useT();
  const routeParams = useParams();
  const isModal = Boolean(onClose);
  const urlSection = normalizeSection((routeParams['*'] || '').split('/')[0]);
  const [modalSection, setModalSection] = useState<SettingsSection>(initialSection ?? 'profile');

  // 从画布点「去配置」时指定分区，弹窗复用期间要跟随切换
  useEffect(() => {
    if (initialSection) setModalSection(initialSection);
  }, [initialSection]);

  // 非管理员访问账号分区时回退到个人分区
  let activeSection: SettingsSection = isModal ? modalSection : urlSection;
  if (activeSection === 'accounts' && !isAdmin) activeSection = 'profile';

  const selectSection = (key: string) => {
    if (isModal) {
      setModalSection(normalizeSection(key));
      return;
    }
    navigate(`/settings/${key}`, { replace: true });
  };

  const handleClose = () => {
    if (onClose) { onClose(); return; }
    // 独立页返回来源页面
    if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
  };

  // 基础导航项
  const navItems = [
    { label: '个人', icon: <User className="w-4 h-4" />, key: 'profile' },
    ...(isAdmin ? [{ label: '账号', icon: <UserPlus className="w-4 h-4" />, key: 'accounts' }] : []),
    // 模型与密钥统一在模型分区管理
    { label: '模型 & Key', icon: <Cpu className="w-4 h-4" />, key: 'models' },
    { label: '团队', icon: <Users className="w-4 h-4" />, key: 'team' },
    { label: '用量', icon: <BarChart3 className="w-4 h-4" />, key: 'usage' },
    { label: '数据迁移', icon: <HardDrive className="w-4 h-4" />, key: 'data' },
    { label: '使用指南', icon: <BookOpen className="w-4 h-4" />, key: 'guide' },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border/40 flex-shrink-0">
        <span className="font-semibold text-[14px]">{tr('settings.title')}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          {onClose ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Settings sidebar */}
        <nav className="w-48 p-3 space-y-1 flex-shrink-0 border-r border-border/30 overflow-y-auto">
          <SettingsNav items={navItems} active={activeSection} onSelect={selectSection} />
        </nav>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeSection === 'profile' && <ProfileSettings />}
          {activeSection === 'accounts' && (isAdmin ? <AccountManagement /> : <NoPermission />)}
          {activeSection === 'models' && <ModelSettings />}
          {activeSection === 'team' && <TeamSettings />}
          {activeSection === 'usage' && <UsageSettings />}
          {activeSection === 'data' && <DataMigration />}
          {activeSection === 'guide' && <GuidePage />}
        </div>
      </div>
    </div>
  );
}

/** 无权限提示组件 */
function NoPermission() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Shield className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">此功能仅限主管理员使用</p>
      <p className="text-xs text-muted-foreground mt-1">
        如需进行账号管理，请联系主管理员
      </p>
    </div>
  );
}

function SettingsNav({ items, active, onSelect }: {
  items: { label: string; icon: React.ReactNode; key: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onSelect(item.key)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
            active === item.key
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </>
  );
}

function ProfileSettings() {
  const { user, updateUser } = useAuthStore();
  const locale = useLocaleStore((st) => st.locale);
  const setLocale = useLocaleStore((st) => st.setLocale);
  const [sessions, setSessions] = useState<Array<{ key: string; expiresAt: number }>>([]);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  useEffect(() => {
    void fetch('/api/auth/sessions', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => setSessions(d.sessions || []))
      .catch(() => toast.error('登录会话加载失败'));
  }, []);
  const revoke = async (key: string) => {
    try {
      const res = await fetch(`/api/auth/sessions/${encodeURIComponent(key)}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) { toast.error('注销失败'); return; }
      setSessions((list) => list.filter((item) => item.key !== key));
      toast.success('会话已注销');
    } catch {
      toast.error('注销失败，请检查网络连接');
    }
  };

  const [name, setName] = useState(user?.name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPassword.trim()) {
      toast.error('请输入原密码');
      return;
    }
    if (!newPassword.trim()) {
      toast.error('请输入新密码');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(newPassword)) {
      toast.error('新密码至少 10 位，且需同时包含字母与数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    setChangingPwd(true);
    try {
      const { changeOwnPassword } = await import('@/lib/session');
      await changeOwnPassword(oldPassword, newPassword);
      toast.success('密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="space-y-5">

      <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">界面语言</p>
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="zh">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">登录会话（{sessions.length}）</p>
            <Button variant="ghost" size="sm" className="h-6 text-[11px]"
              onClick={() => setSessionsExpanded((v) => !v)}>
              {sessionsExpanded ? '收起' : '管理'}
            </Button>
          </div>
          {sessionsExpanded && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-1">
              {sessions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">暂无其他会话</p>
              ) : sessions.map((item) => (
                <div key={item.key} className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>有效期至 {new Date(item.expiresAt).toLocaleString()}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => void revoke(item.key)}>
                    注销
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">管理你的个人信息和登录密码</p>

      {/* 用户信息 */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 pb-4 border-b border-border/30">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.account}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">用户名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={async () => {
            try {
              const { updateOwnProfile } = await import('@/lib/session');
              await updateOwnProfile(name);
              updateUser({ name });
              toast.success('资料已更新');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : '保存失败');
            }
          }}
        >
          保存修改
        </Button>
      </div>

      {/* 修改密码 */}
      <div className="pt-2 space-y-3 border-t border-border/30">
        <div className="flex items-center gap-2 pt-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">修改密码</span>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">原密码</Label>
          <div className="relative">
            <Input
              type={showOldPwd ? 'text' : 'password'}
              placeholder="请输入原密码"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="pr-10 h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setShowOldPwd(!showOldPwd)}
            >
              {showOldPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">新密码</Label>
          <div className="relative">
            <Input
              type={showNewPwd ? 'text' : 'password'}
              placeholder="至少 10 位，含字母与数字"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pr-10 h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setShowNewPwd(!showNewPwd)}
            >
              {showNewPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">确认新密码</Label>
          <Input
            type="password"
            placeholder="再次输入新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
            className="h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleChangePassword}
          disabled={changingPwd}
        >
          {changingPwd ? '修改中...' : '修改密码'}
        </Button>
      </div>
    </div>
  );
}

// ==================== Account Management ====================
function AccountManagement() {

  const downloadAudit = async () => {
    try {
    const res = await fetch('/api/admin/audit', { credentials: 'include' });
    if (!res.ok) { toast.error('审计日志读取失败'); return; }
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.entries || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'videobuddy-audit.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('审计日志读取失败，请检查网络连接'); }
  };
  const showBackups = async () => {
    try {
      const res = await fetch('/api/admin/backups', { credentials: 'include' });
      if (!res.ok) { toast.error('备份列表读取失败'); return; }
      const data = await res.json() as { files?: string[] };
      toast.info(`服务端自动备份 ${data.files?.length || 0} 份，位于数据目录 backups/`);
    } catch { toast.error('备份列表读取失败，请检查网络连接'); }
  };
  const [users, setUsers] = useState<Array<{
    id: string; account: string; name: string; role: 'admin' | 'member';
  }>>([]);
  const [resetUserId, setResetUserId] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAccount, setNewMemberAccount] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [resetAccount, setResetAccount] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const { fetchUsers } = await import('@/lib/session');
      setUsers(await fetchUsers());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '无法获取成员列表');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { void refreshUsers(); }, [refreshUsers]);
  const [resetPassword, setResetPassword] = useState('');
  const [, forceUpdate] = useState(0);

  const accounts = users;
  if (loadingUsers) return <p className="text-xs text-muted-foreground py-8 text-center">正在加载成员…</p>;

  const handleCreate = async () => {
    if (!newMemberName.trim() || !newMemberAccount.trim() || !newMemberPassword.trim()) {
      toast.error('请填写完整信息');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(newMemberPassword)) {
      toast.error('密码至少 10 位，且需同时包含字母与数字');
      return;
    }
    try {
      const { createUserOnServer } = await import('@/lib/session');
      await createUserOnServer({
        account: newMemberAccount, name: newMemberName, password: newMemberPassword,
      });
      toast.success(`账号 ${newMemberAccount} 创建成功`);
      await refreshUsers();
      setShowCreateDialog(false);
      setNewMemberName('');
      setNewMemberAccount('');
      setNewMemberPassword('');
      forceUpdate((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDelete = async (id: string, account: string) => {
    const ok = await confirmAction({
      title: `删除账号 ${account}？`,
      description: '该账号的全部项目、素材、模板与产物会被永久删除，无法恢复。删除前会先自动下载一份归档。',
      confirmText: '删除并归档',
      destructive: true,
    });
    if (!ok) return;
    try {
      // 删除前先导出归档；归档失败则中止删除
      const archive = await fetch(`/api/admin/users/${encodeURIComponent(id)}/export`, {
        credentials: 'include',
      });
      if (!archive.ok) throw new Error('归档下载失败，已取消删除');
      const blob = await archive.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `videobuddy-archive-${account}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const { deleteUserOnServer } = await import('@/lib/session');
      await deleteUserOnServer(id);
      toast.success('账号已删除');
      await refreshUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleResetPassword = async () => {
    if (!/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(resetPassword)) {
      toast.error('新密码至少 10 位，且需同时包含字母与数字');
      return;
    }
    try {
      const { resetUserPasswordOnServer } = await import('@/lib/session');
      await resetUserPasswordOnServer(resetUserId, resetPassword);
      toast.success('密码已重置');
      setShowResetDialog(false);
      setResetAccount('');
      setResetPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    }
  };

  const copyCredentials = async (account: string, name: string) => {
    const text = `账号：${account}\n姓名：${name}`;
    try {
      // 优先使用 Clipboard API（需要 HTTPS / 安全上下文）
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback：使用 textarea + execCommand 兼容非安全上下文
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('账号信息已复制到剪贴板');
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void downloadAudit()}>
          下载审计日志
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void showBackups()}>
          查看自动备份
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">为团队成员创建和管理登录账号</p>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> 创建账号
        </Button>
      </div>

      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40">
        <Shield className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          您是主管理员，拥有创建/删除成员账号和重置密码的权限。
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UserPlus className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">暂无团队成员账号</p>
          <p className="text-xs text-muted-foreground mt-1">
            点击"创建账号"为团队成员开通登录权限
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const isAdminAccount = account.role === 'admin';
            return (
              <div
                key={account.id}
                className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 border border-border"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{account.name}</p>
                      {isAdminAccount && (
                        <Badge variant="secondary" className="text-[11px] text-amber-400">
                          <Crown className="w-3 h-3 mr-0.5" /> 主管理员
                        </Badge>
                      )}
                      {!isAdminAccount && (
                        <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                          成员
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{account.account}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="复制账号信息"
                    onClick={() => copyCredentials(account.account, account.name)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  {!isAdminAccount && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="重置密码"
                        onClick={() => {
                          setResetAccount(account.account);
                          setResetUserId(account.id);
                          setResetPassword('');
                          setShowResetDialog(true);
                        }}
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300"
                        title="删除账号"
                        onClick={() => handleDelete(account.id, account.account)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create account dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>创建成员账号</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                placeholder="例如：张三"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>账号</Label>
              <Input
                type="text"
                autoComplete="off"
                placeholder="邮箱、手机号或名称均可"
                value={newMemberAccount}
                onChange={(e) => setNewMemberAccount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="至少 10 位，含字母与数字"
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPwd(!showPwd)}
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreate}>创建账号</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              为 <span className="text-foreground font-medium">{resetAccount}</span> 重置登录密码
            </p>
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input
                type="text"
                placeholder="至少 10 位，含字母与数字"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResetDialog(false)}>取消</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleResetPassword}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ModelSettings() {
  const {
    services, customModels, defaultModels,
    addService, removeService, addCustomModel, removeCustomModel, setDefaultModel,
  } = useModelStore();

  const [showServiceForm, setShowServiceForm] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcProtocol, setSvcProtocol] = useState(PROTOCOLS[0].id);
  const [svcBaseUrl, setSvcBaseUrl] = useState('');
  const [svcApiKey, setSvcApiKey] = useState('');
  const [localPresetId, setLocalPresetId] = useState('');
  const applyLocalPreset = (id: string) => {
    setLocalPresetId(id);
    const p = getServicePreset(id);
    if (!p?.baseUrl) return;
    setSvcName(p.name);
    setSvcProtocol(p.protocol);
    setSvcBaseUrl(p.baseUrl);
  };

  const [showModelForm, setShowModelForm] = useState(false);
  const [modelServiceId, setModelServiceId] = useState('');
  const [modelId, setModelId] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState<ModelType>('text');
  const [busy, setBusy] = useState(false);


  const typeLabel: Record<ModelType, string> = {
    text: '文本', image: '图片', video: '视频', audio: '音频',
  };

  const handleAddService = async () => {
    if (!svcBaseUrl.trim() || !svcApiKey.trim()) {
      toast.error('请填写服务地址与 API Key');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(svcBaseUrl.trim());
    } catch {
      toast.error('服务地址格式无效，请填写完整的 URL');
      return;
    }
    if (parsed.protocol !== 'https:') {
      toast.error('服务地址必须使用 HTTPS');
      return;
    }
    setBusy(true);
    try {
      // 代理只放行用户显式注册的地址；内置预设仅作为填写辅助
      const { registerServiceHosts } = await import('@/lib/session');
      await registerServiceHosts([parsed.toString()]);
      addService(svcName, svcProtocol, svcBaseUrl.trim(), svcApiKey.trim());
      toast.success('服务已添加');
      setShowServiceForm(false);
      setSvcName(''); setSvcBaseUrl(''); setSvcApiKey('');
      setModelServiceId(useModelStore.getState().services.at(-1)?.id || '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const handleAddModel = () => {
    if (!modelServiceId) { toast.error('请先选择服务'); return; }
    const result = addCustomModel(modelServiceId, modelId, modelName, modelType);
    if (!result.ok) { toast.error(result.error || '添加失败'); return; }
    toast.success('模型已添加，可设为默认或在节点中选用');
    setShowModelForm(false);
    setModelId(''); setModelName('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
        <span>当前默认</span>
        {(Object.keys(typeLabel) as ModelType[]).map((t) => (
          <span key={t} className="rounded-md bg-muted px-2 py-1">
            {typeLabel[t]}：{defaultModels[t]?.model || '未设置'}
          </span>
        ))}
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">本地模型</TabsTrigger>
          <TabsTrigger value="personal">个人云端</TabsTrigger>
          <TabsTrigger value="team">团队共享</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="mt-4">
          <LocalModelsSettings />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <ManagedServicesSettings />
        </TabsContent>

        <TabsContent value="personal" className="mt-4 space-y-5">
      {/* 服务 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">服务</h3>

          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setShowServiceForm(!showServiceForm)}>
            <Plus className="w-3 h-3" /> 添加服务
          </Button>
        </div>

        {showServiceForm && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">从接入预设快速填入</Label>
              <Select value={localPresetId} onValueChange={applyLocalPreset}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择服务商，自动填好协议与地址" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">预设自动填入公开接入地址与协议。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">服务名称</Label>
                <Input value={svcName} onChange={(e) => setSvcName(e.target.value)}
                  placeholder="例如：团队网关" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">接口协议</Label>
                <Select value={svcProtocol} onValueChange={setSvcProtocol}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROTOCOLS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">接口地址（HTTPS）</Label>
              <Input value={svcBaseUrl} onChange={(e) => setSvcBaseUrl(e.target.value)}
                placeholder={getProtocol(svcProtocol)?.baseUrlHint || 'https://your-endpoint.example.com/v1'}
                className="h-8 text-sm font-mono" />
              <p className="text-[11px] text-muted-foreground">
                填写 API 根路径，平台自动拼接 {getProtocol(svcProtocol)?.endpoints?.text} 等端点
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <Input type="password" value={svcApiKey} onChange={(e) => setSvcApiKey(e.target.value)}
                placeholder="粘贴服务商提供的密钥" className="h-8 text-sm" />
              <p className="text-xs text-muted-foreground">
                {getProtocol(svcProtocol)?.authHint}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void handleAddService()}>
                {busy ? '保存中…' : '保存服务'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setShowServiceForm(false)}>取消</Button>
            </div>
          </div>
        )}

        {services.length === 0 ? (
          <EmptyBlock text="还没有服务。添加后才能配置模型。" />
        ) : (
          <div className="space-y-2">
            {services.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.baseUrl}</p>
                  <p className="text-xs text-muted-foreground">
                    {getProtocol(s.protocol)?.name || s.protocol} · 密钥 {s.apiKeyMasked}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                  title="删除服务"
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: `删除服务「${s.name}」？`,
                      description: '该服务下的所有模型也会被移除。',
                      confirmText: '删除', destructive: true,
                    });
                    if (ok) { removeService(s.id); toast.success('服务已删除'); }
                  }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 模型 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">模型</h3>

          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            disabled={services.length === 0}
            onClick={() => { setModelServiceId(services[0]?.id || ''); setShowModelForm(!showModelForm); }}>
            <Plus className="w-3 h-3" /> 添加模型
          </Button>
        </div>

        {showModelForm && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">所属服务</Label>
                <Select value={modelServiceId} onValueChange={setModelServiceId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择服务" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">能力类型</Label>
                <Select value={modelType} onValueChange={(v) => setModelType(v as ModelType)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(typeLabel) as ModelType[]).map((t) => (
                      <SelectItem key={t} value={t}>{typeLabel[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">模型 ID</Label>
                <Input value={modelId} onChange={(e) => setModelId(e.target.value)}
                  placeholder="按服务商文档填写" className="h-8 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">显示名（可留空）</Label>
                <Input value={modelName} onChange={(e) => setModelName(e.target.value)}
                  placeholder="便于识别的名称" className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleAddModel}>确认添加</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setShowModelForm(false)}>取消</Button>
            </div>
          </div>
        )}

        {customModels.length === 0 ? (
          <EmptyBlock text="还没有模型。添加后即可在画布节点中选用。" />
        ) : (
          <div className="space-y-2">
            {customModels.map((m) => (
              <div key={`${m.serviceId}::${m.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono">{m.id}</p>
                  <p className="text-xs text-muted-foreground">{m.serviceName} · {typeLabel[m.type]}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(['text', 'image', 'video', 'audio'] as ModelType[])
                    .filter((t) => t === m.type)
                    .map((t) => (
                      <Button key={t} variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => { setDefaultModel(t, m.protocolId, m.id, m.serviceId); toast.success(`已设为默认${typeLabel[t]}模型`); }}>
                        设为默认
                      </Button>
                    ))}
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="删除模型"
                    onClick={() => { removeCustomModel(m.serviceId, m.id); toast.success('模型已移除'); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * 团队记录。
 * 数据只保存在当前账号的工作区，不产生跨账号共享，也没有邀请落地页。
 * 这里如实呈现「本机成员台账」这一定位，不提供无法生效的邀请链接。
 */
function TeamSettings() {
  const { teams, createTeam, deleteTeam, addMember, removeMember, getMembers } = useTeamStore();
  const currentUserId = useAuthStore((s) => s.user?.id || 'local');
  const [teamName, setTeamName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = teams.find((t) => t.id === selectedId) || teams[0];
  const members = selected ? getMembers(selected.id) : [];

  const handleCreateTeam = () => {
    const trimmed = teamName.trim();
    if (!trimmed) return;
    const team = createTeam(trimmed, currentUserId, {
      id: currentUserId, account: currentUserId, name: '我', createdAt: '',
    } as never);
    setTeamName('');
    setSelectedId(team.id);
    toast.success('团队已创建');
  };

  const handleAddMember = () => {
    const trimmed = memberName.trim();
    if (!trimmed || !selected) return;
    addMember(selected.id, {
      id: `local-${Date.now()}`, account: trimmed, name: trimmed, createdAt: '',
    } as never, 'editor');
    setMemberName('');
    toast.success('成员记录已添加（仅当前账号可见）');
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        团队与成员是保存在当前账号的台账，用于标注项目归属与角色。数据不会同步给其他账号，
        平台不发送邀请、也不提供可加入团队的链接。项目与素材仍按账号隔离。
      </p>

      <div className="flex items-center gap-2">
        <Input
          placeholder="新建团队名称"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8 text-xs" onClick={handleCreateTeam}>新建团队</Button>
      </div>

      {teams.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">暂无团队记录</p>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className={`p-3 rounded-lg cursor-pointer transition ${
                selected?.id === team.id ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
              onClick={() => setSelectedId(team.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{team.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {getMembers(team.id).length} 位成员记录
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirmAction({
                      title: `删除团队「${team.name}」？`,
                      description: '成员记录会一并移除，不影响任何项目数据。',
                      confirmText: '删除', destructive: true,
                    });
                    if (!ok) return;
                    deleteTeam(team.id);
                    if (selectedId === team.id) setSelectedId(null);
                    toast.success('团队已删除');
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-medium">{selected.name} · 成员记录</p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="成员名称或账号"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleAddMember}>添加</Button>
          </div>
          {members.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">暂无成员记录</p>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
                  <div>
                    <p className="text-xs font-medium">{m.user.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.role}</p>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { removeMember(selected.id, m.userId); toast.success('已移除成员记录'); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function UsageSettings() {
  const { apiCallRecords, executionRecords, getMonthlyUsage, getModelUsage, clearAllRecords } = useUsageStore();
  const { projects } = useProjectStore();
  const { nodes } = useWorkflowStore();

  // 从真实数据计算摘要
  const summary = {
    totalProjects: projects.length,
    totalNodes: nodes.length,
    totalExecutions: executionRecords.length,
    totalApiCalls: apiCallRecords.length,
  };

  const monthlyUsage = getMonthlyUsage(6);
  const modelUsage = getModelUsage();
  const maxApiCalls = Math.max(...monthlyUsage.map((m) => m.apiCalls), 1);

  const hasData = apiCallRecords.length > 0 || executionRecords.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">AI 模型调用和资源消耗（数据来自实际 API 调用，实时更新）</p>
        {hasData && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              toast.warning('确定要清空所有使用量统计记录吗？此操作不可撤销。', {
                action: {
                  label: '确认清空',
                  onClick: () => {
                    clearAllRecords();
                    toast.success('使用量记录已清空');
                  },
                },
              });
            }}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            清空记录
          </Button>
        )}
      </div>

      {!hasData && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium mb-1">尚未产生调用记录</p>
            <p>此页面记录当前账号成功完成的 AI 调用次数与 Token 用量。平台不内置价格表，不提供费用估算；计费请以服务商账单为准。失败的调用不计入。</p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '项目总数', value: summary.totalProjects, color: 'text-foreground' },
          { label: '当前画布节点数', value: summary.totalNodes, color: 'text-slate-500' },
          { label: '执行次数', value: summary.totalExecutions, color: 'text-blue-400' },
          { label: 'API 调用', value: summary.totalApiCalls, color: 'text-amber-400' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <span className="text-xs font-medium">月度 API 调用趋势</span>
          <span className="text-xs text-muted-foreground">· 近 6 个月</span>
        </div>
        <div className="p-3">
          {maxApiCalls <= 1 && !hasData ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              暂无调用记录，使用 AI 功能后数据将自动更新
            </div>
          ) : (
            <div className="flex items-end gap-3 h-32">
              {monthlyUsage.map((m) => {
                const heightPct = maxApiCalls > 0 ? (m.apiCalls / maxApiCalls) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">{m.apiCalls}</span>
                    <div
                      className="w-full rounded-t-md bg-primary/15 border border-primary/10 transition-all duration-500"
                      style={{ height: `${heightPct}%`, minHeight: 8 }}
                    />
                    <span className="text-[11px] text-muted-foreground">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Model usage breakdown */}
      <div className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">模型使用明细</span>
            <span className="text-xs text-muted-foreground">· 真实调用次数</span>
          </div>
          <Badge variant="secondary" className="text-amber-400 text-xs">
            总调用 ${summary.totalApiCalls} 次
          </Badge>
        </div>
        <div className="p-3">
          {modelUsage.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              暂无模型调用记录
            </div>
          ) : (
            <div className="space-y-3">
              {modelUsage.map((m) => {
                const pct = summary.totalApiCalls > 0 ? (m.calls / summary.totalApiCalls) * 100 : 0;
                return (
                  <div key={`${m.provider}-${m.model}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.model}</span>
                        <span className="text-xs text-muted-foreground">({m.provider})</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{m.calls} 次调用</span>
                        {m.tokens > 0 && <span>{(m.tokens / 1000).toFixed(0)}K tokens</span>}
                        <span className="text-muted-foreground">{m.calls} 次</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-accent/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/30 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Monthly detail table */}
      <div className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <span className="text-xs font-medium">月度消耗详情</span>
        </div>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground text-xs">
                <th className="text-left py-2 font-medium">月份</th>
                <th className="text-right py-2 font-medium">API 调用</th>
                <th className="text-right py-2 font-medium">执行次数</th>
                <th className="text-right py-2 font-medium">Token 消耗</th>
              </tr>
            </thead>
            <tbody>
              {monthlyUsage.map((m) => (
                <tr key={m.month} className="border-b border-border/20">
                  <td className="py-2">{m.month}</td>
                  <td className="text-right py-2 text-foreground">{m.apiCalls}</td>
                  <td className="text-right py-2">{m.executions}</td>
                  <td className="text-right py-2 text-muted-foreground">{(m.tokensUsed / 1000).toFixed(0)}K</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== Data Migration ====================
// 需要导出的所有 localStorage key
const ALL_STORAGE_KEYS = [
  'videobuddy-models',
  'videobuddy-theme',
  'videobuddy-teams',
  'videobuddy-projects',
  'videobuddy-assets',
  'videobuddy-comments',
  'videobuddy-templates',
  'videobuddy-usage',
  'videobuddy-artifacts',
  'videobuddy-workflow',
  'videobuddy-skills',
  'videobuddy-local-users',
];

function DataMigration() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = () => {
    try {
      const exportData: Record<string, unknown> = {
        _meta: {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          source: window.location.origin,
        },
      };

      for (const key of ALL_STORAGE_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            exportData[key] = JSON.parse(raw);
          } catch {
            exportData[key] = raw;
          }
        }
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `videobuddy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastExport(new Date().toLocaleString('zh-CN'));
      toast.success('配置数据已导出');
    } catch (err) {
      toast.error('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const importData = JSON.parse(text) as Record<string, unknown>;

        // 校验文件结构与版本、并确认每个 key 都在允许的清单内
        const meta = importData._meta as Record<string, unknown> | undefined;
        if (!meta || typeof meta !== 'object' || typeof meta.version !== 'string') {
          toast.error('无效的备份文件格式');
          setImporting(false);
          return;
        }
        if (String(meta.version).split('.')[0] !== '1') {
          toast.error('备份文件版本不兼容，无法导入');
          setImporting(false);
          return;
        }

        const presentKeys = ALL_STORAGE_KEYS.filter((k) => importData[k] !== undefined);
        if (presentKeys.length === 0) {
          toast.error('备份文件中没有可恢复的数据');
          setImporting(false);
          return;
        }
        for (const key of presentKeys) {
          const value = importData[key];
          if (typeof value !== 'string' && (typeof value !== 'object' || value === null)) {
            toast.error('备份文件内容格式异常');
            setImporting(false);
            return;
          }
        }

        const ok = await confirmAction({
          title: '导入备份将覆盖当前数据',
          description: `将恢复 ${presentKeys.length} 项配置，当前浏览器里的数据会被替换。备份文件可能包含账号信息与 API Key，请确认来源可信。`,
          confirmText: '确认导入',
          destructive: true,
        });
        if (!ok) {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        // 导入前清空目标环境的同类 key
        for (const key of ALL_STORAGE_KEYS) localStorage.removeItem(key);

        let restoredCount = 0;
        for (const key of presentKeys) {
          const value = importData[key];
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
          restoredCount++;
        }

        // 直接写 localStorage 不会经过 zustand 的 storage 适配层，
        // 需要显式把导入的数据同步到当前租户，否则刷新后会从服务端覆盖回来。
        const { syncImportedItems } = await import('@/lib/workspace-storage');
        await syncImportedItems(importData, presentKeys);

        toast.success(`已恢复 ${restoredCount} 项配置，页面将自动刷新`, {
          duration: 2000,
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        toast.error('导入失败: ' + (err instanceof Error ? err.message : '文件格式错误'));
      } finally {
        setImporting(false);
        // 重置 input 使得同一文件可以再次选择
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">工作区数据保存在当前账号下，导出备份可用于迁移或恢复</p>

      {/* 会话说明 */}
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-muted/20 border border-border/30">
        <ToggleRight className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        <span className="text-xs">登录状态由服务端会话保持，退出登录后本机数据会立即清除</span>
      </div>

      {/* 导出 / 导入 — 简洁一行 */}
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-muted/20 border border-border/30">
        <div className="flex-1">
          <p className="text-xs font-medium">数据备份</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">导出全部配置（API Key、项目、模板等）为 JSON 文件，可在新环境导入恢复</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleExport}
          >
            <Download className="w-3 h-3 mr-1" />
            导出
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="w-3 h-3 mr-1" />
            {importing ? '导入中...' : '导入'}
          </Button>
        </div>
      </div>
      {lastExport && (
        <p className="text-[11px] text-muted-foreground px-1">上次导出：{lastExport}</p>
      )}
    </div>
  );
}
