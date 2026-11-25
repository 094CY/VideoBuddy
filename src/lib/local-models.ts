/**
 * 本地模型后端探测。
 *
 * 首页与「设置 → 模型 & Key」共用这一份逻辑，保证两处看到的状态一致。
 * 探测失败返回明确原因，不静默吞掉。
 */

export type LocalBackendType = 'text' | 'image';

export interface LocalBackendProbe {
  id: string;
  name: string;
  /** 开发代理路径；生产构建下这些路径不可用 */
  baseUrl: string;
  modelsPath: string;
  type: LocalBackendType;
  /** 默认监听端口；命令行工具没有端口 */
  port?: string;
}

export const LOCAL_BACKEND_PROBES: LocalBackendProbe[] = [
  { id: 'ollama', name: 'Ollama', baseUrl: '/local-api/ollama', modelsPath: '/api/tags', type: 'text', port: '11434' },
  { id: 'lm-studio', name: 'LM Studio', baseUrl: '/local-api/lm-studio', modelsPath: '/v1/models', type: 'text', port: '1234' },
  { id: 'mlx', name: 'MLX', baseUrl: '/local-api/mlx', modelsPath: '/v1/models', type: 'text', port: '8000' },
  { id: 'mflux', name: 'mflux', baseUrl: '/api/mflux', modelsPath: '/status', type: 'image' },
];

export interface LocalBackendResult extends LocalBackendProbe {
  status: 'online' | 'offline';
  models: string[];
  error?: string;
  checkedAt: number;
}

/** 兼容 Ollama /api/tags 与 OpenAI 兼容 /v1/models 两种响应 */
function extractModels(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const list = Array.isArray(obj.models) ? obj.models
    : Array.isArray(obj.data) ? obj.data
    : [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const m = item as Record<string, unknown>;
        return String(m.name ?? m.model ?? m.id ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

export async function detectLocalBackend(probe: LocalBackendProbe): Promise<LocalBackendResult> {
  try {
    const res = await fetch(probe.baseUrl + probe.modelsPath, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { ...probe, status: 'offline', models: [], error: `HTTP ${res.status}`, checkedAt: Date.now() };
    }
    // SPA fallback 会把不存在的代理路径返回成 200 的 HTML，必须校验响应确实是 JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      return {
        ...probe, status: 'offline', models: [],
        error: '本地代理不可用（响应不是 JSON），生产部署请使用团队共享服务',
        checkedAt: Date.now(),
      };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return {
        ...probe, status: 'offline', models: [],
        error: '本地代理响应无法解析', checkedAt: Date.now(),
      };
    }
    return {
      ...probe,
      status: 'online',
      models: extractModels(data),
      checkedAt: Date.now(),
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const reason = name === 'TimeoutError' ? '连接超时'
      : name === 'AbortError' ? '连接超时'
      : '本地服务未启动或代理不可用';
    return { ...probe, status: 'offline', models: [], error: reason, checkedAt: Date.now() };
  }
}

export async function detectAllLocalBackends(): Promise<LocalBackendResult[]> {
  return Promise.all(LOCAL_BACKEND_PROBES.map(detectLocalBackend));
}
