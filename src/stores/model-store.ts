import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiKeyConfig, ModelType, ModelProvider, ModelInfo } from '@/types';
import { generateId } from '@/lib/utils';
import { LOCAL_BACKENDS, getProtocol } from '@/config/model-catalog';

export { BUILT_IN_PROVIDERS, LOCAL_BACKENDS, PROTOCOLS } from '@/config/model-catalog';

/** 用户自行配置的一个模型服务。平台不预置任何服务或模型。 */
export interface ServiceConfig extends ApiKeyConfig {
  name: string;
  protocol: string;
  /** true = 密钥保存在服务端，前端不持有 */
  managed?: boolean;
}

/** 用户在某个服务下添加的一个模型。 */
export interface UserModel extends ModelInfo {
  serviceId: string;
  serviceName: string;
  protocolId: string;
}

interface LocalModelCache {
  backendId: string;
  models: string[];
  type: 'text' | 'image';
  lastChecked: number;
}

export interface DefaultModelRef {
  provider: string;
  model: string;
  serviceId: string;
}

interface ModelStore {
  /** 兼容旧字段名，实际语义是「已配置的服务列表」 */
  apiKeys: ServiceConfig[];
  services: ServiceConfig[];
  defaultModels: Record<ModelType, DefaultModelRef | null>;
  localModelsCache: LocalModelCache[];
  /** 用户自行添加的模型，平台不预置任何模型 */
  customModels: UserModel[];

  addApiKey: (provider: string, apiKey: string, baseUrl?: string) => void;
  addService: (name: string, protocol: string, baseUrl: string, apiKey: string) => ServiceConfig;
  removeApiKey: (id: string) => void;
  removeService: (id: string) => void;
  updateApiKey: (id: string, updates: Partial<ServiceConfig>) => void;
  getApiKeyForProvider: (providerOrServiceId: string) => ServiceConfig | undefined;
  getPlainApiKey: (providerOrServiceId: string, preferNativeFormat?: boolean) => string | undefined;
  getService: (id: string) => ServiceConfig | undefined;
  /** 从服务端拉取管理员发布的共享配置（脱敏），密钥不落浏览器 */
  loadManagedConfig: () => Promise<boolean>;

  setDefaultModel: (type: ModelType, provider: string, model: string, serviceId?: string) => void;
  getDefaultModel: (type: ModelType) => DefaultModelRef | null;

  getAvailableModels: (type: ModelType) => UserModel[];
  getProviders: () => ModelProvider[];

  addCustomModel: (serviceId: string, modelId: string, name: string, type: ModelType) => { ok: boolean; error?: string; protocolId?: string };
  removeCustomModel: (serviceId: string, modelId: string) => void;

  updateLocalModelsCache: (backendId: string, models: string[], type: 'text' | 'image') => void;
  getLocalModels: (type: ModelType) => ModelInfo[];
  isLocalModel: (provider: string) => boolean;
}

const EMPTY_DEFAULTS: Record<ModelType, DefaultModelRef | null> = {
  text: null, image: null, video: null, audio: null,
};

/** partialize 后的持久化形状，storage 泛型必须与之匹配 */
type PersistedModelState = Pick<
  ModelStore, 'services' | 'apiKeys' | 'defaultModels' | 'localModelsCache' | 'customModels'
>;

