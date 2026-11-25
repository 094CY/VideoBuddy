import { useEffect, useState, type ReactNode } from 'react';
import { bootstrapSession, changeOwnPassword, type BootstrapResult } from '@/lib/session';
import { useAuthStore } from '@/stores/auth-store';
import { setSyncErrorHandler, setUnauthorizedHandler } from '@/lib/workspace-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * 应用启动时的会话引导。
 * 服务端会话是身份的唯一依据：成功则加载该租户的工作区数据，
 * 失败必须停在明确的错误页，绝不带着本机残留数据进入主界面。
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSyncErrorHandler((message) => toast.error(message));
    setUnauthorizedHandler(() => toast.error('登录状态已失效，未同步的修改已保留在本机'));
    return () => { setSyncErrorHandler(null); setUnauthorizedHandler(null); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    void (async () => {
      const r = await bootstrapSession();
      if (!cancelled) setResult(r);
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  if (result === null) return <FullPageMessage text="正在加载工作区…" />;

  if (result === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-medium">无法加载工作区</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              服务端连接失败、工作区文件损坏或会话校验异常。为避免显示其他账号的数据，页面已暂停加载。
              未同步的修改仍保留在本机，可先导出备份再重试。
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setAttempt((n) => n + 1)} className="gap-2">
              <RefreshCw className="w-4 h-4" /> 重试
            </Button>
            <Button variant="outline" onClick={exportLocalBackup} className="gap-2">
              导出本机备份
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (result === 'ok' && useAuthStore.getState().mustChangePassword) {
    return <PasswordChangeGate />;
  }

  return <>{children}</>;
}

function FullPageMessage({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** 临时口令与管理员重置口令需要先修改。 */
function PasswordChangeGate() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 8) { toast.error('新密码至少需要 8 位'); return; }
    if (next !== confirm) { toast.error('两次输入的新密码不一致'); return; }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      toast.success('密码已更新，正在重新加载');
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">请先设置新密码</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            当前使用的是初始口令。为了账号安全，设置新密码后才能继续使用平台。
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">当前口令</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">新密码（至少 8 位）</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">确认新密码</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? '提交中…' : '设置新密码'}
          </Button>
        </div>
      </div>
    </div>
  );
}


/** 将本机缓存导出为备份文件 */
function exportLocalBackup() {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('videobuddy-')) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: data }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `videobuddy-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
