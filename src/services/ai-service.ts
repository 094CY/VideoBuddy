/**
 * AI Service - 真正调用 AI 模型 API 的服务层
 * 支持 OpenAI 兼容接口的多个供应商
 */

import { BUILT_IN_PROVIDERS, useModelStore } from '@/stores/model-store';
import { useUsageStore } from '@/stores/usage-store';

/** 获取供应商和模型的显示名称 */
function getDisplayNames(provider: string, model: string): { providerName: string; modelName: string } {
  const prov = BUILT_IN_PROVIDERS.find(p => p.id === provider);
  const providerName = prov?.name || provider;
  const modelInfo = prov?.models.find(m => m.id === model);
  const modelName = modelInfo?.name || model;
  return { providerName, modelName };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatOptions {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 获取供应商的聊天 API 端点
 */

/**
 * 构造 /api/proxy 的请求体。
 * 服务端托管的服务，浏览器不发送任何密钥，只带 serviceId 由服务端注入鉴权头；
 * 自建服务仍沿用前端持有的密钥（兼容旧配置）。
 */
function proxyEnvelope(params: {
  targetUrl: string;
  headers: Record<string, string>;
  body: unknown;
  method?: string;
}): string {
  const state = useModelStore.getState();
  const managed = state.services.find(
    (svc) => svc.managed && svc.baseUrl && params.targetUrl.startsWith(svc.baseUrl),
  );
  return JSON.stringify({
    targetUrl: params.targetUrl,
    headers: params.headers,
    body: params.body,
    ...(params.method ? { method: params.method } : {}),
    ...(managed ? { serviceId: managed.id } : {}),
  });
}

function getChatEndpoint(provider: string, model: string, baseUrl: string): string {
  switch (provider) {
    case 'hunyuan':
      return `${baseUrl}/chat/completions`;
    case 'deepseek':
      return `${baseUrl}/chat/completions`;
    case 'doubao':
      return `${baseUrl}/chat/completions`;
    case 'zhipu':
      return `${baseUrl}/chat/completions`;
    case 'dashscope':
      return `${baseUrl}/chat/completions`;
    case 'minimax':
      // MiniMax 已全面迁移到 OpenAI 兼容接口
      return `${baseUrl}/chat/completions`;
    case 'openai':
      return `${baseUrl}/chat/completions`;
    case 'anthropic':
      return `${baseUrl}/messages`;
    case 'google':
      return `${baseUrl}/models/${model}:generateContent`;
    case 'custom':
      return `${baseUrl}/chat/completions`;
    default:
      // 本地模型 (ollama / lm-studio / mlx) — baseUrl 已包含 proxy 前缀
      // Ollama 原生 /api/chat 不兼容，统一走 /v1/chat/completions
      if (baseUrl?.startsWith('/local-api/')) {
        return `${baseUrl}/v1/chat/completions`;
      }
      return `${baseUrl}/chat/completions`;
  }
}

/**
 * 构建请求头
 */
function buildHeaders(provider: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (provider) {
    case 'anthropic':
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      break;
    case 'google':
      headers['x-goog-api-key'] = apiKey;
      break;
    default:
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
  }

  return headers;
}

/**
 * 构建请求体
 */
function buildRequestBody(provider: string, model: string, messages: ChatMessage[], temperature: number, maxTokens: number): unknown {
  switch (provider) {
    case 'anthropic': {
      // Anthropic 使用不同的 API 格式
      const systemMsg = messages.find(m => m.role === 'system');
      const otherMsgs = messages.filter(m => m.role !== 'system');
      return {
        model,
        max_tokens: maxTokens,
        temperature,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: otherMsgs.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };
    }
    case 'google': {
      // Google Gemini 使用不同的格式
      const systemInstruction = messages.find(m => m.role === 'system');
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      return {
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } } : {}),
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };
    }
    case 'minimax': {
      // MiniMax OpenAI 兼容格式
      return {
        model: model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };
    }
    default: {
      // OpenAI 兼容格式（适用于大部分供应商）
      return {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };
    }
  }
}

/**
 * 解析响应体
 */
function parseResponse(provider: string, data: Record<string, unknown>): AIChatResponse {
  switch (provider) {
    case 'anthropic': {
      const content = data.content as Array<{ type: string; text: string }>;
      const usage = data.usage as { input_tokens: number; output_tokens: number } | undefined;
      return {
        content: content?.[0]?.text || '',
        usage: usage ? {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
        } : undefined,
      };
    }
    case 'google': {
      const candidates = data.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
      const usageMeta = data.usageMetadata as { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number } | undefined;
      return {
        content: candidates?.[0]?.content?.parts?.[0]?.text || '',
        usage: usageMeta ? {
          promptTokens: usageMeta.promptTokenCount,
          completionTokens: usageMeta.candidatesTokenCount,
          totalTokens: usageMeta.totalTokenCount,
        } : undefined,
      };
    }
    case 'minimax': {
      // MiniMax OpenAI 兼容格式
      const choices = data.choices as Array<{ message: { content: string } }>;
      const mmUsage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens: number } | undefined;
      return {
        content: choices?.[0]?.message?.content || '',
        usage: mmUsage ? {
          promptTokens: mmUsage.prompt_tokens || 0,
          completionTokens: mmUsage.completion_tokens || 0,
          totalTokens: mmUsage.total_tokens,
        } : undefined,
      };
    }
    default: {
      // OpenAI 兼容格式
      const choices = data.choices as Array<{ message: { content: string } }>;
      const usage = data.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
      return {
        content: choices?.[0]?.message?.content || '',
        usage: usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        } : undefined,
      };
    }
  }
}

/**
 * 调用 AI Chat API
 * 通过服务端代理 /api/proxy 转发请求以绕过 CORS 限制
 */
export async function callAIChat(options: AIChatOptions): Promise<AIChatResponse> {
  const {
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    temperature = 0.7,
    maxTokens = 2048,
    signal,
  } = options;

  // 混元特殊处理：如果 Key 是 SecretId:SecretKey 格式，走腾讯云原生 ChatCompletions API
  if (provider === 'hunyuan') {
    const credentials = parseHunyuanCredentials(apiKey);
    if (credentials) {
      return callHunyuanChatNative({
        credentials,
        model,
        messages,
        temperature,
        maxTokens,
        signal,
      });
    }
    // 如果不是 SecretId:SecretKey 格式，继续走 OpenAI 兼容接口
  }

  // 服务地址取自用户在设置中显式登记的服务；内置厂商预设只提供可编辑的填写辅助。
  // 本地模型走开发代理的相对路径，其余必须是完整 HTTPS 地址。
  const effectiveBaseUrl = baseUrl || '';
  const isLocalRoute = effectiveBaseUrl.startsWith('/local-api/') || effectiveBaseUrl.startsWith('/api/mflux');
  if (!isLocalRoute && !/^https:\/\//.test(effectiveBaseUrl)) {
    throw new Error('未配置有效的服务地址。请在「设置 → 模型 & Key」添加服务并填写 HTTPS 接口地址。');
  }

  const targetUrl = getChatEndpoint(provider, model, effectiveBaseUrl);
  const proxyHeaders = buildHeaders(provider, apiKey);
  const proxyBody = buildRequestBody(provider, model, messages, temperature, maxTokens);

  // 本地模型（baseUrl 以 /local-api/ 或 /api/ 开头）直接 fetch Vite proxy 路径，不走 Express proxy
  let response: Response;

  if (isLocalRoute) {
    // 本地后端只经 Vite dev 代理提供，生产构建没有该代理
    if (!import.meta.env.DEV) {
      throw new Error('本地模型仅在开发模式可用；生产部署请在「设置 → 模型 & Key」使用团队共享服务或个人云端服务。');
    }
    // 本地模型：直接 fetch Vite dev server proxy 路径（无 CORS 问题，同源请求）
    response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody),
      signal,
    });
  } else {
    // 云端模型：通过 Express proxy 转发以绕过 CORS
    response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: proxyEnvelope({ targetUrl, headers: proxyHeaders, body: proxyBody }),
      signal,
    });
  }

  if (!response.ok) {
    // 响应体只能读一次，上游错误详情由 throwApiError 统一解析
    await throwApiError(response, provider, `API 请求失败 (${response.status})`);
  }

  const data = await response.json();
  const result = parseResponse(provider, data as Record<string, unknown>);

  // 记录 API 调用到 usage store
  try {
    const { providerName, modelName } = getDisplayNames(provider, model);
    useUsageStore.getState().recordApiCall({
      callType: 'chat',
      provider,
      providerName,
      model,
      modelName,
      tokensUsed: result.usage?.totalTokens || 0,
      success: true,
    });
  } catch { /* 不阻塞主流程 */ }

  return result;
}

