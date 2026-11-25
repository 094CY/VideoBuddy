// origin: 094CY/VideoBuddy
/**
 * 生产服务：静态托管前端构建产物，提供 AI 请求转发、会话鉴权与租户数据存储。
 */
import './server/env.js';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import * as tenant from './server/multi-tenant.js';
import { initStorage } from './server/storage.js';
import {
  getManagedConfig, saveManagedConfig, publicManagedConfig, findManagedService,
  isManagedServiceHost, authHeadersFor, buildTestRequest,
} from './server/managed-services.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3721;

// ============================================================
// 代理安全白名单（SSRF 防护）
//
// 平台不预置任何模型厂商域名。每个账号在「设置 → 模型 & Key」里
// 配置服务地址时，由已鉴权的 /api/services/hosts 注册该域名；
// 代理只放行该账号自己注册过的域名 + 运维通过环境变量显式追加的域名。
// 未登记的地址不可代理。
// ============================================================
const ENV_ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/\/$/, ''))
  .filter(Boolean);

/** 私有 / 保留 / 特殊地址判定，覆盖 IPv4、IPv6 与 IPv4-mapped */
function isBlockedAddress(hostname) {
  let host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '::1' || host === '::' || host.startsWith('fc') ||
      host.startsWith('fd') || host.startsWith('fe80')) return true;
  if (host.startsWith('::ffff:')) host = host.slice(7);

  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** 只放行精确匹配或一层子域 */
function isHostAllowed(hostname, userId) {
  const host = hostname.toLowerCase();
  let allowed;
  try {
    allowed = new Set([...ENV_ALLOWED_HOSTS, ...tenant.getAllowedHosts(userId)]);
  } catch (err) {
    return { error: err.message, status: 500 };
  }
  if (allowed.has(host)) return true;
  for (const entry of allowed) {
    if (host.endsWith(`.${entry}`) && host.slice(0, -entry.length - 1).indexOf('.') === -1) {
      return true;
    }
  }
  return false;
}

/** 统一的目标 URL 校验，两个代理端点共用 */
function validateTarget(rawUrl, userId) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: '目标地址格式无效', status: 400 };
  }
  const hostname = parsed.hostname.toLowerCase();
  const localTest = process.env.VB_ALLOW_HTTP_TEST === '1'
    && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
  if (parsed.protocol !== 'https:' && !(localTest && parsed.protocol === 'http:')) {
    return { error: '代理仅允许 HTTPS 目标', status: 400 };
  }
  if (parsed.username || parsed.password) {
    return { error: '目标地址不允许包含用户信息', status: 400 };
  }
  if (!localTest && isBlockedAddress(hostname)) {
    return { error: '代理目标被拒绝（内网或保留地址）', status: 403 };
  }
  // 管理员在服务端登记的服务，其域名对所有成员视为已登记
  if (isManagedServiceHost(hostname)) return { url: parsed };
  const check = isHostAllowed(hostname, userId);
  if (check && check.error) return check;
  if (!check) {
    return { error: '该地址尚未注册，请先在「设置 → 模型 & Key」中添加对应的服务地址', status: 403 };
  }
  return { url: parsed };
}

// CORS：默认同源（不发送 ACAO）。跨源部署时必须显式配置来源，
// 并同时允许携带会话 Cookie，否则多租户接口会全部 401。
const CORS_ORIGINS = (process.env.CORS_ALLOW_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    // 预检也校验来源，未配置的来源不返回 CORS 头
    return res.sendStatus(origin && CORS_ORIGINS.includes(origin) ? 204 : 403);
  }
  next();
});

// 所有 /api/* 默认要求服务端会话，只有登录/登出/健康检查豁免。
// 代理、签名、本地模型等端点不能匿名调用，否则服务器会成为开放代理。
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/logout', '/api/health']);
app.use((req, res, next) => {
  const path = (req.originalUrl || '').split('?')[0];
  if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return next();
  return tenant.requireAuth(req, res, next);
});

