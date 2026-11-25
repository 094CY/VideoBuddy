/**
 * 服务端托管的模型服务配置。
 *
 * 管理员在设置页配置一次，配置与 API Key 保存在服务端存储层（文件或 SQLite），
 * 所有已登录成员共用。浏览器只拿到脱敏后的服务与模型列表；
 * AI 请求经 /api/proxy 时由服务端注入鉴权头。
 */
import { getStorage } from './storage.js';

const KEY = 'managed-services';

const EMPTY = {
  services: [],
  models: [],
  defaults: {},
  updatedAt: null,
  updatedBy: null,
};

export function getManagedConfig() {
  const saved = getStorage().read('config', KEY);
  if (!saved || typeof saved !== 'object') return { ...EMPTY };
  return {
    services: Array.isArray(saved.services) ? saved.services : [],
    models: Array.isArray(saved.models) ? saved.models : [],
    defaults: saved.defaults && typeof saved.defaults === 'object' ? saved.defaults : {},
    updatedAt: saved.updatedAt || null,
    updatedBy: saved.updatedBy || null,
  };
}

export function saveManagedConfig(config, adminId) {
  const safe = {
    services: (config.services || []).map((s) => ({
      id: String(s.id || ''),
      name: String(s.name || ''),
      presetId: String(s.presetId || ''),
      protocol: String(s.protocol || 'openai'),
      baseUrl: String(s.baseUrl || '').replace(/\/+$/, ''),
      apiKey: String(s.apiKey || ''),
    })).filter((s) => s.id),
    models: (config.models || []).map((m) => ({
      id: String(m.id || ''),
      serviceId: String(m.serviceId || ''),
      modelId: String(m.modelId || ''),
      name: String(m.name || ''),
      type: String(m.type || 'text'),
    })).filter((m) => m.id && m.modelId),
    defaults: config.defaults && typeof config.defaults === 'object' ? config.defaults : {},
    updatedAt: new Date().toISOString(),
    updatedBy: adminId,
  };
  getStorage().write('config', KEY, safe);
  return safe;
}

export function publicManagedConfig() {
  const cfg = getManagedConfig();
  return {
    ...cfg,
    services: cfg.services.map(({ apiKey, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey),
      keyMasked: apiKey ? `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}` : '',
    })),
  };
}

export function findManagedService(id) {
  if (!id) return null;
  return getManagedConfig().services.find((s) => s.id === id) || null;
}

/** 托管服务的域名视为已登记：Key 来自服务端配置，成员无需各自注册白名单 */
export function isManagedServiceHost(hostname) {
  const target = String(hostname || '').toLowerCase();
  return getManagedConfig().services.some((s) => {
    try { return new URL(s.baseUrl).hostname.toLowerCase() === target; }
    catch { return false; }
  });
}

/** 按协议生成鉴权头；托管模式下由服务端注入，前端传来的鉴权头会被丢弃 */
export function authHeadersFor(service) {
  const key = service.apiKey || '';
  switch (service.protocol) {
    case 'anthropic':
      return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    case 'google':
      return { 'x-goog-api-key': key };
    case 'elevenlabs':
      return { 'xi-api-key': key };
    default:
      return { Authorization: `Bearer ${key}` };
  }
}

/** 连通性测试用的最小请求；只发一次，不轮询、不生成大文件 */
export function buildTestRequest(service, type, modelId) {
  const base = service.baseUrl.replace(/\/+$/, '');
  const protocol = service.protocol || 'openai';
  if (type === 'image') {
    return {
      url: `${base}/images/generations`,
      body: { model: modelId, prompt: 'a small red circle', n: 1, size: '256x256' },
    };
  }
  if (protocol === 'anthropic') {
    return {
      url: `${base}/messages`,
      body: { model: modelId, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] },
    };
  }
  if (protocol === 'google') {
    return {
      url: `${base}/models/${encodeURIComponent(modelId)}:generateContent`,
      body: { contents: [{ parts: [{ text: 'hi' }] }] },
    };
  }
  return {
    url: `${base}/chat/completions`,
    body: { model: modelId, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] },
  };
}
