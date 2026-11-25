import { createJSONStorage, type StateStorage, type PersistStorage } from 'zustand/middleware';

/**
 * 多租户存储适配层。
 *
 * 前端用 zustand persist + localStorage 作即时缓存，写入异步同步到服务端
 * 「当前会话用户」的独立目录。服务端 userId 只从会话推导，前端无法指定。
 *
 * 可靠性设计：
 * - 每个 key 有「脏标记」：本地写入即标记，只有服务端确认后才清除。
 *   启动时若本机仍为脏，绝不用服务端旧值覆盖，并自动重新推送。
 * - 卸载时 pagehide / visibilitychange 用 fetch(keepalive) 尽力推送；
 *   即使推送失败，脏标记仍在，下次启动数据不会丢。
 * - 同步串行化 + 序号，杜绝晚到的旧批次覆盖新数据。
 * - 401 单独识别为会话失效，不伪装成网络错误。
 * - 失败持续重试并暴露状态，提供手动重试入口。
 *
 * 安全点：
 * - 身份相关键不参与同步
 * - 加载租户数据时全程 suppressSync，rehydrate 产生的写入不会进入同步队列
 * - 服务端没有某个 key 时，对应 store 重置为初始状态，杜绝跨账号残留
 */

const SYNC_KEYS = [
  'videobuddy-models', 'videobuddy-teams', 'videobuddy-projects',
  'videobuddy-assets', 'videobuddy-artifacts', 'videobuddy-comments',
  'videobuddy-templates', 'videobuddy-usage', 'videobuddy-workflow',
  'videobuddy-skills', 'videobuddy-local-users',
];

const META_KEY = 'videobuddy-sync-meta';

/** 身份数据只留在本机，且退出登录时必须一并清除 */
const LOCAL_ONLY_KEYS = new Set([
  'videobuddy-theme', 'videobuddy-auth', 'videobuddy-last-login-email', META_KEY,
]);

type MetaEntry = { ts: number; dirty: boolean };
type MetaMap = Record<string, MetaEntry>;

export type SyncState = 'idle' | 'pending' | 'syncing' | 'error' | 'unauthorized';
export interface SyncSnapshot {
  state: SyncState;
  pendingKeys: number;
  lastSyncedAt: number | null;
  message: string | null;
}

let syncEnabled = false;
let suppressSync = false;
let suppressWrite = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let inFlight = false;
let flushSeq = 0;
let lastSyncedAt: number | null = null;
let snapshot: SyncSnapshot = { state: 'idle', pendingKeys: 0, lastSyncedAt: null, message: null };
const pending = new Map<string, string | null>();
const listeners = new Set<(s: SyncSnapshot) => void>();

type SyncErrorHandler = (message: string) => void;
let onSyncError: SyncErrorHandler | null = null;
let onUnauthorized: (() => void) | null = null;

export function setSyncErrorHandler(fn: SyncErrorHandler | null) { onSyncError = fn; }
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

export function subscribeSyncStatus(fn: (s: SyncSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  return () => listeners.delete(fn);
}
export function getSyncSnapshot(): SyncSnapshot { return snapshot; }

function updateStatus(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch, pendingKeys: pending.size };
  for (const fn of listeners) fn(snapshot);
}

function readMeta(): MetaMap {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) as MetaMap : {};
  } catch { return {}; }
}
function writeMeta(meta: MetaMap) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  catch { /* 配额满时脏标记写不进，退化为每次启动全量重推 */ }
}
function markDirty(key: string) {
  const meta = readMeta();
  meta[key] = { ts: Date.now(), dirty: true };
  writeMeta(meta);
}
function markClean(keys: string[]) {
  const meta = readMeta();
  for (const key of keys) if (meta[key]) meta[key] = { ...meta[key], dirty: false };
  writeMeta(meta);
}
function dirtyKeys(): string[] {
  return Object.entries(readMeta()).filter(([, v]) => v?.dirty).map(([k]) => k);
}

function buildItems(): Record<string, unknown> {
  const items: Record<string, unknown> = {};
  for (const [key, value] of pending.entries()) {
    if (!SYNC_KEYS.includes(key)) continue;
    try { items[key] = value === null ? null : JSON.parse(value); }
    catch { items[key] = value; }
  }
  return items;
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  // 指数退避封顶 30s，之后按 30s 间隔持续重发
  const delay = Math.min(2000 * 2 ** Math.min(retryCount, 4), 30_000);
  retryTimer = setTimeout(() => { retryTimer = null; void flush(); }, delay);
}

