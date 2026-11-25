/**
 * 多租户数据层（单实例部署）。
 *
 * - 账号 / 会话 / 工作区都保存在服务端 data/ 目录，按 userId 分目录
 * - 密码 scrypt + 每账号随机 salt，只存哈希；会话 token 只存 sha256
 * - 写入走原子替换；关键文件损坏时拒绝启动
 *
 * 明确约束：这是单进程文件存储，不支持多实例共享同一 VB_DATA_DIR。
 * 需要水平扩展时换成带事务的数据库。
 */
import './env.js';
import crypto from 'crypto';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, appendFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { getStorage, storageBackendKind } from './storage.js';

const DATA_DIR = process.env.VB_DATA_DIR || join(process.cwd(), 'data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json');
const WORKSPACES_DIR = join(DATA_DIR, 'workspaces');
const HOSTS_DIR = join(DATA_DIR, 'allowed-hosts');
const AUDIT_FILE = join(DATA_DIR, 'audit.jsonl');
const BACKUPS_DIR = join(DATA_DIR, 'backups');
const INSTANCE_LOCK = join(DATA_DIR, 'instance.lock');

/**
 * 允许同步的存储键白名单。
 * 注意：videobuddy-auth 绝不参与同步——它含前端影子账号表与登录态，
 * 同步会把上一个账号的身份写进当前租户目录。身份只由服务端会话决定。
 */
export const WORKSPACE_KEYS = [
  'videobuddy-models',
  'videobuddy-teams',
  'videobuddy-projects',
  'videobuddy-assets',
  'videobuddy-artifacts',
  'videobuddy-comments',
  'videobuddy-templates',
  'videobuddy-usage',
  'videobuddy-workflow',
  'videobuddy-skills',
  'videobuddy-local-users',
];

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'vb_session';
const MAX_SESSIONS_PER_USER = 100;