const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 120000);
const MAX_RESPONSE_BYTES = Number(process.env.MAX_RESPONSE_BYTES || 32 * 1024 * 1024);
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const FORBIDDEN_HEADERS = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded',
]);

/** 清洗前端传来的请求头，禁止伪造 Host 与转发头 */
function sanitizeHeaders(input) {
  const out = {};
  if (!input || typeof input !== 'object') return { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(input)) {
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    out[k] = String(v);
  }
  if (!out['Content-Type']) out['Content-Type'] = 'application/json';
  return out;
}

/** 读取响应体并限制体积 */
async function readLimitedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('上游响应超出大小上限');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// JSON body parser
app.use(express.json({ limit: '10mb' }));

// ============================================================
// 腾讯云 TC3-HMAC-SHA256 签名工具
// ============================================================
function sha256(message, secret, encoding) {
  return crypto.createHmac('sha256', secret).update(message).digest(encoding);
}

function sha256Hash(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

/**
 * 生成腾讯云 TC3-HMAC-SHA256 签名
 */
function signTencentCloud({ secretId, secretKey, service, action, payload, region, version }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0]; // YYYY-MM-DD

  // Step 1: 拼接规范请求串
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hashedRequestPayload = sha256Hash(payloadStr);
  const canonicalHeaders = `content-type:application/json\nhost:${service}.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n');

  // Step 2: 拼接待签名字符串
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${dateStr}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256Hash(canonicalRequest);
  const stringToSign = [algorithm, timestamp, credentialScope, hashedCanonicalRequest].join('\n');

  // Step 3: 计算签名
  const secretDate = sha256(dateStr, `TC3${secretKey}`);
  const secretService = sha256(service, secretDate);
  const secretSigning = sha256('tc3_request', secretService);
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  // Step 4: 组装 Authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    authorization,
    timestamp,
    headers: {
      'Content-Type': 'application/json',
      'Host': `${service}.tencentcloudapi.com`,
      'X-TC-Action': action,
      'X-TC-Version': version || '2023-09-01',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region || 'ap-guangzhou',
      'Authorization': authorization,
    },
  };
}


// ============================================================
// 腾讯云原生 API 代理端点（用于混元生图/生视频等需要 TC3 签名的接口）
// POST /api/tencent-cloud
// Body: { secretId, secretKey, service, action, payload, region?, version? }
// ============================================================
// service 采用枚举白名单：它会被拼进 URL 的 host，
// 任意字符都可能把请求改指向别的主机，且请求头里带着签名凭证。
// 只保留平台实际使用的服务，拼出的域名固定且不可被参数改变，
// 因此这个端点不需要（也不应该）依赖用户注册的代理白名单。
const TENCENT_SERVICES = new Set(['hunyuan', 'aiart', 'vclm', 'tts']);

app.post('/api/tencent-cloud', async (req, res) => {
  const { secretId, secretKey, service, action, payload, region, version } = req.body || {};

  if (!secretId || !secretKey || !service || !action) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  if (!TENCENT_SERVICES.has(service)) {
    return res.status(400).json({ error: '不支持的腾讯云 service' });
  }
  if (typeof action !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(action)) {
    return res.status(400).json({ error: 'action 格式无效' });
  }

  // service 已由枚举限定，域名固定，无需再过用户白名单
  const targetUrl = new URL(`https://${service}.tencentcloudapi.com/`);

  try {
    const { headers } = signTencentCloud({
      secretId,
      secretKey,
      service,
      action,
      payload: payload || {},
      region: region || 'ap-guangzhou',
      version: version || '2023-09-01',
    });

    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    const response = await fetch(targetUrl.href, {
      method: 'POST',
      headers,
      body: payloadStr,
      redirect: 'manual',
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const buf = await readLimitedBody(response);
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(buf);
  } catch (error) {
    console.error('[tencent-cloud]', error?.name || 'Error');
    res.status(502).json({ error: '腾讯云 API 代理请求失败，请稍后重试' });
  }
});


// ============================================================
// 通用 AI API 代理端点（OpenAI 兼容接口等）
// POST /api/proxy
// Body: { targetUrl, headers, body, method? }
// ============================================================
const proxyQuota = new Map();
const PROXY_QUOTA_PER_MIN = Number(process.env.VB_PROXY_QUOTA_PER_MIN || 120);
function checkProxyQuota(userId) {
  const now = Date.now();
  const rec = proxyQuota.get(userId) || { count: 0, resetAt: now + 60_000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 60_000; }
  rec.count++;
  proxyQuota.set(userId, rec);
  return rec.count <= PROXY_QUOTA_PER_MIN;
}

app.post('/api/proxy', async (req, res) => {
  let { targetUrl, headers: proxyHeaders, body: proxyBody, method: proxyMethod, serviceId } = req.body;
  if (serviceId) {
    const svc = findManagedService(serviceId);
    if (!svc) return res.status(403).json({ error: '托管服务不存在或已被移除' });
    // 丢弃前端可能传入的鉴权头，统一使用服务端保存的密钥
    const clean = { ...(proxyHeaders || {}) };
    for (const key of Object.keys(clean)) {
      if (['authorization', 'x-api-key', 'x-goog-api-key', 'xi-api-key'].includes(key.toLowerCase())) {
        delete clean[key];
      }
    }
    proxyHeaders = { ...clean, ...authHeadersFor(svc) };
  }
  if (!checkProxyQuota(req.account.id)) {
    return res.status(429).json({ error: '本账号 AI 请求过于频繁，请稍后再试' });
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing targetUrl' });
  }

  // 统一校验：协议 / 用户信息 / 私有网段 / 当前账号注册过的域名
  const check = validateTarget(targetUrl, req.account?.id);
  if (check.error) return res.status(check.status).json({ error: check.error });

  const httpMethod = String(proxyMethod || 'POST').toUpperCase();
  if (!ALLOWED_METHODS.has(httpMethod)) {
    return res.status(405).json({ error: '不支持的 HTTP 方法' });
  }

  try {
    const fetchOptions = {
      method: httpMethod,
      headers: sanitizeHeaders(proxyHeaders),
      // 禁止跟随重定向：跳转目标不会经过上面这套校验
      redirect: 'manual',
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    };

    if (httpMethod !== 'GET') {
      fetchOptions.body = typeof proxyBody === 'string' ? proxyBody : JSON.stringify(proxyBody ?? {});
    }

    // 用校验并清理过的 URL 发请求，而不是前端传来的原始字符串
    const response = await fetch(check.url.href, fetchOptions);

    // 上游返回 3xx 时告知前端，不静默跟随
    if (response.status >= 300 && response.status < 400) {
      return res.status(502).json({ error: '上游返回了重定向，代理不跟随跳转' });
    }

    const contentType = response.headers.get('content-type') || '';
    const buffer = await readLimitedBody(response);
    const isBinary =
      /audio\/|video\/|image\/|application\/octet-stream/.test(contentType);

    // 二进制音频/视频/图片 → 转为 base64 JSON，与前端调用层约定一致
    if (isBinary) {
      let mimeType = contentType.split(';')[0].trim();
      if (mimeType === 'application/octet-stream') {
        mimeType = /image/.test(check.url.pathname) ? 'image/png' : 'audio/mp3';
      }
      res.status(response.status).json({
        audio_base64: buffer.toString('base64'),
        mime_type: mimeType,
        data_uri: `data:${mimeType};base64,${buffer.toString('base64')}`,
      });
      return;
    }

    res.status(response.status);
    res.setHeader('Content-Type', contentType || 'application/json; charset=utf-8');
    res.send(buffer);
  } catch (error) {
    // 不把内部错误细节回显给客户端
    console.error('[proxy]', error?.name || 'Error');
    res.status(502).json({ error: '代理请求失败，请检查网络或稍后重试' });
  }
});

// POST /api/mflux/generate — 调用本地 mflux CLI 生成图片
import { execFile } from 'child_process';
import { readFile as fsReadFile, mkdtemp, rm, access, readdir } from 'fs/promises';
import { tmpdir } from 'os';

const MFLUX_BIN = join(process.env.HOME || '', '.local/share/uv/tools/mflux/bin/mflux-generate-flux2');

// 缓存目录名与 CLI 参数名的对应关系
const MFLUX_MODEL_ALIASES = {
  'flux.2-klein-4b': 'flux2-klein-4b',
  'flux.2-klein-9b': 'flux2-klein-9b',
  'flux.2-klein-base-4b': 'flux2-klein-base-4b',
  'flux.2-klein-base-9b': 'flux2-klein-base-9b',
};
const MFLUX_VALID_MODELS = [
  'dev', 'schnell', 'krea-dev', 'dev-krea', 'qwen', 'fibo', 'fibo-lite',
  'fibo-edit', 'fibo-edit-rmbg', 'z-image', 'z-image-turbo',
  'flux2-klein-4b', 'flux2-klein-9b', 'flux2-klein-base-4b', 'flux2-klein-base-9b',
];
function normalizeMfluxModel(raw) {
  const id = String(raw || '').toLowerCase();
  const mapped = MFLUX_MODEL_ALIASES[id] || id;
  return MFLUX_VALID_MODELS.includes(mapped) ? mapped : '';
}

// GET /api/mflux/status — 检查 mflux CLI 是否存在 + 实际扫描本地已下载的模型
app.get('/api/mflux/status', async (_req, res) => {
  try {
    await access(MFLUX_BIN);
    // 扫描 HuggingFace 缓存目录，查找已下载的 FLUX 模型
    const hfCache = join(process.env.HOME || '', '.cache/huggingface/hub');
    const models = [];
    try {
      const dirs = await readdir(hfCache);
      for (const dir of dirs) {
        const match = dir.match(/^models--.*--(.+)$/);
        if (match) {
          const id = normalizeMfluxModel(match[1]);
          if (id) models.push({ id });
        }
      }
    } catch { /* cache dir not found */ }
    res.json({ data: models });
  } catch {
    res.status(404).json({ error: 'mflux not installed' });
  }
});

// 同一时刻只允许一个本地生成任务
let mfluxRunning = false;

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

app.post('/api/mflux/generate', async (req, res) => {
  const { prompt, width, height, steps, model, seed } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {
    return res.status(400).json({ error: 'prompt 无效或过长' });
  }
  if (mfluxRunning) {
    return res.status(429).json({ error: '已有本地生成任务在执行，请稍后再试' });
  }

  mfluxRunning = true;
  let tmpDir;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'mflux-'));
    const outputPath = join(tmpDir, 'output.png');
    const args = [
      '--prompt', prompt,
      '--output', outputPath,
      '--width', String(clampInt(width, 512, 64, 2048)),
      '--height', String(clampInt(height, 512, 64, 2048)),
      '--steps', String(clampInt(steps, 4, 1, 50)),
    ];
    const chosenModel = normalizeMfluxModel(model);
    if (chosenModel) args.push('--base-model', chosenModel);
    if (seed !== undefined) args.push('--seed', String(clampInt(seed, 0, 0, 2147483647)));

    await new Promise((resolve, reject) => {
      const proc = execFile(MFLUX_BIN, args, { timeout: 300000 }, (err) => {
        if (err) reject(err); else resolve(undefined);
      });
      proc.stderr?.on('data', (d) => {
        if (process.env.NODE_ENV !== 'production') console.log('[mflux]', d.toString().trim());
      });
    });

    const imgBuf = await fsReadFile(outputPath);
    res.json({
      images: [{ b64_json: imgBuf.toString('base64') }],
      model: model || 'flux2-klein',
    });
  } catch (err) {
    console.error('[mflux]', err?.code || 'Error');
    res.status(500).json({ error: '本地图片生成失败，请确认 mflux 已正确安装' });
  } finally {
    mfluxRunning = false;
    // 无论成功失败都清理临时目录
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {}); // reality-allow: 清理临时目录，失败不影响响应
  }
});

