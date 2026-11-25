import type { ModelProvider } from '@/types';

/**
 * 接口协议目录。
 *
 * 协议指「请求格式」而非厂商。用户添加一个服务时：
 *   1. 选一个接入预设（自动填好地址与协议），或选自定义
 *   2. 填 API Key
 *   3. 填模型 ID（预设会给出常用示例，可修改）
 * 平台不内置任何密钥，模型 ID 始终由用户按服务商文档确认。
 *
 * baseUrl 的语义统一为「API 根路径」，不应包含具体端点。
 * 例如 https://dashscope.aliyuncs.com/compatible-mode/v1
 * 平台会自动拼接 /chat/completions、/images/generations 等路径。
 */
export interface ProtocolDef {
  id: string;
  name: string;
  description: string;
  authHint: string;
  types: Array<'text' | 'image' | 'video' | 'audio'>;
  /** 该协议下平台自动拼接的端点，用于界面说明与连通性测试 */
  endpoints: Partial<Record<'text' | 'image' | 'video' | 'audio', string>>;
  /** baseUrl 填写示例 */
  baseUrlHint: string;
}

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'openai', name: 'OpenAI 兼容（通用）',
    description: 'chat/completions、images/generations、audio/speech。主流文本与生图服务普遍支持',
    authHint: 'Authorization: Bearer {key}',
    types: ['text', 'image', 'video', 'audio'],
    endpoints: {
      text: '/chat/completions', image: '/images/generations',
      audio: '/audio/speech', video: '/videos/generations',
    },
    baseUrlHint: 'https://<host>/v1',
  },
  {
    id: 'anthropic', name: 'Anthropic Messages',
    description: '使用 messages 数组与 x-api-key 鉴权的文本对话格式',
    authHint: 'x-api-key: {key} + anthropic-version',
    types: ['text'],
    endpoints: { text: '/messages' },
    baseUrlHint: 'https://<host>/anthropic  或  https://<host>/v1',
  },
  {
    id: 'google', name: 'Gemini generateContent',
    description: '使用 contents / inlineData 的文本、图像与语音格式',
    authHint: 'x-goog-api-key: {key}',
    types: ['text', 'image', 'audio'],
    endpoints: { text: '/models/{model}:generateContent', image: '/models/{model}:generateContent' },
    baseUrlHint: 'https://<host>/v1beta',
  },
  {
    id: 'jimeng', name: '方舟异步任务（contents）',
    description: '图片走 /images/generations；视频走 /contents/generations/tasks 提交并按任务 ID 轮询',
    authHint: 'Authorization: Bearer {key}',
    types: ['text', 'image', 'video'],
    endpoints: {
      text: '/chat/completions', image: '/images/generations',
      video: '/contents/generations/tasks',
    },
    baseUrlHint: 'https://<host>/api/v3',
  },
  {
    id: 'kling', name: '异步视频任务（task_id 轮询）',
    description: '提交后返回 task_id，通过轮询获取视频或图片地址',
    authHint: 'Authorization: Bearer {key}',
    types: ['video', 'image'],
    endpoints: { video: '/v1/videos/generations', image: '/v1/images/generations' },
    baseUrlHint: 'https://<host>',
  },
  {
    id: 'dashscope', name: '异步任务（output.task_id）',
    description: '提交后返回 output.task_id，通过任务查询接口取结果',
    authHint: 'Authorization: Bearer {key}',
    types: ['image', 'video'],
    endpoints: { image: '/services/aigc/text2image/image-synthesis', video: '/services/aigc/video2video/video-synthesis' },
    baseUrlHint: 'https://<host>',
  },
  {
    id: 'elevenlabs', name: '语音合成（voice_id 路径）',
    description: '按 voice_id 路径调用的文本转语音格式',
    authHint: 'xi-api-key: {key}',
    types: ['audio'],
    endpoints: { audio: '/v1/text-to-speech/{voice_id}' },
    baseUrlHint: 'https://<host>',
  },
  {
    id: 'hunyuan', name: '原生签名接口（图片 / 视频）',
    description: '使用请求签名鉴权，密钥需填 SecretId:SecretKey',
    authHint: 'SecretId:SecretKey',
    types: ['image', 'video', 'text'],
    endpoints: { image: '服务端原生签名代理', video: '服务端原生签名代理' },
    baseUrlHint: '留空（由服务端原生签名代理处理）',
  },
  {
    id: 'custom', name: '自定义（标准兼容）',
    description: '按标准兼容格式请求，地址与模型 ID 由用户填写',
    authHint: 'Authorization: Bearer {key}',
    types: ['text', 'image', 'video', 'audio'],
    endpoints: { text: '/chat/completions', image: '/images/generations' },
    baseUrlHint: 'https://<host>/v1',
  },
];

/**
 * 旧配置里出现过的协议 id → 现行协议。历史服务配置继续可用。
 */
const PROTOCOL_ALIASES: Record<string, string> = {
  zhipu: 'openai', minimax: 'openai', deepseek: 'openai', doubao: 'openai',
  runway: 'kling', 'tencent-tts': 'elevenlabs',
};

export function normalizeProtocolId(id: string): string {
  return PROTOCOL_ALIASES[id] || (PROTOCOLS.some((p) => p.id === id) ? id : 'openai');
}