function encodeKey(raw: string): string {
  try { return btoa(unescape(encodeURIComponent(raw))); } catch { return raw; }
}
function decodeKey(stored: string): string {
  try { return decodeURIComponent(escape(atob(stored))); } catch { return stored; }
}
function maskKey(raw: string): string {
  if (raw.length <= 8) return '••••••••';
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      apiKeys: [],
      services: [],
      defaultModels: { ...EMPTY_DEFAULTS },
      localModelsCache: [],
      customModels: [],

      /** 兼容旧调用：按协议追加一个服务，名称用协议名 */
      addApiKey: (provider, apiKey, baseUrl) => {
        get().addService(getProtocol(provider)?.name || provider, provider, baseUrl || '', apiKey);
      },

      addService: (name, protocol, baseUrl, apiKey) => {
        const service: ServiceConfig = {
          id: `svc-${generateId()}`,
          userId: '',
          name: name.trim() || '我的服务',
          protocol,
          provider: protocol,
          apiKeyMasked: maskKey(apiKey),
          apiKeyEncrypted: encodeKey(apiKey),
          baseUrl: baseUrl.trim().replace(/\/$/, ''),
          // 只表示「已经填写」，不代表校验通过——平台不伪造可用性状态
          isValid: Boolean(apiKey),
          createdAt: new Date().toISOString(),
        };
        set((state) => {
          const next = [...state.services, service];
          return { services: next, apiKeys: next };
        });
        return service;
      },

      removeApiKey: (id) => get().removeService(id),
      removeService: (id) => {
        set((state) => {
          const services = state.services.filter((s) => s.id !== id);
          const customModels = state.customModels.filter((m) => m.serviceId !== id);
          const defaultModels = { ...state.defaultModels };
          for (const key of Object.keys(defaultModels) as ModelType[]) {
            if (defaultModels[key]?.serviceId === id) defaultModels[key] = null;
          }
          return { services, apiKeys: services, customModels, defaultModels };
        });
      },

      updateApiKey: (id, updates) => {
        set((state) => {
          const services = state.services.map((s) => s.id === id ? { ...s, ...updates } : s);
          return { services, apiKeys: services };
        });
      },

      getService: (id) => get().services.find((s) => s.id === id),

      /** 优先按服务 id 精确匹配，回退到按协议找第一个服务 */
      getApiKeyForProvider: (providerOrServiceId) => {
        const services = get().services;
        return services.find((s) => s.id === providerOrServiceId)
          || services.find((s) => s.protocol === providerOrServiceId)
          || undefined;
      },

      getPlainApiKey: (providerOrServiceId, preferNativeFormat = false) => {
        const service = get().getApiKeyForProvider(providerOrServiceId);
        if (service?.managed) return '__MANAGED__';
        if (!service) return undefined;
        const plain = decodeKey(service.apiKeyEncrypted);
        if (preferNativeFormat && !plain.includes(':')) return undefined;
        return plain;
      },

      setDefaultModel: (type, provider, model, serviceId) => {
        const resolvedServiceId = serviceId || get().services.find((s) => s.protocol === provider)?.id || '';
        set((state) => ({
          defaultModels: {
            ...state.defaultModels,
            [type]: { provider, model, serviceId: resolvedServiceId },
          },
        }));
      },

      getDefaultModel: (type) => get().defaultModels[type] || null,

      getAvailableModels: (type) => get().customModels.filter((m) => m.type === type),

      getProviders: () => get().services.map((s) => ({
        id: s.id,
        name: s.name,
        types: getProtocol(s.protocol)?.types || ['text', 'image', 'video', 'audio'],
        baseUrl: s.baseUrl || '',
        authHeader: getProtocol(s.protocol)?.authHint || 'Authorization: Bearer {key}',
        models: [],
      })),

      addCustomModel: (serviceId, modelId, name, type) => {
        const service = get().services.find((s) => s.id === serviceId);
        if (!service) return { ok: false, error: '请先添加一个服务' };
        const id = modelId.trim();
        if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(id)) {
          return { ok: false, error: '模型 ID 只能包含字母、数字、点、下划线、冒号、斜杠和连字符' };
        }
        const exists = get().customModels.some((m) => m.serviceId === serviceId && m.id === id);
        if (exists) return { ok: false, error: '该服务下已存在这个模型 ID' };
        const entry: UserModel = {
          id,
          name: name.trim() || id,
          type,
          providerId: service.protocol,
          serviceId,
          serviceName: service.name,
          protocolId: service.protocol,
          description: service.name,
          tags: ['自定义', '用户添加', '自配置'],
        };
        set((state) => ({ customModels: [...state.customModels, entry] }));
        return { ok: true, protocolId: service.protocol };
      },

      removeCustomModel: (serviceId, modelId) => {
        set((state) => {
          const customModels = state.customModels.filter(
            (m) => !(m.serviceId === serviceId && m.id === modelId)
          );
          const defaultModels = { ...state.defaultModels };
          for (const key of Object.keys(defaultModels) as ModelType[]) {
            const ref = defaultModels[key];
            if (ref?.serviceId === serviceId && ref.model === modelId) defaultModels[key] = null;
          }
          return { customModels, defaultModels };
        });
      },

      updateLocalModelsCache: (backendId, models, type) => {
        set((state) => ({
          localModelsCache: [
            ...state.localModelsCache.filter((c) => c.backendId !== backendId),
            { backendId, models, type, lastChecked: Date.now() },
          ],
        }));
      },

      getLocalModels: (type) => {
        const out: ModelInfo[] = [];
        for (const cache of get().localModelsCache) {
          if (cache.type !== type) continue;
          for (const id of cache.models) {
            out.push({ id, name: id, type, providerId: cache.backendId, tags: ['本地', '离线', '免费'] });
          }
        }
        return out;
      },

      loadManagedConfig: async () => {
        let data: {
          services?: Array<{ id: string; name: string; protocol: string; baseUrl: string }>;
          models?: Array<{ id: string; serviceId: string; modelId: string; name: string; type: ModelType }>;
          defaults?: Record<string, { serviceId: string; modelId: string } | null>;
        };
        try {
          const res = await fetch('/api/services', { credentials: 'include' });
          if (!res.ok) return false;
          data = await res.json();
        } catch { return false; }
        const managedServices: ServiceConfig[] = (data.services || []).map((svc) => ({
          id: svc.id, userId: '__managed__', provider: svc.protocol,
          protocol: svc.protocol, name: svc.name,
          apiKeyMasked: '', apiKeyEncrypted: '__MANAGED__', baseUrl: svc.baseUrl,
          isValid: true, createdAt: '', managed: true,
        }));
        const managedModels = (data.models || []).map((m) => ({
          id: m.id, serviceId: m.serviceId,
          serviceName: managedServices.find((x) => x.id === m.serviceId)?.name || '',
          protocolId: managedServices.find((x) => x.id === m.serviceId)?.protocol || 'openai',
          modelId: m.modelId, name: m.name || m.modelId, type: m.type,
          provider: m.serviceId, providerId: m.serviceId,
        })) as unknown as UserModel[];
        const defaults = { ...get().defaultModels };
        for (const [type, ref] of Object.entries(data.defaults || {})) {
          if (!ref) continue;
          const svc = managedServices.find((x) => x.id === ref.serviceId);
          if (svc) defaults[type as ModelType] = {
            provider: svc.protocol, model: ref.modelId, serviceId: ref.serviceId,
          };
        }
        set((state) => ({
          services: [...state.services.filter((x) => !x.managed), ...managedServices],
          apiKeys: [...state.apiKeys.filter((x) => !x.managed), ...managedServices],
          customModels: [
            ...state.customModels.filter((x) => !managedServices.some((m) => m.id === x.serviceId)),
            ...managedModels,
          ],
          defaultModels: defaults,
        }));
        return true;
      },

      isLocalModel: (provider) => LOCAL_BACKENDS.some((b) => b.id === provider),
    }),
    {
      name: 'videobuddy-models',
      storage: createWorkspaceStorage<PersistedModelState>(),
      partialize: (state) => ({
        services: state.services,
        apiKeys: state.services,
        defaultModels: state.defaultModels,
        localModelsCache: state.localModelsCache,
        customModels: state.customModels,
      }),
      // 模型 ID 由用户按服务商文档登记；历史内置模型数据不参与迁移。
      merge: (persisted, current) => {
        const saved = persisted as Partial<ModelStore> | undefined;
        if (!saved || !Array.isArray(saved.services)) {
          return { ...current, services: [], apiKeys: [], customModels: [], defaultModels: { ...EMPTY_DEFAULTS } };
        }
        const services = saved.services as ServiceConfig[];
        return {
          ...current,
          services,
          apiKeys: services,
          customModels: Array.isArray(saved.customModels) ? saved.customModels : [],
          defaultModels: saved.defaultModels || { ...EMPTY_DEFAULTS },
          localModelsCache: Array.isArray(saved.localModelsCache) ? saved.localModelsCache : [],
        };
      },
    }
  )
);