// ============================================================
// 多租户：账号、会话与按用户隔离的工作区
// 所有 /api/workspace/* 与 /api/admin/* 都经过服务端会话校验，
// userId 只从会话推导，前端无法指定他人的租户。
// ============================================================
app.post('/api/auth/login', (req, res) => {
  // 账号是通用标识，邮箱 / 手机号 / 用户名 / 姓名都可以；email 仅为兼容旧客户端
  const account = String(req.body?.account ?? req.body?.email ?? '').trim();
  const password = String(req.body?.password || '');
  if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const result = tenant.login(account, password, req.ip || req.socket?.remoteAddress);
  if (result.error) return res.status(401).json({ error: result.error });
  tenant.appendAudit(result.user.id, 'login', result.user.account);
  res.setHeader('Set-Cookie', tenant.cookieHeader(result.token));
  res.json({ user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.account) tenant.appendAudit(req.account.id, 'logout');
  tenant.logout(req);
  res.setHeader('Set-Cookie', tenant.clearCookieHeader());
  res.json({ ok: true });
});

// ============================================================
// 上传素材：落盘到当前账号目录，返回同源可读取的 URL。
// 解决 blob URL 写进持久化 store 后刷新/换设备变成死链的问题。
// ============================================================
const FILES_ROOT = join(process.env.VB_DATA_DIR || join(process.cwd(), 'data'), 'files');

app.post('/api/assets/upload',
  tenant.requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '32mb' }),
  (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: '上传内容为空' });
    }
    const rawName = String(req.query.name || 'asset');
    const ext = (rawName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || 'bin').toLowerCase();
    const id = crypto.randomUUID();
    const dir = join(FILES_ROOT, req.account.id);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.${ext}`), buf);
      res.json({ url: `/api/assets/${id}.${ext}`, size: buf.length });
    } catch (err) {
      console.error('[assets] 写入失败：', err?.message);
      res.status(500).json({ error: '素材保存失败，请检查磁盘空间' });
    }
  });

app.get('/api/assets/:file', tenant.requireAuth, (req, res) => {
  const name = req.params.file;
  if (!/^[A-Za-z0-9-]+\.[A-Za-z0-9]{1,8}$/.test(name)) {
    return res.status(400).json({ error: '非法的素材标识' });
  }
  const file = join(FILES_ROOT, req.account.id, name);
  if (!existsSync(file)) return res.status(404).json({ error: '素材不存在或已过期' });
  res.sendFile(file);
});

app.get('/api/auth/me', tenant.requireAuth, (req, res) => {
  res.json({ user: {
    id: req.account.id,
    account: req.account.account,
    name: req.account.name,
    role: req.account.role,
    teamId: req.account.teamId || null,
    mustChangePassword: Boolean(req.account.mustChangePassword),
  } });
});

app.put('/api/auth/profile', tenant.requireAuth, (req, res) => {
  const result = tenant.updateProfile(req.account.id, String(req.body?.name || ''));
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post('/api/auth/change-password', tenant.requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const result = tenant.changePassword(
    req.account.id, String(oldPassword || ''), String(newPassword || '')
  );
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

app.get('/api/auth/sessions', tenant.requireAuth, (req, res) => {
  res.json({ sessions: tenant.listSessions(req.account.id) });
});

app.delete('/api/auth/sessions/:key', tenant.requireAuth, (req, res) => {
  const ok = tenant.revokeSession(req.account.id, req.params.key);
  if (!ok) return res.status(404).json({ error: '会话不存在' });
  tenant.appendAudit(req.account.id, 'revoke-session', req.params.key.slice(0, 8));
  res.json({ ok: true });
});

app.get('/api/admin/audit', tenant.requireAuth, tenant.requireAdmin, (_req, res) => {
  res.json({ entries: tenant.readAudit(500) });
});

app.get('/api/admin/backups', tenant.requireAuth, tenant.requireAdmin, (_req, res) => {
  res.json({ files: tenant.listBackups() });
});

// ============================================================
// 服务端托管模型服务：管理员配置一次，全员共用，密钥不落浏览器
// ============================================================
app.get('/api/services', tenant.requireAuth, (_req, res) => {
  res.json(publicManagedConfig());
});

app.put('/api/services', tenant.requireAuth, tenant.requireAdmin, (req, res) => {
  const config = req.body?.config;
  if (!config || !Array.isArray(config.services) || !Array.isArray(config.models)) {
    return res.status(400).json({ error: '配置格式无效' });
  }
  // 前端拿到的是脱敏视图（只有 hasKey / keyMasked，没有 apiKey）。
  // 未提供有效密钥时一律沿用服务端已存的密钥，避免新增或删除服务清空其它服务的密钥。
  for (const svc of config.services) {
    const incoming = svc.apiKey;
    const usable = typeof incoming === 'string'
      && incoming.trim() !== ''
      && !incoming.includes('••••');
    if (usable) continue;
    const existing = findManagedService(svc.id);
    if (existing) svc.apiKey = existing.apiKey;
  }
  const saved = saveManagedConfig(config, req.account.id);
  tenant.appendAudit(req.account.id, 'update-services', String(saved.services.length));
  res.json({ ok: true, config: publicManagedConfig() });
});

/** 真实发一次最小请求，验证「填了能不能调用」 */
app.post('/api/services/test', tenant.requireAuth, tenant.requireAdmin, async (req, res) => {
  const { serviceId, type = 'text', modelId } = req.body || {};
  const svc = findManagedService(serviceId);
  if (!svc) return res.status(404).json({ error: '服务不存在' });
  if (!modelId) return res.status(400).json({ error: '请选择要测试的模型 ID' });
  const { url, body } = buildTestRequest(svc, type, modelId);
  const check = validateTarget(url, req.account.id);
  if (check.error) return res.status(check.status || 400).json({ error: check.error });
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeadersFor(svc) },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    res.json({
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      detail: response.ok ? '服务可达且鉴权通过' : text.slice(0, 300),
    });
  } catch (err) {
    res.json({ ok: false, status: 0, latencyMs: Date.now() - started, detail: err?.message || '请求失败' });
  }
});

app.get('/api/admin/users', tenant.requireAuth, tenant.requireAdmin, (_req, res) => {
  res.json({ users: tenant.listUsers() });
});

app.post('/api/admin/users', tenant.requireAuth, tenant.requireAdmin, (req, res) => {
  const { account, email, name, password, role, teamId } = req.body || {};
  const result = tenant.createUser({
    account: String(account ?? email ?? '').trim(),
    name: String(name || '').trim(),
    password: String(password || ''),
    role,
    teamId: teamId || null,
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// 删除账号前导出其工作区
app.get('/api/admin/users/:id/export', tenant.requireAuth, tenant.requireAdmin, (req, res) => {
  try {
    const { items, warnings } = tenant.getWorkspace(req.params.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="videobuddy-archive-${encodeURIComponent(req.params.id)}.json"`);
    res.json({ accountId: req.params.id, exportedAt: new Date().toISOString(), items, warnings });
  } catch (err) {
    res.status(500).json({ error: `归档导出失败：${err?.message || '未知错误'}` });
  }
});