/**
 * 生成文本扩写的系统提示词
 */
export function getTextExpandSystemPrompt(): string {
  return `你是一个专业的视频文案创作助手。用户会给你一段简短的描述或主题，你需要将其扩展为一段适合视频旁白/文案的完整内容。

要求：
1. 保持主题一致，围绕用户的原始描述展开
2. 语言生动有趣，适合视频旁白阅读
3. 段落分明，节奏感强
4. 字数在 300-800 字之间
5. 直接输出扩写后的内容，不要添加额外的解释或前缀`;
}

/**
 * 生成脚本创作的系统提示词
 */
export function getScriptSystemPrompt(): string {
  return `你是一个专业的短视频脚本编剧。用户会给你一个主题或故事大纲，你需要创作一个完整的短视频分镜脚本。

请按以下 JSON 格式返回分镜列表（直接返回 JSON 数组，不要包含 markdown 代码块标记）：
[
  {
    "sceneNumber": 1,
    "durationSeconds": 3,
    "shotType": "中景/近景/特写/全景/远景",
    "cameraAngle": "平视/俯拍/仰拍/侧面",
    "cameraMovement": "固定/推进/拉远/摇/跟随",
    "sceneDescription": "场景描述",
    "dialogue": "台词（如有）",
    "mood": "情绪氛围"
  }
]

要求：
1. 分镜数量 5-10 个
2. 每个分镜时长 2-5 秒
3. 总时长控制在 30-60 秒
4. 镜头语言专业，画面感强
5. 直接返回 JSON 数组`;
}

/**
 * 剧情推演系统提示词
 */
export function getStoryExtrapolatePrompt(): string {
  return `你是一个专业的影视剧情推演师。用户会给你一个关键画面描述，你需要推演出这个画面之前和之后可能发生的剧情。

请按以下 JSON 格式返回推演结果（直接返回 JSON 数组，不要包含 markdown 代码块标记）：
[
  {
    "type": "before",
    "index": 2,
    "description": "详细的画面描述...",
    "mood": "情绪氛围关键词"
  },
  {
    "type": "before",
    "index": 1,
    "description": "详细的画面描述...",
    "mood": "情绪氛围关键词"
  },
  {
    "type": "after",
    "index": 1,
    "description": "详细的画面描述...",
    "mood": "情绪氛围关键词"
  },
  {
    "type": "after",
    "index": 2,
    "description": "详细的画面描述...",
    "mood": "情绪氛围关键词"
  }
]

要求：
1. 前因 2 个，后续 2 个，共 4 段推演
2. 每段推演的画面描述要具体、细腻、有画面感
3. 情绪氛围用 2-4 个关键词
4. 保持剧情连贯性和合理性
5. 直接返回 JSON 数组`;
}

/**
 * 画面推演系统提示词
 */
export function getTimeExtrapolatePrompt(): string {
  return `你是一个专业的影视画面推演师。用户会给你一个当前画面描述，你需要推演出这个画面前后几秒的变化。

请按以下 JSON 格式返回推演结果（直接返回 JSON 数组，不要包含 markdown 代码块标记）：
[
  {
    "type": "before",
    "index": 1,
    "description": "[5秒前] 详细的画面状态描述...",
    "mood": "情绪氛围关键词"
  },
  {
    "type": "after",
    "index": 1,
    "description": "[3秒后] 详细的画面状态描述...",
    "mood": "情绪氛围关键词"
  }
]

要求：
1. 回溯 1 个时间点，预测 1 个时间点
2. 注意物理运动的连续性（如人物姿态变化、物体位移、光线变化）
3. 带上时间标注（如 [5秒前]、[3秒后]）
4. 直接返回 JSON 数组`;
}


// ============================================================
// 图片生成 API
// ============================================================

export interface ImageGenOptions {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  signal?: AbortSignal;
}

export interface ImageGenResponse {
  /** 生成的图片 URL（或 base64 data URI） */
  imageUrl: string;
  /** 修订后的 prompt（某些 API 会返回） */
  revisedPrompt?: string;
}

/**
 * 构建图片生成请求的端点、头部、请求体
 */
/**
 * 长任务的单次轮询重试。
 *
 * 视频/混元生图这类任务要轮询几分钟，期间一次网络抖动（连接被重置、
 * 502、偶发超时）如果直接抛出，用户前面已经等掉的时间全白费了，
 * 而服务端其实还在正常处理。因此这里对「查询动作本身」做有限重试，
 * 只有连续失败才算真的失败。
 *
 * 注意区分两类错误：
 * - 用户主动取消（AbortError）→ 立即抛出，不重试
 * - 业务判定失败（任务确实 failed）→ 由调用方处理，不在这里吞掉
 */