/** 关键文件损坏时直接抛错，让启动失败，不用默认值重建账号表。 */
function readRoot(key, label) {
  const value = getStorage().read('root', key);
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') {
    throw new Error(`${label} 格式异常，拒绝以默认账号重建`);
  }
  return value;
}
function writeRoot(key, value) {
  getStorage().write('root', key, value);
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  // 同目录 rename 是原子操作：进程中途退出只会留下 tmp，不会留下半截的目标文件
  renameSync(tmp, file);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * 账号标识是通用字符串：邮箱、手机号、用户名、姓名都可以。
 * 数据文件里早期以 email 字段存储，读取时做兼容降级。
 */
function accountOf(acc) {
  return acc.account || acc.email || '';
}

/** 统一归一化：去首尾空白 + 忽略大小写，作为账号表的键。 */
function normalizeAccount(value) {
  return String(value || '').trim().toLowerCase();
}

export function publicAccount(acc) {
  return {
    id: acc.id,
    account: accountOf(acc),
    name: acc.name,
    role: acc.role,
    teamId: acc.teamId || null,
    createdAt: acc.createdAt,
    mustChangePassword: Boolean(acc.mustChangePassword),
  };
}

/** 本地开发模式的临时口令：优先读 VB_DEV_PASSWORD，未设置时每次启动随机生成并打印。 */
const DEV_DEFAULT_PASSWORD = process.env.VB_DEV_PASSWORD || crypto.randomBytes(9).toString('base64url');

/** 首次启动创建管理员。生产环境必须显式提供口令，否则拒绝启动。 */
function ensureBootstrap() {
  mkdirSync(WORKSPACES_DIR, { recursive: true });
  let accounts = readRoot('accounts', 'accounts.json');
  if (accounts === null) {
    const configured = process.env.VB_ADMIN_PASSWORD;
    let password;
    const adminAccount = String(
      process.env.VB_ADMIN_ACCOUNT || process.env.VB_ADMIN_EMAIL || 'admin'
    ).trim();
    if (!adminAccount || adminAccount.length > 64 || /[\r\n\t]/.test(adminAccount)) {
      throw new Error('VB_ADMIN_ACCOUNT 必须是 1~64 个非空字符');
    }
    if (configured) {
      password = configured;
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 VB_ADMIN_PASSWORD，拒绝以默认口令启动');
    } else {
      password = DEV_DEFAULT_PASSWORD;
      console.warn('\n[VideoBuddy] 当前为本地开发模式，使用内置默认管理员凭据：');
      console.warn(`  账号: ${adminAccount}`);
      console.warn(`  口令: ${password}`);
      console.warn('  生产部署必须设置 VB_ADMIN_PASSWORD 覆盖此默认值。\n');
    }
    const pwdError = validatePassword(password);
    if (pwdError) throw new Error(`VB_ADMIN_PASSWORD ${pwdError}`);
    const salt = crypto.randomBytes(16).toString('hex');
    accounts = {
      [normalizeAccount(adminAccount)]: {
        id: `user-${crypto.randomBytes(8).toString('hex')}`,
        account: adminAccount,
        name: '管理员',
        role: 'admin',
        teamId: null,
        salt,
        passwordHash: hashPassword(password, salt),
        // 不阻断首次登录：强制改密会让 /api/workspace 被拦截，
        // 会话引导加载不到工作区，用户反而进不了主界面。
        // 生产环境已强制要求显式设置口令，默认值不会出现在生产部署里。
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
    };
    writeRoot('accounts', accounts);
  }
  if (!Object.keys(accounts).length) {
    throw new Error('accounts.json 中没有账号，拒绝以默认账号重建');
  }
  if (readRoot('sessions', 'sessions.json') === null) writeRoot('sessions', {});
  return accounts;
}

/**
 * 服务启动时主动初始化账号体系。
 *
 * 账号表原本是懒加载（首个请求才建），会带来两个问题：
 * 1. 生产环境缺口令时不是「拒绝启动」，而是首个请求才 500；
 * 2. 本地开发的默认凭据要等有人访问才打印，启动日志里看不到。
 * 在监听端口前调用。
 */
export function initializeForStartup() {
  const isProd = process.env.NODE_ENV === 'production';
  const configured = Boolean(process.env.VB_ADMIN_PASSWORD);
  if (isProd && !configured) {
    // 已有历史账号文件时同样要求显式口令
    throw new Error('生产环境必须设置 VB_ADMIN_PASSWORD，拒绝使用默认凭据启动');
  }
  ensureBootstrap();

  // 仅当显式指定固定开发口令时才把已有管理员账号同步到该口令。
  // 未指定时口令是每次启动随机生成的，若在这里同步会导致每次重启都改口令，
  // 让本机已保存的凭据失效；随机值只在首次创建账号时使用并打印在启动日志。
  if (!isProd && !configured && process.env.VB_DEV_PASSWORD) {
    const all = { ...accounts() };
    const key = normalizeAccount(process.env.VB_ADMIN_ACCOUNT || 'admin');
    const acc = all[key];
    if (acc && acc.role === 'admin' &&
        !safeEqual(hashPassword(DEV_DEFAULT_PASSWORD, acc.salt), acc.passwordHash)) {
      const salt = crypto.randomBytes(16).toString('hex');
      all[key] = {
        ...acc,
        salt,
        passwordHash: hashPassword(DEV_DEFAULT_PASSWORD, salt),
        mustChangePassword: false,
      };
      saveAccounts(all);
      console.warn('[VideoBuddy] 已将本地默认管理员口令同步为当前默认值');
    }
  }
}

/** 每次操作都重新读取存储，以感知外部变更。 */
function accounts() {
  return ensureBootstrap();
}
function sessions() {
  const parsed = readRoot('sessions', 'sessions.json');
  if (parsed === null) {
    writeRoot('sessions', {});
    return {};
  }
  return parsed;
}
function saveAccounts(a) {
  writeRoot('accounts', a);
}
function saveSessions(s) {
  writeRoot('sessions', s);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return null; // 畸形 Cookie 不应让请求 500
    }
  }
  return null;
}

/** 登录失败限流：按 IP + 账号计数，指数退避，不区分「账号不存在」与「密码错误」。 */
const loginAttempts = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, until: 0 };
  if (rec.until > now) return Math.ceil((rec.until - now) / 1000);
  return 0;
}
function noteFailure(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, until: 0 };
  rec.count = rec.until > now ? rec.count + 1 : 1;
  rec.until = now + Math.min(1000 * 2 ** Math.min(rec.count, 5), 30_000);
  loginAttempts.set(key, rec);
  if (loginAttempts.size > 5000) {
    for (const [k, v] of loginAttempts) if (v.until < now) loginAttempts.delete(k);
  }
}
function clearFailures(key) {
  loginAttempts.delete(key);
}