app.delete('/api/admin/users/:id', tenant.requireAuth, tenant.requireAdmin, (req, res) => {
  const result = tenant.deleteUser(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  tenant.deleteWorkspace(req.params.id);
  tenant.appendAudit(req.account.id, 'delete-user', req.params.id);
  res.json(result);
});

app.post('/api/admin/users/:id/reset-password', tenant.requireAuth, tenant.requireAdmin, (req, res) => {
  const result = tenant.resetPassword(req.params.id, String(req.body?.password || ''));
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.get('/api/workspace', tenant.requireAuth, (req, res) => {
  try {
    const { items, warnings } = tenant.getWorkspace(req.account.id);
    res.json({ items, ...(warnings.length ? { warnings } : {}) });
  } catch (err) {
    console.error('[workspace] 读取失败：', err?.message);
    res.status(500).json({ error: `工作区读取失败：${err?.message || '未知错误'}` });
  }
});

app.put('/api/workspace/:key', tenant.requireAuth, (req, res) => {
  if (!tenant.WORKSPACE_KEYS.includes(req.params.key)) {
    return res.status(400).json({ error: '不允许的存储键' });
  }
  const value = req.body?.value;
  if (value === undefined) return res.status(400).json({ error: '缺少 value' });
  try {
    tenant.putWorkspaceItems(req.account.id, { [req.params.key]: value });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `保存失败：${err?.message || '未知错误'}` });
  }
});

app.post('/api/workspace/batch', tenant.requireAuth, (req, res) => {
  const items = req.body?.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    return res.status(400).json({ error: '缺少 items' });
  }
  try {
    const written = tenant.putWorkspaceItems(req.account.id, items);
    res.json({ ok: true, written });
  } catch (err) {
    console.error('[workspace] 写入失败：', err?.message);
    res.status(500).json({ error: `保存失败：${err?.message || '未知错误'}` });
  }
});

