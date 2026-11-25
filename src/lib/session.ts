import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import {
  beginTenantLoad, finishTenantLoad, clearLocalWorkspace,
  applyWorkspaceItems, rehydrateAllStores, flushWorkspaceSync,
} from '@/lib/workspace-storage';

export interface SessionUser {
  id: string;
  account: string;
  name: string;
  role: 'admin' | 'member';
  teamId: string | null;
  createdAt?: string;
  mustChangePassword: boolean;
}

export type BootstrapResult = 'ok' | 'anonymous' | 'error';

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    credentials: 'include',
  });
}

function applyUser(user: SessionUser) {
  useAuthStore.setState({
    user: {
      id: user.id,
      account: user.account,
      name: user.name,
      avatarUrl: undefined,
      createdAt: user.createdAt || '',
    },
    isAuthenticated: true,
    token: null,
    // 角色以服务端下发为准，不依赖账号标识的形式
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
}

/**
 * 用服务端数据整体替换本机工作区。
 * 全程挂起同步，使 rehydrate 产生的写入不推送到服务端。
 */
async function loadTenantWorkspace(user: SessionUser) {
  beginTenantLoad();
  try {
    const res = await api('/api/workspace');
    if (!res.ok) {
      const detail = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(detail.error || `工作区读取失败（${res.status}）`);
    }
    const data = await res.json() as {
      items?: Record<string, unknown>;
      warnings?: string[];
    };
    if (data.warnings?.length) {
      const { toast } = await import('sonner');
      for (const w of data.warnings) toast.warning(w);
    }
    // 请求成功才允许覆盖本机；服务端明确返回空对象代表这是一个新账号
    applyWorkspaceItems(data.items || {});
    await rehydrateAllStores();
    applyUser(user);
    finishTenantLoad();
  } catch (err) {
    // 失败时保持同步挂起，绝不能带着上一个账号的本地数据放行
    console.error('[session] 工作区加载失败：', err);
    throw err;
  }
}

/** 应用启动时恢复服务端会话。失败必须显式报错，不能带着本机残留数据进入主界面。 */
export async function bootstrapSession(): Promise<BootstrapResult> {
  // 服务短暂不可达时重试，不把网络抖动当成会话失效
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await api('/api/auth/me');
      break;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  if (!res) return 'error';

  if (res.status === 401 || res.status === 403) {
    // 身份失效时保留本机工作区，未同步的编辑不能随登出一起清掉
    useAuthStore.setState({ user: null, isAuthenticated: false, token: null });
    return 'anonymous';
  }
  if (!res.ok) return 'error';

  const data = await res.json() as { user?: SessionUser };
  if (!data.user) return 'error';
  try {
    await loadTenantWorkspace(data.user);
    return 'ok';
  } catch {
    return 'error';
  }
}

/** 登录：只建立会话，工作区由整页加载后的 SessionBootstrap 统一恢复。 */
export async function loginWithServer(account: string, password: string): Promise<SessionUser> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '登录失败，请检查账号密码');
  }
  const data = await res.json() as { user: SessionUser };
  // 登录等于切换租户：必须先清空本机业务缓存，再整页跳转。
  // 否则新页面的 store 会从上一个账号的 localStorage 初始化，
  // 随后把那份数据同步到当前账号的服务端目录，造成跨租户泄漏。
  clearLocalWorkspace();
  applyUser(data.user);
  return data.user;
}

export async function logoutFromServer(): Promise<void> {
  // 先把在途写入推完，再销毁会话
  try {
    await flushWorkspaceSync();
  } catch (err) {
    console.error('[session] 登出前同步失败：', err);
    toast.error('本机改动尚未同步到服务端，请检查网络后重试');
  }
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // 网络异常时本机也必须清除
  }
  clearLocalWorkspace();
  useAuthStore.setState({ user: null, isAuthenticated: false, token: null });
}

export async function updateOwnProfile(name: string): Promise<void> {
  const res = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ name }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '保存失败');
  }
  const { user } = await res.json() as { user: SessionUser };
  useAuthStore.setState((state) => ({
    user: state.user ? { ...state.user, name: user.name } : state.user,
  }));
}

export async function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await api('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '修改失败');
  }
}

export async function fetchUsers(): Promise<SessionUser[]> {
  const res = await api('/api/admin/users');
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '无法获取成员列表');
  }
  const data = await res.json() as { users: SessionUser[] };
  return data.users;
}

export async function createUserOnServer(input: {
  account: string; name: string; password: string;
}): Promise<void> {
  const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '创建失败');
  }
}

export async function deleteUserOnServer(id: string): Promise<void> {
  const res = await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '删除失败');
  }
}

export async function resetUserPasswordOnServer(id: string, password: string): Promise<void> {
  const res = await api(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST', body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '重置失败');
  }
}

/** 注册服务地址到服务端代理白名单。平台不预置任何厂商域名。 */
export async function registerServiceHosts(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const res = await api('/api/services/hosts', {
    method: 'POST', body: JSON.stringify({ urls }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || '服务地址注册失败');
  }
}

export async function getServiceHosts(): Promise<string[]> {
  const res = await api('/api/services/hosts');
  if (!res.ok) return [];
  const data = await res.json() as { allowed?: string[] };
  return data.allowed || [];
}