function userIdFromRequest(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const key = tokenHash(token);
  const all = sessions();
  const session = all[key];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete all[key];
    saveSessions(all);
    return null;
  }
  return session.userId;
}

export function currentUser(req) {
  const uid = userIdFromRequest(req);
  if (!uid) return null;
  const acc = Object.values(accounts()).find((a) => a.id === uid);
  // 早期数据只有 email 字段，这里补出统一标识，路由层无需再关心兼容
  return acc ? { ...acc, account: accountOf(acc) } : null;
}

/** 临时口令与管理员重置口令需要先修改。 */
export function requireAuth(req, res, next) {
  const acc = currentUser(req);
  if (!acc) return res.status(401).json({ error: '登录状态已失效，请重新登录' });
  const allowed = ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'];
  if (acc.mustChangePassword && !allowed.some((p) => req.path === p)) {
    return res.status(403).json({ error: '请先修改初始密码', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  req.account = acc;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.account?.role !== 'admin') {
    return res.status(403).json({ error: '此操作需要管理员权限' });
  }
  next();
}

function revokeUserSessions(userId, keepTokenHash) {
  const all = sessions();
  let removed = 0;
  for (const [key, s] of Object.entries(all)) {
    if (s.userId === userId && key !== keepTokenHash) {
      delete all[key];
      removed++;
    }
  }
  saveSessions(all);
  return removed;
}

export function login(account, password, clientIp = 'unknown') {
  const normalized = normalizeAccount(account);
  const key = `${clientIp}:${normalized}`;
  const wait = checkRateLimit(key);
  if (wait) return { error: `尝试过于频繁，请 ${wait} 秒后重试` };

  const acc = accounts()[normalized];
  const computed = acc ? hashPassword(password, acc.salt) : null;
  if (!acc || !computed || !safeEqual(computed, acc.passwordHash)) {
    noteFailure(key);
    return { error: '账号或密码错误' }; // 不泄露账号是否存在
  }
  clearFailures(key);

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const all = sessions();
  // 先清掉过期会话，只对仍在有效期内的计数，避免正常登录挤掉旧设备
  for (const [k, s] of Object.entries(all)) {
    if (!s || typeof s.expiresAt !== 'number' || s.expiresAt <= now) delete all[k];
  }
  const own = Object.entries(all).filter(([, s]) => s.userId === acc.id);
  if (own.length >= MAX_SESSIONS_PER_USER) {
    own.sort((a, b) => (a[1].lastSeen || a[1].expiresAt) - (b[1].lastSeen || b[1].expiresAt));
    for (const [k] of own.slice(0, own.length - MAX_SESSIONS_PER_USER + 1)) delete all[k];
  }
  all[tokenHash(token)] = { userId: acc.id, expiresAt: now + SESSION_TTL_MS, lastSeen: now };
  saveSessions(all);
  return { token, user: publicAccount(acc) };
}

export function logout(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return;
  const key = tokenHash(token);
  const all = sessions();
  delete all[key];
  saveSessions(all);
}

export function listUsers() {
  return Object.values(accounts()).map(publicAccount);
}

export function createUser({ account, name, password, role = 'member', teamId = null }) {
  const display = String(account || '').trim();
  const normalized = normalizeAccount(display);
  // 账号可以是邮箱、手机号、用户名或姓名，只约束长度与控制字符
  if (!display || display.length > 64 || /[\r\n\t]/.test(display)) {
    return { error: '账号不能为空，且不超过 64 个字符' };
  }
  const check = validatePassword(password);
  if (check) return { error: check };
  const all = { ...accounts() };
  if (all[normalized]) return { error: '该账号已存在' };
  const salt = crypto.randomBytes(16).toString('hex');
  const acc = {
    id: `user-${crypto.randomBytes(8).toString('hex')}`,
    account: display,
    name: String(name || '').trim() || display,
    role: role === 'admin' ? 'admin' : 'member',
    teamId,
    salt,
    passwordHash: hashPassword(password, salt),
    mustChangePassword: false, // 管理员分发的初始口令，用户可自行修改，不阻断使用
    createdAt: new Date().toISOString(),
  };
  all[normalized] = acc;
  saveAccounts(all);
  return { user: publicAccount(acc) };
}

export function deleteUser(id) {
  const all = { ...accounts() };
  const target = Object.entries(all).find(([, a]) => a.id === id);
  if (!target) return { error: '账号不存在' };
  if (target[1].role === 'admin') {
    const adminCount = Object.values(all).filter((a) => a.role === 'admin').length;
    if (adminCount <= 1) return { error: '至少保留一个管理员' };
  }
  delete all[target[0]];
  saveAccounts(all);
  revokeUserSessions(id);
  return { ok: true, workspaceId: id };
}

export function updateProfile(userId, name) {
  const all = { ...accounts() };
  const entry = Object.entries(all).find(([, a]) => a.id === userId);
  if (!entry) return { error: '账号不存在' };
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) return { error: '名称不能为空' };
  all[entry[0]] = { ...entry[1], name: trimmed };
  saveAccounts(all);
  return { user: publicAccount(all[entry[0]]) };
}

export function changePassword(userId, oldPassword, newPassword) {
  const all = { ...accounts() };
  const entry = Object.entries(all).find(([, a]) => a.id === userId);
  if (!entry) return { error: '账号不存在' };
  const acc = entry[1];
  if (!safeEqual(hashPassword(oldPassword, acc.salt), acc.passwordHash)) {
    return { error: '原密码不正确' };
  }
  const check = validatePassword(newPassword);
  if (check) return { error: check };
  const salt = crypto.randomBytes(16).toString('hex');
  all[entry[0]] = {
    ...acc,
    salt,
    passwordHash: hashPassword(newPassword, salt),
    mustChangePassword: false,
  };
  saveAccounts(all);
  revokeUserSessions(userId); // 改密后所有旧会话立即失效
  return { ok: true };
}

export function resetPassword(id, newPassword) {
  if (!newPassword || newPassword.length < 8) return { error: '新密码至少 8 位' };
  const all = { ...accounts() };
  const entry = Object.entries(all).find(([, a]) => a.id === id);
  if (!entry) return { error: '账号不存在' };
  const salt = crypto.randomBytes(16).toString('hex');
  all[entry[0]] = {
    ...entry[1],
    salt,
    passwordHash: hashPassword(newPassword, salt),
    mustChangePassword: false,
  };
  saveAccounts(all);
  revokeUserSessions(id);
  return { ok: true };
}

/** 每个账号自己注册的代理目标域名。平台不预置任何模型厂商清单。 */
function hostsFile(userId) {
  assertUserId(userId);
  return join(HOSTS_DIR, `${userId}.json`);
}

export function getAllowedHosts(userId) {
  assertUserId(userId);
  const value = getStorage().read('config', `hosts/${userId}`);
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('域名白名单数据异常，请从备份恢复');
  return value;
}

export function registerHosts(userId, hosts) {
  const merged = [...new Set([...getAllowedHosts(userId), ...hosts])].slice(0, 100);
  getStorage().write('config', `hosts/${userId}`, merged);
  return merged;
}

export function clearAllowedHosts(userId) {
  getStorage().remove('config', `hosts/${userId}`);
}

function assertUserId(userId) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error('非法的用户标识');
}

