import { useEffect, useState } from 'react';
import {
  subscribeSyncStatus, getSyncSnapshot, retrySync,
  type SyncSnapshot,
} from '@/lib/workspace-storage';
import { Loader2, CloudOff, RefreshCw, LogIn, Cloud } from 'lucide-react';

/**
 * 全局同步状态提示。挂在 App 根层，所有页面（含独立的工作台路由）都可见。
 * 空闲时不占位；异常时明确给出原因和可操作出口。
 */
export function SyncStatusIndicator() {
  const [snap, setSnap] = useState<SyncSnapshot>(getSyncSnapshot);
  useEffect(() => subscribeSyncStatus(setSnap), []);

  if (snap.state === 'idle') return null;

  const isError = snap.state === 'error' || snap.state === 'unauthorized';
  const text =
    snap.state === 'syncing' ? '正在同步…'
    : snap.state === 'pending' ? `${snap.pendingKeys} 项待同步`
    : snap.state === 'unauthorized' ? '登录已失效，修改暂存于本机'
    : (snap.message || '同步失败，正在自动重试');

  const Icon =
    snap.state === 'syncing' ? Loader2
    : snap.state === 'pending' ? Cloud
    : snap.state === 'unauthorized' ? LogIn
    : CloudOff;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-14 right-3 z-[70] flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm text-[11px] backdrop-blur ${
        isError
          ? 'border-destructive/40 bg-destructive/10 text-foreground'
          : 'border-border bg-card/95 text-muted-foreground'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${snap.state === 'syncing' ? 'animate-spin' : ''}`} />
      <span>{text}</span>
      {snap.state === 'error' && (
        <button
          onClick={() => void retrySync()}
          className="flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3" /> 立即重试
        </button>
      )}
      {snap.state === 'unauthorized' && (
        <button
          onClick={() => window.location.replace('/login')}
          className="flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          重新登录
        </button>
      )}
    </div>
  );
}