async function sendBatch(items: Record<string, unknown>, keepalive = false): Promise<Response> {
  return fetch('/api/workspace/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, seq: ++flushSeq }),
    credentials: 'include',
    keepalive,
  });
}

/** 串行 flush：同一时刻只允许一个批次在途 */
async function flush(): Promise<boolean> {
  if (inFlight) return false;
  if (pending.size === 0) return true;
  const items = buildItems();
  if (Object.keys(items).length === 0 || !syncEnabled) {
    pending.clear();
    return true;
  }

  inFlight = true;
  const keys = Object.keys(items);
  pending.clear();
  updateStatus({ state: 'syncing', message: null });
  try {
    const res = await sendBatch(items);
    if (res.status === 401) {
      for (const [k, v] of Object.entries(items)) pending.set(k, v === null ? null : JSON.stringify(v));
      retryCount = 0;
      updateStatus({ state: 'unauthorized', message: '登录已失效，修改暂存于本机，请重新登录后继续' });
      onUnauthorized?.();
      return false;
    }
    if (!res.ok) throw new Error(`同步失败（${res.status}）`);
    markClean(keys);
    retryCount = 0;
    lastSyncedAt = Date.now();
    updateStatus({ state: pending.size > 0 ? 'pending' : 'idle', lastSyncedAt, message: null });
    if (pending.size > 0) scheduleFlush();
    return true;
  } catch (err) {
    for (const [k, v] of Object.entries(items)) {
      if (!pending.has(k)) pending.set(k, v === null ? null : JSON.stringify(v));
    }
    retryCount++;
    const msg = err instanceof Error && err.message.includes('401')
      ? '登录已失效' : '最近的修改尚未保存到服务端，正在自动重试';
    if (retryCount === 3) onSyncError?.(msg);
    updateStatus({ state: 'error', message: msg });
    scheduleRetry();
    console.warn('[workspace] 同步失败，将持续重试：', err);
    return false;
  } finally {
    inFlight = false;
  }
}

function scheduleFlush() {
  if (!syncEnabled) return;
  if (flushTimer) clearTimeout(flushTimer);
  updateStatus({ state: 'pending', message: null });
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, 400);
}

/** 手动重试（状态条按钮调用） */
export async function retrySync(): Promise<void> {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  retryCount = 0;
  await flush();
}

/** 卸载前尽力推送。keepalive 有体积上限，失败也没关系：脏标记仍在，启动会重推。 */
function flushOnPageHide() {
  if (!syncEnabled || pending.size === 0) return;
  const items = buildItems();
  if (Object.keys(items).length === 0) return;
  try {
    void sendBatch(items, true).catch(() => { /* 脏标记未清，下次启动继续 */ });
  } catch { /* 超体积，依赖脏标记 */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushOnPageHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnPageHide();
  });
}

/** 供所有 zustand persist 使用的 storage */
const rawStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    if (suppressWrite) return;
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      onSyncError?.('浏览器存储空间不足，本次修改未能保存，请清理或导出备份');
      console.error('[workspace] localStorage 写入失败：', err);
      return;
    }
    markDirty(name);
    if (suppressSync || !syncEnabled) return;
    pending.set(name, value);
    scheduleFlush();
  },
  removeItem: (name) => {
    if (suppressWrite) return;
    localStorage.removeItem(name);
    markDirty(name);
    if (suppressSync || !syncEnabled) return;
    pending.set(name, null);
    scheduleFlush();
  },
};

export function createWorkspaceStorage<S>(): PersistStorage<S> | undefined {
  return createJSONStorage<S>(() => rawStorage);
}

export function writeWorkspaceKey(key: string, value: unknown) {
  rawStorage.setItem(key, JSON.stringify(value));
}
export function readWorkspaceKey(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function enableWorkspaceSync() {
  suppressSync = false;
  syncEnabled = true;
  if (pending.size > 0) scheduleFlush();
}

export function disableWorkspaceSync() {
  syncEnabled = false;
  suppressSync = false;
  pending.clear();
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  updateStatus({ state: 'idle', message: null });
}

export function beginTenantLoad() {
  disableWorkspaceSync();
  suppressSync = true;
}

export function finishTenantLoad() {
  suppressSync = false;
  syncEnabled = true;
  // 启动时保留了本机较新的脏数据，恢复同步后立刻推送
  for (const key of dirtyKeys()) {
    const raw = localStorage.getItem(key);
    if (raw !== null) pending.set(key, raw);
  }
  if (pending.size > 0) scheduleFlush();
  else updateStatus({ state: 'idle', message: null });
}

export async function flushWorkspaceSync(): Promise<boolean> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  return flush();
}

