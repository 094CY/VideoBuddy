// ==================== User & Auth ====================
export interface User {
  id: string;
  /** 通用登录标识：邮箱 / 手机号 / 用户名 / 姓名均可 */
  account: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ==================== Project ====================
export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'completed' | 'archived';

export interface ProjectAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  /** 文本类素材读取后的内容，会作为上下文注入 AI 调用 */
  textContent?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  teamId?: string;
  status: ProjectStatus;
  thumbnailUrl?: string;
  tags: string[];
  workflowData?: WorkflowData;
  taskMode?: 'agent' | 'canvas';
  outputType?: 'video' | 'image' | 'text' | 'audio';
  /** 创建任务时附加的参考素材 */
  attachments?: ProjectAttachment[];
  /** 创建时选中的技能；Agent 会把该技能的方法论注入提示词 */
  skillId?: string;
  /** 创建任务时选定的模型，重新打开任务时沿用 */
  modelRef?: { provider: string; model: string; serviceId?: string };
  /** Agent 任务执行记录；有记录时进入任务不再自动重跑 */
  agentRun?: { status: 'completed' | 'failed' | 'cancelled'; finishedAt: string };

  createdAt: string;
  updatedAt: string;
}

// ==================== Workflow ====================
export type NodeType = 'text' | 'image' | 'video' | 'audio' | 'script' | 'ai-process';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

// ==================== Node Data ====================
export interface BaseNodeData {
  label: string;
  description?: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
  errorMessage?: string;
}

export interface TextNodeData extends BaseNodeData {
  content: string;
  format?: 'plain' | 'markdown' | 'richtext';
}

export interface ImageNodeData extends BaseNodeData {
  imageUrl?: string;
  prompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  model?: string;
  provider?: string;
}

export interface VideoNodeData extends BaseNodeData {
  videoUrl?: string;
  prompt?: string;
  sourceImageUrl?: string;
  duration?: number;
  fps?: number;
  model?: string;
  provider?: string;
}

export interface AudioNodeData extends BaseNodeData {
  audioUrl?: string;
  prompt?: string;
  text?: string;
  voice?: string;
  model?: string;
  provider?: string;
}

export interface ScriptScene {
  id: string;
  sceneNumber: number;
  durationSeconds: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  sceneDescription: string;
  dialogue?: string;
  voiceover?: string;
  mood?: string;
  lighting?: string;
  musicNote?: string;
  referenceImageUrl?: string;
  generatedImageUrl?: string;
  generatedVideoUrl?: string;
}

export interface ScriptNodeData extends BaseNodeData {
  title?: string;
  scenes: ScriptScene[];
  sourceText?: string;
}

export type AIProcessType =
  | 'text-expand'
  | 'script-generate'
  | 'style-transfer'
  | 'storyboard-grid-9'
  | 'storyboard-grid-25'
  | 'story-extrapolate'
  | 'custom-prompt';

export interface AIProcessNodeData extends BaseNodeData {
  processType: AIProcessType;
  prompt?: string;
  inputText?: string;
  inputImageUrl?: string;
  outputText?: string;
  outputImageUrls?: string[];
  model?: string;
  provider?: string;
  parameters?: Record<string, unknown>;
}

export type NodeData =
  | TextNodeData
  | ImageNodeData
  | VideoNodeData
  | AudioNodeData
  | ScriptNodeData
  | AIProcessNodeData;

// ==================== Model Provider ====================
export type ModelType = 'text' | 'image' | 'video' | 'audio';

export interface ModelProvider {
  id: string;
  name: string;
  types: ModelType[];
  baseUrl: string;
  models: ModelInfo[];
  authHeader: string;
  iconUrl?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  type: ModelType;
  providerId: string;
  description?: string;
  maxTokens?: number;
  pricing?: string;
  /** 最多 3 个标签，格式：[质量/速度, 成本, 场景] */
  tags?: [string, string, string];
}

export interface ApiKeyConfig {
  id: string;
  userId: string;
  provider: string;
  apiKeyMasked: string;
  apiKeyEncrypted: string; // 存储原始 key（base64 编码）
  baseUrl?: string;
  isValid: boolean;
  lastValidatedAt?: string;
  createdAt: string;
}

export interface UserModelConfig {
  id: string;
  userId: string;
  modelType: ModelType;
  defaultProvider?: string;
  defaultModel?: string;
  parameters?: Record<string, unknown>;
}

// ==================== Team ====================
export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  user: User;
  role: TeamRole;
  joinedAt: string;
}

// ==================== Template ====================
export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  thumbnailUrl?: string;
  workflowData: WorkflowData;
  creatorId?: string;
  isPublic: boolean;
  useCount: number;
  createdAt: string;
}

// ==================== Generation Task ====================
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface GenerationTask {
  id: string;
  projectId: string;
  nodeId: string;
  provider: string;
  model: string;
  status: TaskStatus;
  progress?: number;
  result?: unknown;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

// ==================== Asset / File ====================
export interface Asset {
  id: string;
  projectId?: string;
  userId: string;
  type: 'image' | 'video' | 'audio' | 'text';
  name: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  textContent?: string; // 文本文件的内容（直接存储以便预览）
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ==================== Comment ====================
export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  content: string;
  positionX?: number;
  positionY?: number;
  nodeId?: string;
  isResolved: boolean;
  createdAt: string;
}