export function getProtocol(id: string): ProtocolDef | undefined {
  const normalized = normalizeProtocolId(id);
  return PROTOCOLS.find((p) => p.id === normalized);
}

/**
 * 接入预设：只提供公开文档中的接入地址与请求格式，不含任何密钥。
 * 模型 ID 为可编辑的常用示例，用户仍需按服务商当前文档确认。
 */
export interface ServicePreset {
  id: string;
  name: string;
  group: string;
  protocol: string;
  baseUrl: string;
  capabilities: Array<'text' | 'image' | 'video' | 'audio'>;
  /** 常用模型 ID 示例，可编辑；不构成平台内置模型清单 */
  modelExamples: Array<{ id: string; type: 'text' | 'image' | 'video' | 'audio' }>;
  docUrl: string;
}

export const SERVICE_PRESETS: ServicePreset[] = [
  {
    id: 'bailian-openai', name: '阿里百炼（OpenAI 兼容）', group: '文本 / 通用',
    protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: ['text', 'image'],
    modelExamples: [
      { id: 'qwen-plus', type: 'text' }, { id: 'qwen3-max', type: 'text' },
      { id: 'qwen-image', type: 'image' },
    ],
    docUrl: 'https://help.aliyun.com/zh/model-studio/what-is-model-studio',
  },
  {
    id: 'bailian-anthropic', name: '阿里百炼（Anthropic 兼容）', group: '文本 / 通用',
    protocol: 'anthropic', baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    capabilities: ['text'],
    modelExamples: [{ id: 'qwen3-max', type: 'text' }],
    docUrl: 'https://help.aliyun.com/zh/model-studio/what-is-model-studio',
  },
  {
    id: 'volcengine-ark', name: '火山方舟（Seedance / Seedream / Doubao）', group: '视频 / 生图',
    protocol: 'jimeng', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    capabilities: ['text', 'image', 'video'],
    modelExamples: [
      { id: 'doubao-seedance-1-0-pro-250528', type: 'video' },
      { id: 'doubao-seedream-4-0-250828', type: 'image' },
      { id: 'doubao-pro-32k', type: 'text' },
    ],
    docUrl: 'https://www.volcengine.cn/docs/82379/2298881',
  },
  {
    id: 'deepseek', name: 'DeepSeek（OpenAI 兼容）', group: '文本 / 通用',
    protocol: 'openai', baseUrl: 'https://api.deepseek.com',
    capabilities: ['text'],
    modelExamples: [{ id: 'deepseek-chat', type: 'text' }, { id: 'deepseek-reasoner', type: 'text' }],
    docUrl: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'zhipu', name: '智谱（OpenAI 兼容）', group: '文本 / 通用',
    protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: ['text', 'image', 'video'],
    modelExamples: [{ id: 'glm-4.6', type: 'text' }, { id: 'cogview-3-plus', type: 'image' }],
    docUrl: 'https://docs.bigmodel.cn/',
  },
  {
    id: 'moonshot', name: 'Kimi（OpenAI 兼容）', group: '文本 / 通用',
    protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1',
    capabilities: ['text'],
    modelExamples: [{ id: 'kimi-k2', type: 'text' }],
    docUrl: 'https://platform.moonshot.cn/docs/',
  },
  {
    id: 'minimax', name: 'MiniMax（OpenAI 兼容）', group: '文本 / 通用',
    protocol: 'openai', baseUrl: 'https://api.minimax.cn/v1',
    capabilities: ['text', 'audio', 'video'],
    modelExamples: [{ id: 'MiniMax-M2', type: 'text' }, { id: 'speech-2.6-hd', type: 'audio' }],
    docUrl: 'https://platform.minimaxi.com/document/',
  },
  {
    id: 'custom', name: '自定义服务', group: '自定义',
    protocol: 'openai', baseUrl: '', capabilities: ['text', 'image', 'video', 'audio'],
    modelExamples: [], docUrl: '',
  },
];

export function getServicePreset(id: string): ServicePreset | undefined {
  return SERVICE_PRESETS.find((p) => p.id === id);
}

/** 兼容视图：提供 ModelProvider 形状，不带内置模型。 */
export const BUILT_IN_PROVIDERS: ModelProvider[] = PROTOCOLS.map((p) => ({
  id: p.id,
  name: p.name,
  types: p.types,
  baseUrl: '',
  authHeader: p.authHint,
  models: [],
}));

/** 本地模型后端只在开发模式可用，地址由前端代理配置决定 */
export const LOCAL_BACKENDS = [
  { id: 'ollama', name: 'Ollama', proxyUrl: '/local-api/ollama', apiPath: '/api/tags', type: 'text' as const },
  { id: 'lm-studio', name: 'LM Studio', proxyUrl: '/local-api/lm-studio', apiPath: '/v1/models', type: 'text' as const },
  { id: 'mlx', name: 'MLX', proxyUrl: '/local-api/mlx', apiPath: '/v1/models', type: 'text' as const },
  { id: 'mflux', name: 'mflux', proxyUrl: '/api/mflux', apiPath: '/status', type: 'image' as const },
];