async function withPollRetry<T>(
  action: () => Promise<T>,
  opts: { signal?: AbortSignal; label: string; maxRetries?: number },
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException('任务已取消', 'AbortError');
    }
    try {
      return await action();
    } catch (error) {
      // 只有用户主动取消才不重试；超时/网络抖动正是要重试的场景
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      if (attempt < maxRetries) {
        // 指数退避：1s → 2s → 4s，上限 8s
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${opts.label}：连续 ${maxRetries + 1} 次查询失败（${detail}）。任务可能仍在处理中，可稍后重试。`);
}

/**
 * 统一的 API 错误分级。
 *
 * 图片、视频、语音与文本调用统一处理 401/403：
 * 一律抛 `xxx API 请求失败 (401)` —— 用户看到状态码根本不知道该改什么。
 * 这里按状态码给出可执行的下一步，并附上上游返回的原始信息。
 *
 * 404 单独提示「模型 ID 是否正确」：模型 ID 写错是这个场景最常见的问题，
 * 而厂商返回的 404 信息往往只是 `model not found`，不说清是哪一环出错。
 */
async function throwApiError(
  response: Response,
  providerLabel: string,
  fallback: string,
): Promise<never> {
  let upstream = '';
  try {
    const errorData = (await response.json()) as Record<string, unknown>;
    const errMsg = errorData.error;
    if (typeof errMsg === 'string') {
      upstream = errMsg;
    } else if (errMsg && typeof errMsg === 'object') {
      upstream = (errMsg as Record<string, string>).message || '';
    } else if (typeof errorData.message === 'string') {
      upstream = errorData.message;
    }
  } catch {
    // 响应体不是 JSON，忽略
  }

  const detail = upstream ? `\n上游提示：${upstream}` : '';

  switch (response.status) {
    case 401:
    case 403:
      throw new Error(
        `API Key 无效、已过期，或没有该模型的访问权限（${providerLabel}）。\n` +
        `请到「设置 → 模型 & Key」检查该供应商的 Key 是否正确。${detail}`,
      );
    case 402:
      throw new Error(`账户余额不足或额度已用完，请充值后重试（${providerLabel}）。${detail}`);
    case 404:
      throw new Error(
        `接口或模型不存在（404）。\n` +
        `请确认模型 ID 是否填写正确，可在「设置 → 模型 & Key」中核对或重新添加。${detail}`,
      );
    case 429:
      throw new Error(`请求频率超限（429），请稍后再试（${providerLabel}）。${detail}`);
    case 500:
    case 502:
    case 503:
    case 504:
      throw new Error(`${providerLabel} 服务端暂时不可用（${response.status}），请稍后重试。${detail}`);
    default:
      throw new Error(`${fallback} (${response.status})${detail}`);
  }
}

/**
 * 把「用户取消信号」与「请求超时」合并成一个 signal。
 *
 * 外部 signal 仅在用户主动取消时触发；
 * 上游一旦挂起，isExecuting 会永远为 true，只能手动取消。
 */
function requestSignal(external?: AbortSignal, timeoutMs = 120000): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}


/**
 * 服务地址取自用户在设置中显式登记的服务；内置预设仅作为填写辅助。
 * 本地模型走开发代理的相对路径；其余必须是完整 HTTPS 地址。
 */
function requireServiceUrl(baseUrl: string | undefined, provider: string): void {
  if (provider === 'mflux' || provider === 'hunyuan' || provider === 'tencent-tts') return;
  const url = baseUrl || '';
  if (url.startsWith('/local-api/') || url.startsWith('/api/mflux')) return;
  if (!/^https:\/\//.test(url)) {
    throw new Error('未配置有效的服务地址。请在「设置 → 模型 & Key」添加服务并填写 HTTPS 接口地址。');
  }
}

function requireModelId(model: string | undefined): void {
  if (!model || !model.trim()) {
    throw new Error('未指定模型 ID。请在「设置 → 模型 & Key」添加模型，或在节点属性中选择。');
  }
}

function buildImageGenRequest(options: ImageGenOptions): {
  targetUrl: string;
  headers: Record<string, string>;
  body: unknown;
  parseResponse: (data: Record<string, unknown>) => ImageGenResponse;
} {
  const { provider, model, apiKey, baseUrl, prompt, negativePrompt, width = 1024, height = 1024 } = options;

  switch (provider) {
    // ---- OpenAI DALL-E ----
    case 'openai': {
      return {
        targetUrl: `${baseUrl}/images/generations`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          prompt,
          n: 1,
          size: `${width}x${height}`,
          response_format: 'url',
        },
        parseResponse: (data) => {
          const imgs = data.data as Array<{ url: string; revised_prompt?: string }>;
          return { imageUrl: imgs?.[0]?.url || '', revisedPrompt: imgs?.[0]?.revised_prompt };
        },
      };
    }

    // ---- Google Gemini 生图 ----
    // Gemini 不走 /images/generations，必须走 :generateContent，
    // 图片以 inlineData（base64）形式返回。
    case 'google': {
      const geminiModel = model;
      return {
        targetUrl: `${baseUrl}/models/${geminiModel}:generateContent`,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        },
        parseResponse: (data) => {
          const candidates = data.candidates as Array<{
            content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
          }>;
          const parts = candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              return { imageUrl: `data:${mime};base64,${part.inlineData.data}` };
            }
          }
          throw new Error('Gemini 未返回图片数据，请确认该模型支持图像生成');
        },
      };
    }

    // ---- Runway 生图 ----
    case 'runway': {
      return {
        targetUrl: `${baseUrl}/text_to_image`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          promptText: prompt,
          ratio: width === height ? '1920:1920' : width > height ? '1920:1080' : '1080:1920',
        },
        parseResponse: (data) => {
          const images = data.images as Array<{ url?: string; uri?: string; base64?: string }> | undefined;
          const first = images?.[0];
          if (first?.url || first?.uri) return { imageUrl: (first.url || first.uri) as string };
          if (first?.base64) return { imageUrl: `data:image/png;base64,${first.base64}` };
          throw new Error('Runway 未返回图片数据');
        },
      };
    }

    // ---- 智谱 CogView ----
    case 'zhipu': {
      return {
        targetUrl: `${baseUrl}/images/generations`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          prompt,
          size: `${width}x${height}`,
        },
        parseResponse: (data) => {
          const imgs = data.data as Array<{ url: string }>;
          return { imageUrl: imgs?.[0]?.url || '' };
        },
      };
    }

    // ---- 通义万相 ----
    case 'dashscope': {
      return {
        targetUrl: `${baseUrl}/services/aigc/text2image/image-synthesis`,
        // 同步模式：直接返回图片 URL。
        // 同步请求不启用异步任务头，
        // 结果只能拿到 task_id，最终被上层判为「返回为空」——万相生图等于 100% 失败。
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          input: { prompt, negative_prompt: negativePrompt || '' },
          parameters: { size: `${width}*${height}`, n: 1 },
        },
        parseResponse: (data) => {
          const output = data.output as Record<string, unknown>;
          if (output?.results) {
            const results = output.results as Array<{ url: string }>;
            return { imageUrl: results?.[0]?.url || '' };
          }
          // 仍然拿到异步任务时给出明确原因，而不是让上层抛出含糊的「返回为空」
          if (output?.task_id) {
            throw new Error('通义万相返回了异步任务，当前仅支持同步出图，请更换模型或稍后重试');
          }
          return { imageUrl: '' };
        },
      };
    }

    // ---- 腾讯混元 DiT（使用腾讯云原生 API，需特殊处理） ----
    case 'hunyuan': {
      // 混元图片生成走专用路径，在 callImageGeneration 中单独处理
      // 这里返回一个占位配置，实际不会被使用
      return {
        targetUrl: '__HUNYUAN_NATIVE_API__',
        headers: {},
        body: {},
        parseResponse: () => ({ imageUrl: '' }),
      };
    }

    // ---- 快手可灵图像 ----
    case 'kling': {
      return {
        targetUrl: `${baseUrl}/images/generations`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          prompt,
          negative_prompt: negativePrompt || '',
          n: 1,
          image_size: `${width}x${height}`,
        },
        parseResponse: (data) => {
          const imgs = data.data as Array<{ url: string }>;
          return { imageUrl: imgs?.[0]?.url || '' };
        },
      };
    }

    // ---- 火山引擎（豆包 / 即梦）生图 ----
    // 走方舟官方 /images/generations，baseUrl 默认与配置表保持一致
    case 'jimeng': {
      return {
        targetUrl: `${baseUrl}/images/generations`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: model,
          prompt,
          n: 1,
          size: `${width}x${height}`,
          response_format: 'url',
        },
        parseResponse: (data) => {
          const imgs = data.data as Array<{ url?: string; b64_image?: string }>;
          const first = imgs?.[0];
          return {
            imageUrl: first?.url || (first?.b64_image ? `data:image/png;base64,${first.b64_image}` : ''),
          };
        },
      };
    }

    // ---- 默认 OpenAI 兼容格式 ----
    default: {
      return {
        targetUrl: `${baseUrl || ''}/images/generations`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: {
          model,
          prompt,
          n: 1,
          size: `${width}x${height}`,
        },
        parseResponse: (data) => {
          const imgs = data.data as Array<{ url?: string; b64_json?: string }>;
          const first = imgs?.[0];
          return {
            imageUrl: first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : ''),
          };
        },
      };
    }
  }
}

/**
 * 调用腾讯云原生 API 代理
 * 用于混元生图/生视频等需要 TC3 签名鉴权的接口
 */
async function callTencentCloudAPI(params: {
  secretId: string;
  secretKey: string;
  service: string;
  action: string;
  payload: Record<string, unknown>;
  region?: string;
  version?: string;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const response = await fetch('/api/tencent-cloud', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secretId: params.secretId,
      secretKey: params.secretKey,
      service: params.service,
      action: params.action,
      payload: params.payload,
      region: params.region || 'ap-guangzhou',
      version: params.version || '2023-09-01',
    }),
    signal: requestSignal(params.signal),
  });

  if (!response.ok) {
    await throwApiError(response, '腾讯云', `腾讯云 ${params.action} 调用失败`);
  }

  return (await response.json()) as Record<string, unknown>;
}

/**
 * 解析混元 API Key：支持两种格式
 * 1. "SecretId:SecretKey" — 用于腾讯云原生 API（生图/生视频）
 * 2. 纯 API Key — 用于 OpenAI 兼容接口（生文）
 */
function parseHunyuanCredentials(apiKey: string): { secretId: string; secretKey: string } | null {
  // 去除前后空格
  const trimmed = apiKey.trim();
  // 兼容中文冒号 ：和英文冒号 :
  const normalized = trimmed.replace(/：/g, ':');
  if (normalized.includes(':')) {
    const parts = normalized.split(':');
    if (parts.length === 2 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
      return { secretId: parts[0].trim(), secretKey: parts[1].trim() };
    }
  }
  return null;
}

/**
 * 混元生文：通过腾讯云原生 ChatCompletions API（TC3 签名）
 * 使用 SecretId:SecretKey 格式的密钥，无需单独的 OpenAI 兼容 API Key
 */
async function callHunyuanChatNative(options: {
  credentials: { secretId: string; secretKey: string };
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<AIChatResponse> {
  const { credentials, model, messages, temperature, signal } = options;

  // 构建混元 ChatCompletions 请求体
  const payload: Record<string, unknown> = {
    Model: model,
    Messages: messages.map(m => ({
      Role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      Content: m.content,
    })),
    Temperature: temperature,
    TopP: 0.9,
    Stream: false,
  };

  const result = await callTencentCloudAPI({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: 'hunyuan',
    action: 'ChatCompletions',
    payload,
    signal,
  });

  const resp = result.Response as Record<string, unknown> | undefined;
  if (resp?.Error) {
    const err = resp.Error as Record<string, string>;
    throw new Error(`混元生文失败: ${err.Message || err.Code || '未知错误'}`);
  }

  // 解析响应 — 混元 ChatCompletions 返回格式
  const choices = resp?.Choices as Array<{ Message: { Role: string; Content: string } }> | undefined;
  const usage = resp?.Usage as { PromptTokens: number; CompletionTokens: number; TotalTokens: number } | undefined;

  return {
    content: choices?.[0]?.Message?.Content || '',
    usage: usage ? {
      promptTokens: usage.PromptTokens,
      completionTokens: usage.CompletionTokens,
      totalTokens: usage.TotalTokens,
    } : undefined,
  };
}

/**
 * 混元生图专用调用（腾讯云原生 API）
 * 根据模型 ID 选择不同的 API 接口：
 * - hunyuan-image-3: 混元生图 3.0（hunyuan 服务 SubmitHunyuanImageJob，异步）
 * - hunyuan-image-2: 混元生图 2.0（aiart 服务 TextToImageRapid，同步）
 */
async function callHunyuanImageGeneration(options: ImageGenOptions): Promise<ImageGenResponse> {
  const { apiKey, prompt, negativePrompt, width = 1024, height = 1024, signal } = options;

  // 解析凭证：先尝试当前传入的 apiKey
  let credentials = parseHunyuanCredentials(apiKey);

  // 如果当前 key 不是 SecretId:SecretKey 格式，自动从 store 中查找符合格式的混元 Key
  if (!credentials) {
    try {
      const { useModelStore } = await import('../stores/model-store');
      const nativeKey = useModelStore.getState().getPlainApiKey('hunyuan', true);
      if (nativeKey && nativeKey !== apiKey) {
        credentials = parseHunyuanCredentials(nativeKey);
      }
    } catch {
      // 忽略导入错误
    }
  }

  if (!credentials) {
    throw new Error(
      '混元生图需要腾讯云 SecretId 和 SecretKey。\n' +
      '请在"设置 → 模型 & Key"中，将腾讯云混元的 API Key 格式设为：\n' +
      'SecretId:SecretKey\n' +
      '（用英文冒号分隔，密钥格式见服务商文档）'
    );
  }

  // 根据模型 ID 路由到不同的 API
  const modelId = options.model;

  // ─── 混元生图 3.0 支持的分辨率白名单 ───
  const HUNYUAN3_RESOLUTIONS: [number, number][] = [
    [768, 768], [768, 1024], [1024, 768], [1024, 1024],
    [720, 1280], [1280, 720], [768, 1280], [1280, 768],
  ];
  // 混元生图 2.0 / 极速版支持的分辨率白名单
  const HUNYUAN2_RESOLUTIONS: [number, number][] = [
    [768, 768], [768, 1024], [1024, 768], [1024, 1024],
    [720, 1280], [1280, 720], [768, 1280], [1280, 768],
    [1080, 1080], [1440, 1080], [1080, 1440],
  ];

  /**
   * 将任意宽高映射到最接近的支持分辨率
   * 通过宽高比相似度 + 面积差来找最佳匹配
   */
  function snapToSupportedResolution(w: number, h: number, supportedList: [number, number][]): string {
    const inputRatio = w / h;
    let best = supportedList[0];
    let bestScore = Infinity;
    for (const [sw, sh] of supportedList) {
      const supportedRatio = sw / sh;
      // 比例差异（权重更大）+ 面积差异
      const ratioDiff = Math.abs(inputRatio - supportedRatio);
      const areaDiff = Math.abs(w * h - sw * sh) / (1024 * 1024);
      const score = ratioDiff * 3 + areaDiff;
      if (score < bestScore) {
        bestScore = score;
        best = [sw, sh];
      }
    }
    return `${best[0]}:${best[1]}`;
  }

  // ─── 混元生图 2.0（同步接口 TextToImageRapid，aiart 服务）───
  if (modelId === 'hunyuan-image-2') {
    const resolution = snapToSupportedResolution(width, height, HUNYUAN2_RESOLUTIONS);
    const result = await callTencentCloudAPI({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      service: 'aiart',
      action: 'TextToImageRapid',
      payload: {
        Prompt: prompt,
        ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
        Resolution: resolution,
        LogoAdd: 0,
      },
      version: '2022-12-29',
      signal,
    });

    const resp = result.Response as Record<string, unknown> | undefined;
    if (resp?.Error) {
      const err = resp.Error as Record<string, string>;
      throw new Error(`混元生图 2.0 失败: ${err.Message || err.Code || '未知错误'}`);
    }
    const resultImage = resp?.ResultImage as string;
    if (resultImage) {
      return { imageUrl: resultImage };
    }
    throw new Error('混元生图 2.0 返回为空。');
  }

  // ─── 混元生图极速版（同步接口 TextToImageLite，aiart 服务）───
  if (modelId === 'hunyuan-image-lite') {
    const resolution = snapToSupportedResolution(width, height, HUNYUAN2_RESOLUTIONS);
    const result = await callTencentCloudAPI({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      service: 'aiart',
      action: 'TextToImageLite',
      payload: {
        Prompt: prompt,
        ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
        Resolution: resolution,
        LogoAdd: 0,
      },
      version: '2022-12-29',
      signal,
    });

    const resp = result.Response as Record<string, unknown> | undefined;
    if (resp?.Error) {
      const err = resp.Error as Record<string, string>;
      throw new Error(`混元生图极速版失败: ${err.Message || err.Code || '未知错误'}`);
    }
    const resultImage = resp?.ResultImage as string;
    if (resultImage) {
      return { imageUrl: resultImage };
    }
    throw new Error('混元生图极速版返回为空。');
  }

  // ─── 混元生图 3.0（异步接口 SubmitHunyuanImageJob + 轮询，hunyuan 服务）───
  // 自动映射到支持的分辨率
  const resolution = snapToSupportedResolution(width, height, HUNYUAN3_RESOLUTIONS);

  // Step 1: 提交生图任务
  const submitResult = await callTencentCloudAPI({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: 'hunyuan',
    action: 'SubmitHunyuanImageJob',
    payload: {
      Prompt: prompt,
      ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
      Resolution: resolution,
      Num: 1,
      Revise: 1,  // 开启 prompt 扩写
    },
    signal,
  });

  // 检查提交结果
  const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
  if (!submitResponse) {
    throw new Error('混元生图 3.0 任务提交失败，返回数据格式异常。');
  }

  // 检查错误
  if (submitResponse.Error) {
    const err = submitResponse.Error as Record<string, string>;
    throw new Error(`混元生图 3.0 任务提交失败: ${err.Message || err.Code || '未知错误'}`);
  }

  const jobId = submitResponse.JobId as string;
  if (!jobId) {
    throw new Error('混元生图 3.0 任务提交失败，未返回 JobId。');
  }

  // Step 2: 轮询任务结果（最多 60 次，每次 2 秒，共 2 分钟）
  const maxPolls = 60;
  const pollInterval = 2000;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    if (signal?.aborted) {
      throw new Error('图片生成已取消');
    }

    const queryResult = await withPollRetry(
      () => callTencentCloudAPI({
        secretId: credentials.secretId,
        secretKey: credentials.secretKey,
        service: 'hunyuan',
        action: 'QueryHunyuanImageJob',
        payload: { JobId: jobId },
        signal,
      }),
      { signal, label: '混元生图任务查询' },
    );

    const queryResponse = queryResult.Response as Record<string, unknown> | undefined;
    if (!queryResponse) continue;

    if (queryResponse.Error) {
      const err = queryResponse.Error as Record<string, string>;
      throw new Error(`混元生图 3.0 查询失败: ${err.Message || err.Code || '未知错误'}`);
    }

    const statusCode = queryResponse.JobStatusCode as string;

    if (statusCode === '5') {
      // 处理完成
      const resultImages = queryResponse.ResultImage as string[];
      const revisedPrompts = queryResponse.RevisedPrompt as string[];
      if (resultImages && resultImages.length > 0) {
        return {
          imageUrl: resultImages[0],
          revisedPrompt: revisedPrompts?.[0],
        };
      }
      throw new Error('混元生图 3.0 完成但未返回图片地址。');
    }

    if (statusCode === '4') {
      // 处理失败
      const errMsg = queryResponse.JobErrorMsg as string || '未知错误';
      throw new Error(`混元生图 3.0 失败: ${errMsg}`);
    }

    // 状态 1（等待中）或 2（运行中）→ 继续轮询
  }

  throw new Error('混元生图 3.0 超时（已等待 2 分钟），任务可能仍在处理中。');
}

/**
 * 调用图片生成 API
 */
export async function callImageGeneration(options: ImageGenOptions): Promise<ImageGenResponse> {
  requireServiceUrl(options.baseUrl, options.provider);
  requireModelId(options.model);

  // mflux 本地生图 — 通过后端 CLI 调用
  if (options.provider === 'mflux') {
    const response = await fetch('/api/mflux/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: options.prompt,
        width: options.width || 512,
        height: options.height || 512,
        steps: options.steps || 4,
        model: options.model === 'flux-local' ? undefined : options.model,
      }),
      signal: requestSignal(options.signal),
    });

    if (!response.ok) {
      let errorMessage = `mflux 生图失败 (${response.status})`;
      try {
        const errData = await response.json();
        if (typeof (errData as Record<string, unknown>).error === 'string') errorMessage = (errData as Record<string, string>).error;
      } catch { /* ignore */ }
      throw new Error(errorMessage);
    }

    const data = await response.json() as { images: { b64_json: string }[] };
    const b64 = data.images?.[0]?.b64_json;
    if (!b64) throw new Error('mflux 未返回图片数据');

    let imageUrl = `data:image/png;base64,${b64}`;
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const saved = await fetch(
        `/api/assets/upload?name=${encodeURIComponent(`agent-${Date.now()}.png`)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Blob([bytes], { type: 'application/octet-stream' }),
          credentials: 'include',
        },
      );
      if (saved.ok) {
        const info = await saved.json() as { url?: string };
        if (info.url) imageUrl = info.url;
      }
    } catch (err) {
      console.warn('[mflux] 产物未能保存到服务端，刷新后可能丢失：', err);
    }

    try {
      useUsageStore.getState().recordApiCall({
        callType: 'image', provider: 'mflux', providerName: 'mflux',
        model: options.model, modelName: 'Flux 2 Local',
        tokensUsed: 0, success: true,
      });
    } catch { /* 不阻塞 */ }

    return { imageUrl };
  }

  // 混元生图走专用腾讯云原生 API
  if (options.provider === 'hunyuan') {
    const result = await callHunyuanImageGeneration(options);

    // 记录图片生成 API 调用
    try {
      const { providerName, modelName } = getDisplayNames(options.provider, options.model);
      useUsageStore.getState().recordApiCall({
        callType: 'image',
        provider: options.provider,
        providerName,
        model: options.model,
        modelName,
        tokensUsed: 0,
        success: true,
      });
    } catch { /* 不阻塞主流程 */ }

    return result;
  }

  const { targetUrl, headers, body, parseResponse } = buildImageGenRequest(options);

  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: proxyEnvelope({ targetUrl, headers, body }),
    signal: requestSignal(options.signal),
  });

  if (!response.ok) {
    await throwApiError(response, options.provider, '图片生成失败');
  }

  const data = await response.json();
  const result = parseResponse(data as Record<string, unknown>);

  if (!result.imageUrl) {
    throw new Error('图片生成返回为空，请检查 API Key 和模型配置。');
  }

  // 记录图片生成 API 调用
  try {
    const { providerName, modelName } = getDisplayNames(options.provider, options.model);
    useUsageStore.getState().recordApiCall({
      callType: 'image',
      provider: options.provider,
      providerName,
      model: options.model,
      modelName,
      tokensUsed: 0,
      success: true,
    });
  } catch { /* 不阻塞主流程 */ }

  return result;
}