/** 清空本机业务数据（退出登录 / 会话失效时），只保留主题偏好 */
export function clearLocalWorkspace() {
  beginTenantLoad();
  for (const key of [...SYNC_KEYS, ...LOCAL_ONLY_KEYS]) {
    if (key === 'videobuddy-theme') continue;
    localStorage.removeItem(key);
  }
}

/**
 * 用服务端数据覆盖本机缓存，但保留「本机较新」的脏键。
 * 这是防止「刷新后编辑被服务端旧值回滚」的关键。
 */
export function applyWorkspaceItems(items: Record<string, unknown>) {
  const dirty = new Set(dirtyKeys());
  const localModels = localStorage.getItem('videobuddy-models');
  for (const key of SYNC_KEYS) {
    if (dirty.has(key)) continue;
    localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(items)) {
    if (!SYNC_KEYS.includes(key) || dirty.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (key === 'videobuddy-models' && localModels) {
      try {
        const local = JSON.parse(localModels);
        const remote = typeof value === 'string' ? JSON.parse(value) : value;
        const localDefaults = local?.state?.defaultModels;
        const hasLocalChoice = localDefaults && Object.values(localDefaults).some(Boolean);
        const merged = {
          ...remote,
          state: {
            ...(remote?.state || {}),
            ...(hasLocalChoice ? { defaultModels: localDefaults } : {}),
          },
          version: remote?.version ?? local?.version ?? 0,
        };
        localStorage.setItem(key, JSON.stringify(merged));
        continue;
      } catch { /* 数据异常时按普通覆盖处理 */ }
    }
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  if (!items['videobuddy-models'] && localModels && !dirty.has('videobuddy-models')) {
    localStorage.setItem('videobuddy-models', localModels);
  }
}

/**
 * 重新水合所有持久化 store。
 * 先重置内存到初始状态（且不写 localStorage），再从已就位的缓存水合，
 * 杜绝 zustand v5 在 key 缺失时保留上一个账号的内存数据并回写。
 */
export async function rehydrateAllStores() {
  const modules = await Promise.all([
    import('@/stores/auth-store'), import('@/stores/project-store'),
    import('@/stores/model-store'), import('@/stores/template-store'),
    import('@/stores/asset-store'), import('@/stores/comment-store'),
    import('@/stores/usage-store'), import('@/stores/team-store'),
    import('@/stores/skill-store'), import('@/stores/workflow-store'),
    import('@/stores/artifact-store'),
  ]);

  type Persistable = {
    persist: { rehydrate: () => Promise<void> | void; getOptions: () => { name?: string } };
    getInitialState: () => unknown;
    setState: (state: unknown, replace?: boolean) => void;
  };

  const stores: Persistable[] = [];
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      const candidate = value as Partial<Persistable> | null;
      if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) continue;
      if (typeof candidate.persist?.rehydrate === 'function' &&
          typeof candidate.persist?.getOptions === 'function' &&
          typeof candidate.getInitialState === 'function' &&
          typeof candidate.setState === 'function') {
        stores.push(candidate as Persistable);
      }
    }
  }
  if (stores.length === 0) throw new Error('工作区存储初始化失败：未能定位任何持久化 store');

  suppressWrite = true;
  for (const store of stores) {
    try { store.setState(store.getInitialState(), true); }
    catch (err) { console.warn('[workspace] store 重置失败：', err); }
  }
  suppressWrite = false;

  for (const store of stores) {
    try { await store.persist.rehydrate(); }
    catch (err) { console.warn('[workspace] store 水合失败：', err); }
  }
}

/** 导入备份：先留本机快照，失败可回滚；成功后再水合 */
export async function syncImportedItems(importData: Record<string, unknown>, keys: string[]) {
  const backup: Record<string, string | null> = {};
  for (const key of keys) backup[key] = localStorage.getItem(key);

  disableWorkspaceSync();
  applyWorkspaceItems(importData);
  for (const key of keys) markDirty(key);

  const items: Record<string, unknown> = {};
  for (const key of keys) {
    if (!SYNC_KEYS.includes(key) || importData[key] === undefined) continue;
    items[key] = importData[key];
  }

  suppressSync = false;
  syncEnabled = true;
  if (Object.keys(items).length === 0) { await rehydrateAllStores(); return; }

  pending.clear();
  for (const [key, value] of Object.entries(items)) pending.set(key, JSON.stringify(value));
  const ok = await flushWorkspaceSync();
  if (!ok) {
    // 导入失败时回滚本机到导入前状态
    for (const [key, value] of Object.entries(backup)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw new Error('导入数据未能同步到服务端，已恢复原有数据，请检查网络后重试');
  }
  markClean(keys);
  await rehydrateAllStores();
}
