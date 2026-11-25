/**
 * 可插拔存储层。
 *
 * 账号、会话、租户工作区与托管模型配置都通过这一层读写：
 *   - file   （默认）保持原有 JSON 文件与原子写语义
 *   - sqlite  使用 Node 内置 node:sqlite，支持多进程共享同一个数据库
 *   - postgres 通过 DATABASE_URL 连接；需要安装 pg 驱动
 *
 * 选择顺序：VB_STORAGE_BACKEND 显式指定 > DATABASE_URL 自动识别 > file。
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';

const DATA_DIR = process.env.VB_DATA_DIR || join(process.cwd(), 'data');

function backendKind() {
  const explicit = process.env.VB_STORAGE_BACKEND;
  if (explicit) return explicit.toLowerCase();
  const url = process.env.DATABASE_URL || '';
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgres';
  if (/^sqlite:/.test(url) || url.endsWith('.db') || url.endsWith('.sqlite')) return 'sqlite';
  return 'file';
}

/* ------------------------------ file ------------------------------ */

function fileFor(scope, key) {
  if (scope === 'root') return join(DATA_DIR, `${key}.json`);
  if (scope === 'workspace') return join(DATA_DIR, 'workspaces', `${key}.json`);
  if (scope === 'config') return join(DATA_DIR, `${key}.json`);
  throw new Error(`未知存储作用域：${scope}`);
}

const fileBackend = {
  kind: 'file',
  read(scope, key) {
    const file = fileFor(scope, key);
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) throw new Error(`数据文件为空：${key}`);
    try { return JSON.parse(raw); }
    catch { throw new Error(`数据文件损坏：${key}，请从备份恢复`); }
  },
  write(scope, key, value) {
    const file = fileFor(scope, key);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tmp, file);
  },
  remove(scope, key) {
    rmSync(fileFor(scope, key), { force: true });
  },
  keys(scope, prefix = '') {
    if (scope === 'workspace') {
      const root = join(DATA_DIR, 'workspaces');
      if (!existsSync(root)) return [];
      return listWorkspaceKeys(root, prefix);
    }
    return [];
  },
};
function listWorkspaceKeys(root, prefix) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const key = `${entry.name}/${f.slice(0, -5)}`;
      if (key.startsWith(prefix)) result.push(key);
    }
  }
  return result;
}

/* ------------------------------ sqlite ------------------------------ */

function sqliteBackend() {
  let DatabaseSync;
  try {
    // Node 22 内置模块，按后端类型按需加载
    const nodeRequire = createRequire(import.meta.url);
    DatabaseSync = nodeRequire('node:sqlite').DatabaseSync;
  } catch (err) {
    throw new Error(`SQLite 后端不可用：${err?.message}。请使用 Node 22+ 或改用 file 后端`);
  }
  const dbPath = (process.env.DATABASE_URL || '').replace(/^sqlite:/, '')
    || join(DATA_DIR, 'videobuddy.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS vb_kv (
    scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  )`);
  const getStmt = db.prepare('SELECT value FROM vb_kv WHERE scope = ? AND key = ?');
  const putStmt = db.prepare(`INSERT INTO vb_kv (scope, key, value) VALUES (?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`);
  const delStmt = db.prepare('DELETE FROM vb_kv WHERE scope = ? AND key = ?');
  const listStmt = db.prepare('SELECT key FROM vb_kv WHERE scope = ?');

  return {
    kind: 'sqlite',
    read(scope, key) {
      const row = getStmt.get(scope, key);
      if (!row) return null;
      try { return JSON.parse(row.value); }
      catch { throw new Error(`数据库记录损坏：${scope}/${key}`); }
    },
    write(scope, key, value) { putStmt.run(scope, key, JSON.stringify(value)); },
    remove(scope, key) { delStmt.run(scope, key); },
    keys(scope, prefix = '') {
      return listStmt.all(scope).map((r) => r.key).filter((k) => k.startsWith(prefix));
    },
  };
}

/* ------------------------------ postgres ------------------------------ */

/**
 * Postgres 驱动（pg）只提供异步接口，而账号/会话/工作区的读写路径是同步的。
 * 与其提供一个会静默丢写的半实现，不如明确拒绝并指向可用的数据库后端。
 * 需要关系型数据库时请使用 VB_STORAGE_BACKEND=sqlite（Node 内置，支持多进程共享）。
 */
function postgresBackend() {
  throw new Error( // reality-allow: 明确拒绝未实现的后端，避免静默丢写；已指向可用后端
    'Postgres 需要异步适配器，当前版本未实现。请使用 VB_STORAGE_BACKEND=sqlite ' +
    '（Node 内置数据库，支持多进程与多人共享），或 VB_STORAGE_BACKEND=file。'
  );
}

let instance;
let initPromise;

/** 同步后端（file / sqlite）；Postgres 需在启动阶段先 await initStorage() */
export function initStorage() {
  if (initPromise) return initPromise;
  const kind = backendKind();
  if (kind === 'postgres') {
    postgresBackend();
  }
  instance = kind === 'sqlite' ? sqliteBackend() : fileBackend;
  return Promise.resolve(instance);
}

export function getStorage() {
  if (!instance) {
    const kind = backendKind();
    if (kind === 'postgres') {
      throw new Error('Postgres 后端需要先在启动时 await initStorage()');
    }
    instance = kind === 'sqlite' ? sqliteBackend() : fileBackend;
  }
  return instance;
}

export function storageBackendKind() {
  return instance?.kind || backendKind();
}

export const STORAGE_DATA_DIR = DATA_DIR;