// ============================================================
// 视频生成 API（异步任务模式：提交 → 轮询 → 获取结果）
// ============================================================

export interface VideoGenOptions {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  imageUrl?: string;       // 图生视频时的参考图
  duration?: number;       // 秒
  fps?: number;
  signal?: AbortSignal;
}

export interface VideoGenResponse {
  /** 视频文件 URL */
  videoUrl: string;
  /** 封面图 URL */
  coverUrl?: string;
  /** 任务 ID（异步模式） */
  taskId?: string;
  /** 任务状态 */
  status?: 'submitted' | 'processing' | 'succeed' | 'failed';
}

/**
 * 提交视频生成任务
 */
export async function submitVideoGeneration(options: VideoGenOptions): Promise<VideoGenResponse> {
  requireServiceUrl(options.baseUrl, options.provider);
  requireModelId(options.model);

  const { provider, model, apiKey, baseUrl, prompt, imageUrl, duration = 5 } = options;

  let targetUrl: string;
  let headers: Record<string, string>;
  let body: unknown;

  switch (provider) {
    case 'kling': {
      targetUrl = `${baseUrl}/videos/text2video`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        prompt,
        duration: String(duration),
        ...(imageUrl ? { image: imageUrl } : {}),
      };
      break;
    }
    case 'zhipu': {
      targetUrl = `${baseUrl}/videos/generations`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        prompt,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };
      break;
    }
    case 'minimax': {
      targetUrl = `${baseUrl}/video_generation`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        prompt,
      };
      break;
    }
    case 'runway': {
      targetUrl = `${baseUrl}/image_to_video`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        prompt,
        ...(imageUrl ? { promptImage: imageUrl } : {}),
        duration: duration,
      };
      break;
    }
    case 'hunyuan': {
      // 混元视频生成使用腾讯云 VCLM 服务 API
      // 支持多种视频生成能力：混元生视频、通用生视频、图生视频、视频风格化、图片跳舞、图片唱演、人像驱动
      let credentials = parseHunyuanCredentials(apiKey);

      // 如果当前 key 不是 SecretId:SecretKey 格式，自动从 store 中查找符合格式的混元 Key
      if (!credentials) {
        try {
          const { useModelStore } = await import('../stores/model-store');
          const nativeKey = useModelStore.getState().getPlainApiKey('hunyuan', true);
          if (nativeKey && nativeKey !== apiKey) {
            credentials = parseHunyuanCredentials(nativeKey);
          }
        } catch {
          // 忽略导入错误
        }
      }

      if (!credentials) {
        throw new Error(
          '混元视频生成需要腾讯云 SecretId 和 SecretKey。\n' +
          '请在"设置 → 模型 & Key"中，将腾讯云混元的 API Key 格式设为：\n' +
          'SecretId:SecretKey\n' +
          '（用英文冒号分隔，可在腾讯云控制台 → 访问管理 → API 密钥中获取）'
        );
      }

      // 根据模型类型选择不同的 VCLM API
      const modelId = model;

      // ─── 图生视频通用能力 SubmitImageToVideoGeneralJob（需要图片输入）───
      if (modelId === 'hunyuan-i2v' && imageUrl) {
        const i2vPayload: Record<string, unknown> = {
          Image: { Url: imageUrl },
          Fps: (options as VideoGenOptions & { fps?: number }).fps || 24,
        };
        if (prompt) {
          i2vPayload.Prompt = prompt;
        }

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitImageToVideoGeneralJob',
          payload: i2vPayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元图生视频任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `i2v:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元图生视频任务提交未返回 JobId');
      }

      // ─── 视频风格化 SubmitVideoStylizationJob（需要视频URL输入）───
      if (modelId === 'hunyuan-style') {
        const stylePayload: Record<string, unknown> = {
          StyleId: '2d_anime',
          VideoUrl: imageUrl || '',
        };

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitVideoStylizationJob',
          payload: stylePayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元视频风格化任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `style:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元视频风格化任务提交未返回 JobId');
      }

      // ─── 图片跳舞 SubmitImageAnimateJob（需要全身人像图片）───
      if (modelId === 'hunyuan-animate') {
        const animatePayload: Record<string, unknown> = {
          ImageUrl: imageUrl || '',
        };

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitImageAnimateJob',
          payload: animatePayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元图片跳舞任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `animate:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元图片跳舞任务提交未返回 JobId');
      }

      // ─── 图片唱演 SubmitPortraitSingJob（需要音频+图片）───
      if (modelId === 'hunyuan-portrait-sing') {
        const singPayload: Record<string, unknown> = {
          ImageUrl: imageUrl || '',
        };
        if (prompt) {
          singPayload.AudioUrl = prompt; // prompt 字段复用传递音频 URL
        }

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitPortraitSingJob',
          payload: singPayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元图片唱演任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `sing:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元图片唱演任务提交未返回 JobId');
      }

      // ─── 人像驱动 SubmitHumanActorJob（图片+音频+文本）───
      if (modelId === 'hunyuan-actor') {
        const actorPayload: Record<string, unknown> = {
          ImageUrl: imageUrl || '',
        };
        if (prompt) {
          actorPayload.Text = prompt;
        }

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitHumanActorJob',
          payload: actorPayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元人像驱动任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `actor:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元人像驱动任务提交未返回 JobId');
      }

      // ─── 混元生视频 SubmitHunyuanToVideoJob（文/图生视频，推荐首选）───
      if (modelId === 'hunyuan-video') {
        const hyVideoPayload: Record<string, unknown> = {
          Prompt: prompt || '生成一段高质量视频',
          LogoAdd: 0,
        };
        // 如果有参考图片，传入 Image 参数
        if (imageUrl) {
          hyVideoPayload.Image = { Url: imageUrl };
        }

        const submitResult = await callTencentCloudAPI({
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          service: 'vclm',
          action: 'SubmitHunyuanToVideoJob',
          payload: hyVideoPayload,
          version: '2024-05-23',
          signal: requestSignal(options.signal),
        });

        const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
        if (submitResponse?.Error) {
          const err = submitResponse.Error as Record<string, string>;
          throw new Error(`混元生视频任务提交失败: ${err.Message || err.Code || '未知错误'}`);
        }

        const jobId = submitResponse?.JobId as string;
        if (jobId) {
          return { videoUrl: '', taskId: `hyvideo:${jobId}`, status: 'submitted' };
        }
        throw new Error('混元生视频任务提交未返回 JobId');
      }

      // 通用生视频任务参数，取值由所接入服务的接口约定决定
      const aigcPayload: Record<string, unknown> = {
        Vendor: 'HY',
        Model: 'v1.5',
        LogoAdd: 0,
      };

      if (prompt) {
        aigcPayload.Prompt = prompt;
      }

      // 如果有参考图片，通过 ModelParam 传递
      if (imageUrl) {
        aigcPayload.ModelParam = JSON.stringify({ image: imageUrl });
      }

      const submitResult = await callTencentCloudAPI({
        secretId: credentials.secretId,
        secretKey: credentials.secretKey,
        service: 'vclm',
        action: 'SubmitAigcVideoJob',
        payload: aigcPayload,
        version: '2024-05-23',
        signal: requestSignal(options.signal),
      });

      const submitResponse = submitResult.Response as Record<string, unknown> | undefined;
      if (submitResponse?.Error) {
        const err = submitResponse.Error as Record<string, string>;
        throw new Error(`混元通用生视频任务提交失败: ${err.Message || err.Code || '未知错误'}`);
      }

      const jobId = submitResponse?.JobId as string;
      if (jobId) {
        return { videoUrl: '', taskId: `aigc:${jobId}`, status: 'submitted' };
      }
      throw new Error('混元通用生视频任务提交未返回 JobId');
    }
    // ---- 阿里通义万相视频（异步任务，走原生 /api/v1，不走兼容模式） ----
    case 'dashscope': {
      targetUrl = `${baseUrl}/services/aigc/video-generation/video-synthesis`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        input: { prompt, ...(imageUrl ? { img_url: imageUrl } : {}) },
      };
      break;
    }
    // ---- 火山引擎视频（方舟 contents/generations/tasks） ----
    case 'jimeng': {
      targetUrl = `${baseUrl}/contents/generations/tasks`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        content: [
          {
            type: 'text',
            text: imageUrl ? `${prompt}` : prompt,
          },
          ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : []),
        ],
      };
      break;
    }
    default: {
      targetUrl = `${baseUrl || ''}/videos/generations`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = { model, prompt, duration };
      break;
    }
  }

  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: proxyEnvelope({ targetUrl, headers, body }),
    signal: requestSignal(options.signal),
  });

  if (!response.ok) {
    await throwApiError(response, options.provider, '视频生成失败');
  }

  const data = (await response.json()) as Record<string, unknown>;

  // 各供应商返回格式不同，统一处理
  // 可灵返回 { data: { task_id, task_status } }
  if (data.data && typeof data.data === 'object') {
    const d = data.data as Record<string, unknown>;
    if (d.task_id) {
      return { videoUrl: '', taskId: d.task_id as string, status: 'submitted' };
    }
    // 有些供应商直接返回 video URL
    if (d.video_url || d.url) {
      return { videoUrl: (d.video_url || d.url) as string, status: 'succeed' };
    }
  }

  // 阿里百炼返回 { output: { task_id, task_status } }
  const output = data.output as Record<string, unknown> | undefined;
  if (output?.task_id) {
    return { videoUrl: '', taskId: output.task_id as string, status: 'submitted' };
  }
  if (output?.video_url) {
    return { videoUrl: output.video_url as string, status: 'succeed' };
  }

  // 智谱返回 { id, task_status, video_result }
  if (data.id) {
    return { videoUrl: '', taskId: data.id as string, status: 'submitted' };
  }

  // 通用格式
  if (data.task_id) {
    return { videoUrl: '', taskId: data.task_id as string, status: 'submitted' };
  }

  // 如果直接返回了视频结果
  if (data.video_url) {
    return { videoUrl: data.video_url as string, status: 'succeed' };
  }

  return { videoUrl: '', taskId: '', status: 'submitted' };
}

/**
 * 轮询视频生成任务状态
 */
export async function pollVideoTask(options: {
  provider: string;
  taskId: string;
  apiKey: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<VideoGenResponse> {
  const { provider, taskId, apiKey, baseUrl } = options;
  requireServiceUrl(baseUrl, provider);

  // 混元视频使用腾讯云 VCLM API 查询，走 TC3 签名鉴权
  if (provider === 'hunyuan') {
    const credentials = parseHunyuanCredentials(apiKey);
    if (!credentials) {
      // 尝试从 store 获取
      let creds: { secretId: string; secretKey: string } | null = null;
      try {
        const { useModelStore } = await import('../stores/model-store');
        const nativeKey = useModelStore.getState().getPlainApiKey('hunyuan', true);
        if (nativeKey) creds = parseHunyuanCredentials(nativeKey);
      } catch { /* ignore */ }
      if (!creds) throw new Error('混元视频查询需要 SecretId:SecretKey 格式的 API Key');
      return pollHunyuanVideoTask(creds, taskId, options.signal);
    }
    return pollHunyuanVideoTask(credentials, taskId, options.signal);
  }

  let targetUrl: string;
  let headers: Record<string, string>;

  switch (provider) {
    case 'kling':
      targetUrl = `${baseUrl}/videos/text2video/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    case 'zhipu':
      targetUrl = `${baseUrl}/async-result/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    case 'minimax':
      targetUrl = `${baseUrl}/query/video_generation?task_id=${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    case 'runway':
      targetUrl = `${baseUrl}/tasks/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    case 'dashscope':
      targetUrl = `${baseUrl}/tasks/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    case 'jimeng':
      targetUrl = `${baseUrl}/contents/generations/tasks/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
    default:
      targetUrl = `${baseUrl || ''}/tasks/${taskId}`;
      headers = { 'Authorization': `Bearer ${apiKey}` };
      break;
  }

  // 使用 GET 方法通过代理查询
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: proxyEnvelope({
      targetUrl,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: {},
      method: 'GET',
    }),
    signal: requestSignal(options.signal),
  });

  if (!response.ok) {
    throw new Error(`查询视频任务状态失败 (${response.status})`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  // 可灵格式
  if (data.data && typeof data.data === 'object') {
    const d = data.data as Record<string, unknown>;
    const status = d.task_status as string;
    if (status === 'succeed' || status === 'completed') {
      const works = d.task_result as Record<string, unknown>;
      const videos = (works?.videos || d.videos) as Array<{ url: string; cover_url?: string }>;
      return {
        videoUrl: videos?.[0]?.url || '',
        coverUrl: videos?.[0]?.cover_url,
        taskId,
        status: 'succeed',
      };
    }
    if (status === 'failed') {
      return { videoUrl: '', taskId, status: 'failed' };
    }
    return { videoUrl: '', taskId, status: 'processing' };
  }

  // 阿里百炼格式：{ output: { task_status, video_url } }
  const out = data.output as Record<string, unknown> | undefined;
  if (out) {
    const st = (out.task_status as string) || '';
    if (st === 'SUCCEEDED') {
      return { videoUrl: (out.video_url as string) || '', taskId, status: 'succeed' };
    }
    if (st === 'FAILED' || st === 'CANCELED') {
      return { videoUrl: '', taskId, status: 'failed' };
    }
    return { videoUrl: '', taskId, status: 'processing' };
  }

  // 火山方舟格式：{ id, status, content: { video_url } }
  const vStatus = data.status as string;
  if (vStatus === 'succeeded') {
    const content = data.content as Record<string, unknown> | undefined;
    const url = (content?.video_url as string) || (data.video_url as string);
    if (url) return { videoUrl: url, taskId, status: 'succeed' };
  }
  if (vStatus === 'failed' || vStatus === 'cancelled') {
    return { videoUrl: '', taskId, status: 'failed' };
  }

  // 智谱格式
  const taskStatus = data.task_status as string;
  if (taskStatus === 'SUCCESS' || taskStatus === 'COMPLETED') {
    const videoResult = data.video_result as Array<{ url: string; cover_image_url?: string }>;
    return {
      videoUrl: videoResult?.[0]?.url || '',
      coverUrl: videoResult?.[0]?.cover_image_url,
      taskId,
      status: 'succeed',
    };
  }
  if (taskStatus === 'FAIL') {
    return { videoUrl: '', taskId, status: 'failed' };
  }

  return { videoUrl: '', taskId, status: 'processing' };
}

/**
 * 混元视频任务轮询：通过腾讯云 VCLM API 查询任务状态
 * taskId 格式：`类型:实际JobId`
 * 支持类型：aigc / i2v / style / hyvideo / animate / sing / actor
 */
async function pollHunyuanVideoTask(
  credentials: { secretId: string; secretKey: string },
  taskId: string,
  signal?: AbortSignal
): Promise<VideoGenResponse> {
  // 解析 taskId 前缀确定查询接口
  let action: string;
  let actualJobId: string;
  let videoUrlField: string;

  if (taskId.startsWith('i2v:')) {
    action = 'DescribeImageToVideoGeneralJob';
    actualJobId = taskId.slice(4);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('style:')) {
    action = 'DescribeVideoStylizationJob';
    actualJobId = taskId.slice(6);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('hyvideo:')) {
    action = 'DescribeHunyuanToVideoJob';
    actualJobId = taskId.slice(8);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('animate:')) {
    action = 'DescribeImageAnimateJob';
    actualJobId = taskId.slice(8);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('sing:')) {
    action = 'DescribePortraitSingJob';
    actualJobId = taskId.slice(5);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('actor:')) {
    action = 'DescribeHumanActorJob';
    actualJobId = taskId.slice(6);
    videoUrlField = 'ResultVideoUrl';
  } else if (taskId.startsWith('aigc:')) {
    action = 'DescribeAigcVideoJob';
    actualJobId = taskId.slice(5);
    videoUrlField = 'ResultUrl';
  } else {
    // 兼容旧格式，默认用 DescribeAigcVideoJob
    action = 'DescribeAigcVideoJob';
    actualJobId = taskId;
    videoUrlField = 'ResultUrl';
  }

  const queryResult = await callTencentCloudAPI({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: 'vclm',
    action,
    payload: { JobId: actualJobId },
    version: '2024-05-23',
    signal,
  });

  const resp = queryResult.Response as Record<string, unknown> | undefined;
  if (resp?.Error) {
    const err = resp.Error as Record<string, string>;
    throw new Error(`混元视频任务查询失败: ${err.Message || err.Code || '未知错误'}`);
  }

  const status = resp?.Status as string;

  // VCLM 状态码：WAIT=等待中, RUN=执行中, DONE=成功, FAIL=失败
  if (status === 'DONE' || status === 'JobSuccess') {
    const videoUrl = (resp?.[videoUrlField] || resp?.ResultVideoUrl || resp?.ResultUrl || '') as string;
    return { videoUrl, taskId, status: 'succeed' };
  }
  if (status === 'FAIL' || status === 'JobFailed' || status === 'JobModerationFailed') {
    const errMsg = (resp?.ErrorMessage || resp?.ErrorCode || '任务失败') as string;
    throw new Error(`混元视频生成失败: ${errMsg}`);
  }

  // WAIT / RUN / JobInit / JobRunning
  return { videoUrl: '', taskId, status: 'processing' };
}

/**
 * 完整的视频生成流程：提交 + 轮询直到完成
 */
export async function callVideoGeneration(options: VideoGenOptions): Promise<VideoGenResponse> {
  const submitResult = await submitVideoGeneration(options);

  // 如果直接返回了视频（某些供应商同步返回）
  if (submitResult.status === 'succeed' && submitResult.videoUrl) {
    // 记录视频生成 API 调用
    try {
      const { providerName, modelName } = getDisplayNames(options.provider, options.model);
      useUsageStore.getState().recordApiCall({
        callType: 'video',
        provider: options.provider,
        providerName,
        model: options.model,
        modelName,
        tokensUsed: 0,
        success: true,
      });
    } catch { /* 不阻塞主流程 */ }
    return submitResult;
  }

  const videoTaskId = submitResult.taskId;
  if (!videoTaskId) {
    throw new Error('视频生成任务提交失败，未返回任务 ID。');
  }

  // 轮询等待结果（最多轮询 60 次，每次 5 秒，共 5 分钟）
  const maxPolls = 60;
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    if (options.signal?.aborted) {
      throw new Error('视频生成已取消');
    }

    const pollResult = await withPollRetry(
      () => pollVideoTask({
        provider: options.provider,
        taskId: videoTaskId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        signal: requestSignal(options.signal),
      }),
      { signal: options.signal, label: '视频任务状态查询' },
    );

    if (pollResult.status === 'succeed') {
      if (!pollResult.videoUrl) {
        throw new Error('视频生成完成但未返回视频地址。');
      }
      // 记录视频生成 API 调用
      try {
        const { providerName, modelName } = getDisplayNames(options.provider, options.model);
        useUsageStore.getState().recordApiCall({
          callType: 'video',
          provider: options.provider,
          providerName,
          model: options.model,
          modelName,
          tokensUsed: 0,
          success: true,
        });
      } catch { /* 不阻塞主流程 */ }
      return pollResult;
    }

    if (pollResult.status === 'failed') {
      throw new Error('视频生成任务失败，请检查 prompt 内容后重试。');
    }

    // 继续轮询...
  }

  const pending = Object.assign(
    new Error('视频生成超时（已等待 5 分钟），任务已提交，可稍后查询结果。'),
    {
      isPendingVideoTask: true,
      taskId: videoTaskId,
      provider: options.provider,
      model: options.model,
      submittedAt: new Date().toISOString(),
    },
  );
  throw pending;
}


// ============================================================
// 语音合成 (TTS) API
// ============================================================

export interface TTSOptions {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  text: string;
  voice?: string;
  speed?: number;
  signal?: AbortSignal;
}

export interface TTSResponse {
  /** 音频 URL 或 base64 data URI */
  audioUrl: string;
  /** 音频时长（秒） */
  duration?: number;
}

/**
 * 调用语音合成 API
 */
export async function callTTS(options: TTSOptions): Promise<TTSResponse> {
  requireServiceUrl(options.baseUrl, options.provider);
  requireModelId(options.model);

  const { provider, model, apiKey, baseUrl, text, voice = 'alloy', speed = 1.0 } = options;

  // 腾讯云 TTS 使用 TC3 签名鉴权
  if (provider === 'tencent-tts') {
    return callTencentTTS(options);
  }

  let targetUrl: string;
  let headers: Record<string, string>;
  let body: unknown;

  switch (provider) {
    case 'openai': {
      targetUrl = `${baseUrl}/audio/speech`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        input: text,
        voice: voice || 'alloy',
        speed: speed,
        response_format: 'mp3',
      };
      break;
    }
    case 'minimax': {
      targetUrl = `${baseUrl}/t2a_v2`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: model,
        text,
        voice_setting: { voice_id: voice || 'male-qn-qingse' },
      };
      break;
    }
    case 'elevenlabs': {
      const voiceId = voice || '21m00Tcm4TlvDq8ikWAM';
      targetUrl = `${baseUrl}/text-to-speech/${voiceId}`;
      headers = { 'Content-Type': 'application/json', 'xi-api-key': apiKey };
      body = {
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
      };
      break;
    }
    // ---- Google Gemini TTS ----
    // 同样走 :generateContent，音频以 inlineData（base64）返回。
    // 音色用预置音色名（Kore / Puck 等），数字音色 ID 不适用。
    case 'google': {
      const ttsModel = model;
      const voiceName = voice && !/^\d+$/.test(voice) ? voice : 'Kore';
      targetUrl = `${baseUrl}/models/${ttsModel}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
      body = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      };
      break;
    }
    default: {
      targetUrl = `${baseUrl || ''}/audio/speech`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = { model, input: text, voice, speed };
      break;
    }
  }

  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: proxyEnvelope({ targetUrl, headers, body }),
    signal: requestSignal(options.signal),
  });

  if (!response.ok) {
    await throwApiError(response, options.provider, '语音合成失败');
  }

  const data = (await response.json()) as Record<string, unknown>;

  let ttsResult: TTSResponse | null = null;

  // MiniMax 返回 { data: { audio: { audio_url } } }
  if (data.data && typeof data.data === 'object') {
    const d = data.data as Record<string, unknown>;
    if (d.audio && typeof d.audio === 'object') {
      const audio = d.audio as Record<string, unknown>;
      ttsResult = { audioUrl: (audio.audio_url || audio.url) as string || '' };
    }
  }

  // ElevenLabs / OpenAI 返回音频二进制 → 代理会以 base64 或 URL 返回
  if (!ttsResult && (data.audio_url || data.url)) {
    ttsResult = { audioUrl: (data.audio_url || data.url) as string };
  }

  // 如果代理返回了 base64 编码的音频
  if (!ttsResult && data.audio_base64) {
    ttsResult = { audioUrl: `data:audio/mp3;base64,${data.audio_base64}` };
  }

  // 代理返回了 data_uri（二进制音频转换后）
  if (!ttsResult && data.data_uri) {
    ttsResult = { audioUrl: data.data_uri as string };
  }

  // Google Gemini 返回 { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
  if (!ttsResult && data.candidates) {
    const candidates = data.candidates as Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
    for (const part of candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'audio/mp3';
        ttsResult = { audioUrl: `data:${mime};base64,${part.inlineData.data}` };
        break;
      }
    }
  }

  if (!ttsResult) {
    throw new Error('语音合成返回格式异常，请检查 API Key 和模型配置。');
  }

  // 记录 TTS API 调用
  try {
    const { providerName, modelName } = getDisplayNames(provider, model);
    useUsageStore.getState().recordApiCall({
      callType: 'tts',
      provider,
      providerName,
      model,
      modelName,
      tokensUsed: 0,
      success: true,
    });
  } catch { /* 不阻塞主流程 */ }

  return ttsResult;
}