export function getWorkspace(userId) {
  assertUserId(userId);
  const items = {};
  const warnings = [];
  for (const key of WORKSPACE_KEYS) {
    let value;
    try {
      value = getStorage().read('workspace', `${userId}/${key}`);
    } catch (err) {
      // 单个键损坏不应锁死整个账号：隔离该键并明确告警
      getStorage().write('workspace', `${userId}/${key}.corrupt-${Date.now()}`, {
        error: err?.message, at: new Date().toISOString(),
      });
      getStorage().remove('workspace', `${userId}/${key}`);
      warnings.push(`${key} 数据损坏，已隔离，该项需要从备份恢复`);
      continue;
    }
    if (value !== null && value !== undefined) items[key] = value;
  }
  return { items, warnings };
}

export function putWorkspaceItems(userId, items) {
  assertUserId(userId);
  const entries = Object.entries(items).filter(([key]) => WORKSPACE_KEYS.includes(key));
  for (const [key, value] of entries) {
    const storageKey = `${userId}/${key}`;
    if (value === null || value === '') getStorage().remove('workspace', storageKey);
    else getStorage().write('workspace', storageKey, value);
  }
  return entries.length;
}

/** 显式的一次性迁移：必须在账号从未有过数据时由用户在界面上主动触发。 */
export function importLegacyWorkspace(userId, items) {
  assertUserId(userId);
  const existing = getStorage().keys('workspace', `${userId}/`);
  if (existing.some((k) => !k.includes('.corrupt-'))) {
    return { imported: 0 };
  }
  const safe = Object.fromEntries(
    Object.entries(items).filter(([k]) => WORKSPACE_KEYS.includes(k))
  );
  return { imported: putWorkspaceItems(userId, safe) };
}