/**
 * 注册当前账号允许代理的服务地址。
 * 用户在「设置 → 模型 & Key」保存服务时调用；平台不预置任何厂商域名。
 */
app.post('/api/services/hosts', (req, res) => {
  const urls = req.body?.urls;
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 20) {
    return res.status(400).json({ error: '请提供 1~20 个服务地址' });
  }
  const hosts = [];
  for (const raw of urls) {
    let parsed;
    try {
      parsed = new URL(String(raw));
    } catch {
      return res.status(400).json({ error: '服务地址格式无效' });
    }
    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ error: '服务地址必须使用 HTTPS' });
    }
    if (parsed.username || parsed.password) {
      return res.status(400).json({ error: '服务地址不允许包含用户信息' });
    }
    const host = parsed.hostname.toLowerCase();
    if (isBlockedAddress(host)) {
      return res.status(400).json({ error: '不允许使用内网或保留地址' });
    }
    hosts.push(host);
  }
  try {
    const allowed = tenant.registerHosts(req.account.id, hosts);
    res.json({ allowed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/services/hosts', (req, res) => {
  try {
    res.json({ allowed: tenant.getAllowedHosts(req.account.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// 带内容 hash 的静态资源可长缓存
const DIST = join(__dirname, 'dist');
app.use('/assets', express.static(join(DIST, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));
app.use(express.static(DIST, { index: false, maxAge: 0 }));

// SPA fallback：只处理明确接受 HTML 的 GET 导航。
// 带扩展名的资源请求一律 404。
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/local-api/')) return next();
  if (/\.[a-zA-Z0-9]+$/.test(req.path)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(join(DIST, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// 统一错误处理：生产环境不回显内部细节
app.use((err, _req, res, _next) => {
  console.error('[server]', err?.status || 500, err?.message || 'Error');
  if (res.headersSent) return;
  res.status(err?.status === 413 ? 413 : 500).json({
    error: err?.status === 413 ? '请求体过大' : '服务内部错误',
  });
});

// 默认只监听本机；容器或需要外部访问时显式设置 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';

// 账号体系在监听前初始化：生产缺口令直接拒绝启动，本地默认凭据立即打印
await initStorage();
tenant.acquireInstanceLock();
tenant.initializeForStartup();

// 自动备份：启动即生成一份，随后按间隔滚动；VB_BACKUP_INTERVAL_HOURS=0 可关闭
const BACKUP_HOURS = Number(process.env.VB_BACKUP_INTERVAL_HOURS ?? 24);
if (Number.isFinite(BACKUP_HOURS) && BACKUP_HOURS > 0) {
  try { tenant.createBackup(); } catch (err) { console.error('[backup] 初始备份失败：', err?.message); }
  const timer = setInterval(() => {
    try { tenant.createBackup(); } catch (err) { console.error('[backup]', err?.message); }
  }, BACKUP_HOURS * 3600 * 1000);
  timer.unref();
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`  - Health: http://localhost:${PORT}/api/health`);
  console.log(`  - API Proxy: http://localhost:${PORT}/api/proxy`);
});