/**
 * 腾讯云语音合成 TTS（使用 TC3-HMAC-SHA256 签名鉴权）
 */
async function callTencentTTS(options: TTSOptions): Promise<TTSResponse> {
  const { apiKey, text, voice = '101001', speed = 1.0, signal } = options;

  // 解析凭证
  let credentials = parseHunyuanCredentials(apiKey);

  // 如果当前 key 不是 SecretId:SecretKey 格式，尝试从 store 中查找
  if (!credentials) {
    try {
      const { useModelStore } = await import('../stores/model-store');
      const nativeKey = useModelStore.getState().getPlainApiKey('tencent-tts');
      if (nativeKey) {
        credentials = parseHunyuanCredentials(nativeKey);
      }
    } catch { /* ignore */ }
  }

  if (!credentials) {
    throw new Error(
      '腾讯云语音合成需要 SecretId 和 SecretKey。\n' +
      '请在"设置 → 模型 & Key"中，将腾讯云 TTS 的 API Key 格式设为：\n' +
      'SecretId:SecretKey'
    );
  }

  // 调用腾讯云 TTS API
  const payload: Record<string, unknown> = {
    Text: text,
    SessionId: `tts-${Date.now()}`,
    Volume: 5,
    Speed: speed,
    VoiceType: Number(voice) || 101001,
    Codec: 'mp3',
    EnableSubtitle: false,
  };

  const result = await callTencentCloudAPI({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: 'tts',
    action: 'TextToVoice',
    payload,
    version: '2019-08-23',
    signal,
  });

  const resp = result.Response as Record<string, unknown> | undefined;
  if (resp?.Error) {
    const err = resp.Error as Record<string, string>;
    throw new Error(`腾讯云语音合成失败: ${err.Message || err.Code || '未知错误'}`);
  }

  const audioBase64 = resp?.Audio as string;
  if (!audioBase64) {
    throw new Error('腾讯云语音合成返回为空');
  }

  // 记录 TTS API 调用
  try {
    const { providerName, modelName } = getDisplayNames('tencent-tts', options.model);
    useUsageStore.getState().recordApiCall({
      callType: 'tts',
      provider: 'tencent-tts',
      providerName,
      model: options.model,
      modelName,
      tokensUsed: 0,
      success: true,
    });
  } catch { /* 不阻塞主流程 */ }

  return {
    audioUrl: `data:audio/mp3;base64,${audioBase64}`,
  };
}


/** 续查已提交但超时的视频任务；查询参数从当前模型配置实时取，不持久化密钥 */
export async function resumeVideoTask(params: {
  taskId: string; provider: string; model: string;
  apiKey: string; baseUrl: string; signal?: AbortSignal;
}): Promise<VideoGenResponse> {
  const pollResult = await pollVideoTask({
    provider: params.provider,
    taskId: params.taskId,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    signal: requestSignal(params.signal),
  });
  if (pollResult.status === 'succeed' && pollResult.videoUrl) return pollResult;
  if (pollResult.status === 'failed') throw new Error('视频任务已失败，请重新生成');
  throw new Error('视频任务仍在处理中，请稍后再查询');
}