export function deleteWorkspace(userId) {
  assertUserId(userId);
  for (const key of getStorage().keys('workspace', `${userId}/`)) {
    getStorage().remove('workspace', key);
  }
}

/**
 * Secure 只由运维显式开启（HTTPS 部署）。
 * 不能按 NODE_ENV 推断：部分内网环境通过 HTTP 访问，强制 Secure 会让 Cookie
 * 完全不被浏览器保存，表现为「登录成功但立刻掉线」。
 */
function secureFlag() {
  return process.env.VB_SECURE_COOKIE === '1' ? '; Secure' : '';
}

export function cookieHeader(token, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secureFlag()}`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag()}`;
}


/** 密码策略：至少 10 位，且同时包含字母与数字 */
export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 10) return '密码至少 10 位';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return '密码需同时包含字母与数字';
  return null;
}

/** 审计日志：追加式 JSONL，单行写入不覆盖历史 */
export function appendAudit(userId, action, detail = '') {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(AUDIT_FILE, JSON.stringify({
      at: new Date().toISOString(), userId, action, detail: String(detail).slice(0, 200),
    }) + '\n', 'utf8');
  } catch (err) {
    console.error('[audit] 写入失败：', err?.message);
  }
}

export function readAudit(limit = 500) {
  if (!existsSync(AUDIT_FILE)) return [];
  try {
    const lines = readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch { return []; }
}

/** 当前账号的会话列表（不含 token 本身） */
export function listSessions(userId) {
  const all = sessions();
  return Object.entries(all)
    .filter(([, s]) => s.userId === userId)
    .map(([key, s]) => ({ key, expiresAt: s.expiresAt }));
}

export function revokeSession(userId, key) {
  const all = sessions();
  if (!all[key] || all[key].userId !== userId) return false;
  delete all[key];
  saveSessions(all);
  return true;
}

/** 单实例保护：文件后端同一数据目录只允许一个写进程 */
export function acquireInstanceLock() {
  if (storageBackendKind() !== 'file') return; // 数据库后端由事务保证并发安全
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(INSTANCE_LOCK)) {
    let prev;
    try { prev = JSON.parse(readFileSync(INSTANCE_LOCK, 'utf8')); } catch { prev = null; }
    if (prev?.pid) {
      try { process.kill(prev.pid, 0);
        throw new Error(`数据目录已被进程 ${prev.pid} 占用：${DATA_DIR}。此版本为单进程文件存储，请勿启动第二个实例。`);
      } catch (err) {
        if (err?.code !== 'ESRCH') throw err;
      }
    }
  }
  writeFileSync(INSTANCE_LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
  const release = () => {
    try {
      const cur = JSON.parse(readFileSync(INSTANCE_LOCK, 'utf8'));
      if (cur.pid === process.pid) rmSync(INSTANCE_LOCK, { force: true });
    } catch { /* 已清理 */ }
  };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(0); });
  process.on('SIGTERM', () => { release(); process.exit(0); });
}

/** 自动备份：把账号、会话与各租户工作区打成一份 JSON 快照，保留最近 7 份 */
export function createBackup() {
  mkdirSync(BACKUPS_DIR, { recursive: true });
  const accounts = readRoot('accounts', 'accounts.json') || {};
  const sessionsSnapshot = sessions();
  const workspaces = {};
  for (const userId of Object.keys(accounts)) {
    try { workspaces[userId] = getWorkspace(userId).items; } catch { /* 跳过损坏项 */ }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(BACKUPS_DIR, `backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify({
    createdAt: new Date().toISOString(), accounts, sessions: sessionsSnapshot, workspaces,
  }), 'utf8');
  const files = readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 7))) {
    rmSync(join(BACKUPS_DIR, old), { force: true });
  }
  return file;
}

export function listBackups() {
  if (!existsSync(BACKUPS_DIR)) return [];
  return readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
}
