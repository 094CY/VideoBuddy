import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAssetStore } from '@/stores/asset-store';
import { useModelStore } from '@/stores/model-store';
import { useSkillStore } from '@/stores/skill-store';
import { useTemplateStore } from '@/stores/template-store';
import { launchTemplate } from '@/lib/template-launch';
import { persistUploadedFile } from '@/lib/asset-upload';
import { detectAllLocalBackends } from '@/lib/local-models';
import { useT } from '@/lib/i18n';
import {
  Zap,
  PenTool,
  ArrowUp,
  Film,
  Sparkles,
  Image,
  MessageSquare,
  Paperclip,
  X,
  FileText,
  Music,
  Bot,
  Type,
  ChevronDown,
  Check,
  Settings2,
  Star,
  Layers,
  Mic,
  MessageSquareText,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ModelType } from '@/types';

type TaskMode = 'agent' | 'canvas';

// ─── 任务类型定义 ───
type OutputType = 'video' | 'image' | 'text' | 'audio';

const OUTPUT_TYPES: { type: OutputType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'video',  label: '视频',  icon: <Film className="w-3 h-3" />,         desc: '生成完整视频，包含画面、音频、字幕' },
  { type: 'image',  label: '图片',  icon: <Image className="w-3 h-3" />,         desc: '生成一张或多张图片素材' },
  { type: 'text',   label: '文案',  icon: <Type className="w-3 h-3" />,          desc: '生成文章、脚本、文案、营销内容' },
  { type: 'audio',  label: '音频',  icon: <Music className="w-3 h-3" />,         desc: '生成配音，或输出配乐 / 音效文字方案' },
];

const SUGGESTIONS: Record<OutputType, { icon: React.ReactNode; label: string; prompt: string }[]> = {
  video: [
    { icon: <Film className="w-3 h-3" />,        label: '品牌宣传视频',    prompt: '制作一个60秒的品牌宣传视频，展示产品核心优势' },
    { icon: <Sparkles className="w-3 h-3" />,    label: '产品展示短片',    prompt: '为产品制作30秒展示短片，突出卖点，适合社交媒体投放' },
    { icon: <MessageSquare className="w-3 h-3" />, label: '社交媒体内容',  prompt: '生成适配抖音/小红书多平台的短视频脚本和封面图' },
  ],
  image: [
    { icon: <Image className="w-3 h-3" />,       label: '批量产品素材',    prompt: '批量生成一组风格统一的产品素材图，参考风格：' },
    { icon: <Sparkles className="w-3 h-3" />,    label: '品牌海报',        prompt: '生成一张品牌宣传海报，风格简洁现代，突出产品' },
    { icon: <Film className="w-3 h-3" />,        label: '分镜故事板',      prompt: '为视频脚本生成9张分镜图，风格统一' },
  ],
  text: [
    { icon: <Type className="w-3 h-3" />,        label: '短视频脚本',      prompt: '写一个1分钟的产品短视频脚本，包含开场、卖点、结尾CTA' },
    { icon: <MessageSquare className="w-3 h-3" />, label: '小红书文案',    prompt: '写5条小红书爆款文案，产品：' },
    { icon: <Sparkles className="w-3 h-3" />,    label: '广告创意文案',    prompt: '为品牌写3个广告创意方向，各含标题+正文+CTA' },
  ],
  audio: [
    { icon: <Music className="w-3 h-3" />,       label: '广告配音',        prompt: '为30秒广告片生成专业配音，语气活泼亲切' },
    { icon: <Sparkles className="w-3 h-3" />,    label: '配乐方案',        prompt: '为一段企业宣传片设计配乐方案：曲风、乐器、节奏与情绪变化' },
    { icon: <Film className="w-3 h-3" />,        label: '视频旁白',        prompt: '为产品介绍视频生成标准普通话旁白配音' },
  ],
};

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  textContent?: string;
  persistent?: boolean;
}

// ─── 按输出类型对应的模型类别 ───
const OUTPUT_TO_MODEL_TYPE: Record<OutputType, string> = {
  video: 'video',
  image: 'image',
  text: 'text',
  audio: 'audio',
};

// ─── 模型快速选择下拉 ───
function ModelQuickSelector({
  outputType,
  selectedModelId,
  onSelect,
}: {
  outputType: OutputType;
  selectedModelId: string | null;
  onSelect: (modelId: string, providerId: string, modelName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { apiKeys, localModelsCache, defaultModels, customModels } = useModelStore();

  // 点外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 获取当前类型的可用模型列表
  const modelType = OUTPUT_TO_MODEL_TYPE[outputType];
  const LOCAL_BACKEND_IDS = ['ollama', 'lm-studio', 'mlx', 'mflux'];

  // 判断模型是否为非 LLM 类型（embedding / reranker / 工具模型）
  const isNonLLMModel = (name: string): boolean => {
    const lower = name.toLowerCase();
    return /\b(embed|embedding|bge|e5-|gte-|nomic-embed|snowflake-arctic-embed)\b/.test(lower)
      || /\b(rerank|reranker|jina-reranker|bge-reranker)\b/.test(lower)
      || /\b(markitdown|whisper|clip)\b/.test(lower);
  };

  // 本地在线模型（按后端分组）
  const localModels: { id: string; name: string; provider: string; providerName: string; isLocal: boolean; isAvailable: boolean }[] = [];
  for (const entry of localModelsCache) {
    if (entry.type !== modelType) continue;
    if (Date.now() - entry.lastChecked > 5 * 60 * 1000) continue;
    for (const modelName of entry.models) {
      // 文本模型选择器中过滤掉 embedding/reranker
      if (modelType === 'text' && isNonLLMModel(modelName)) continue;
      localModels.push({
        id: `${entry.backendId}:${modelName}`,
        name: modelName,
        provider: entry.backendId,
        providerName: entry.backendId === 'ollama' ? 'Ollama' : entry.backendId === 'lm-studio' ? 'LM Studio' : entry.backendId === 'mlx' ? 'MLX' : 'mflux',
        isLocal: true,
        isAvailable: true,
      });
    }
  }

  // 只列出用户自己配置的模型，平台不预置任何模型
  const cloudModels: typeof localModels = [];
  for (const model of customModels) {
    if (model.type !== modelType) continue;
    const service = apiKeys.find((k) => k.id === model.serviceId);
    cloudModels.push({
      id: model.id,
      name: model.name,
      provider: model.protocolId,
      providerName: model.serviceName,
      isLocal: false,
      isAvailable: Boolean(service?.apiKeyEncrypted && service?.baseUrl),
    });
  }

  // 排序：本地在线 → 有 Key 的云端 → 无 Key 的云端
  const models = [...localModels, ...cloudModels.filter(m => m.isAvailable), ...cloudModels.filter(m => !m.isAvailable)];

  // 当前选中模型 or 默认模型
  const currentDefault = defaultModels[modelType as ModelType];
  const isLocalDefault = currentDefault && LOCAL_BACKEND_IDS.includes(currentDefault.provider);
  const currentModel = models.find(m => m.id === selectedModelId)
    ?? (isLocalDefault ? models.find(m => m.provider === currentDefault!.provider && m.name === currentDefault!.model) : null)
    ?? models.find(m => m.id === currentDefault?.model)
    ?? models[0];

  // 指示当前是否可用
  const currentAvailable = currentModel?.isAvailable ?? false;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all ${
          currentAvailable
            ? 'hover:bg-accent text-muted-foreground hover:text-foreground'
            : 'hover:bg-accent text-muted-foreground'
        }`}
      >
        {currentModel?.isLocal ? (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
        ) : (
          <Settings2 className="w-3 h-3" />
        )}
        <span className="text-[11px] max-w-[120px] truncate">{currentModel?.name ?? '选择模型'}</span>
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 z-50 w-[260px] rounded-xl border-0 bg-popover shadow-lg overflow-hidden py-1">
          <div className="px-3 py-1.5 border-b border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {outputType === 'video' ? '视频' : outputType === 'image' ? '图片' : outputType === 'text' ? '文本' : '音频'}模型
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {/* 本地在线模型 — 按后端分组 */}
            {localModels.length > 0 && (() => {
              const groups = localModels.reduce((acc, m) => {
                (acc[m.providerName] ??= []).push(m);
                return acc;
              }, {} as Record<string, typeof localModels>);
              return Object.entries(groups).map(([providerName, models]) => (
                <div key={providerName}>
                  <div className="px-3 pt-2 pb-1">
                    <p className="text-[11px] font-medium text-green-500 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {providerName}
                    </p>
                  </div>
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { onSelect(m.id, m.provider, m.name); setOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition"
                    >
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-[12px] font-medium text-muted-foreground truncate">{m.name}</p>
                        <p className="text-[10px] text-green-500">免费离线</p>
                      </div>
                      {(selectedModelId === m.id || (!selectedModelId && currentModel?.id === m.id)) && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              ));
            })()}

            {/* 云端模型 */}
            {localModels.length > 0 && (
              <div className="px-3 pt-1 pb-1">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">云端模型</p>
              </div>
            )}
            {cloudModels.map(m => (
              <button
                key={m.id}
                onClick={() => { onSelect(m.id, m.provider, m.name); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition"
              >
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-[12px] font-medium truncate ${m.isAvailable ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{m.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {m.providerName}
                    {m.isAvailable && <span className="text-green-500">· 已填写</span>}
                    {!m.isAvailable && <span className="text-muted-foreground">· 未配置 Key</span>}
                  </p>
                </div>
                {(selectedModelId === m.id || (!selectedModelId && currentModel?.id === m.id)) && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 技能图标映射 */
const SKILL_ICON_MAP: Record<string, React.ReactNode> = {
  Film: <Film className="w-3.5 h-3.5 text-white" />,
  Layers: <Layers className="w-3.5 h-3.5 text-white" />,
  Zap: <Zap className="w-3.5 h-3.5 text-white" />,
  Star: <Star className="w-3.5 h-3.5 text-white" />,
  Type: <Type className="w-3.5 h-3.5 text-white" />,
  MessageSquareText: <MessageSquareText className="w-3.5 h-3.5 text-white" />,
  Mic: <Mic className="w-3.5 h-3.5 text-white" />,
  Sparkles: <Sparkles className="w-3.5 h-3.5 text-white" />,
};

/** 技能选择下拉 */
function SkillQuickSelector({ activeSkillId, onSelect }: {
  activeSkillId: string | null;
  onSelect: (skillId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { getEnabledSkills, getSkillById } = useSkillStore();
  const enabledSkills = getEnabledSkills();
  const activeSkill = activeSkillId ? getSkillById(activeSkillId) : null;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (enabledSkills.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${
        activeSkill
          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400'
          : 'text-muted-foreground'
      }`}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="选择技能"
          className="flex items-center gap-1.5 text-inherit hover:opacity-80 transition-opacity"
        >
          <Sparkles className="w-3 h-3" />
          {activeSkill ? activeSkill.name : 'Skills'}
        </button>
        {activeSkill && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="清除技能"
            className="text-inherit hover:opacity-70"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[220px] bg-card border-0 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI 技能</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition"
            >
              <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center">
                <Settings2 className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="text-[12px] text-muted-foreground">不使用技能</span>
              {!activeSkillId && <Check className="w-3 h-3 text-green-400 ml-auto" />}
            </button>
            {enabledSkills.map(skill => (
              <button
                key={skill.id}
                onClick={() => { onSelect(skill.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition"
              >
                <div className={`w-5 h-5 rounded-md ${skill.iconBg} flex items-center justify-center`}>
                  <div className="scale-[0.65]">{SKILL_ICON_MAP[skill.iconName] || <Zap className="w-3.5 h-3.5 text-white" />}</div>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-medium text-muted-foreground truncate">{skill.name}</p>
                </div>
                {activeSkillId === skill.id && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 共用输入框组件 */
function InputBox({
  taskMode,
  setTaskMode,
  outputType,
  setOutputType,
  inputText,
  setInputText,
  textareaRef,
  handleCreate,
  uploadedFiles,
  onFileUpload,
  onFileRemove,
  selectedModelId,
  onModelSelect,
  activeSkillId,
  onSkillSelect,
}: {
  taskMode: TaskMode;
  setTaskMode: (m: TaskMode) => void;
  outputType: OutputType;
  setOutputType: (t: OutputType) => void;
  inputText: string;
  setInputText: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleCreate: () => void;
  uploadedFiles: UploadedFile[];
  onFileUpload: (files: FileList) => void;
  onFileRemove: (id: string) => void;
  selectedModelId: string | null;
  onModelSelect: (modelId: string, providerId: string, modelName: string) => void;
  activeSkillId: string | null;
  onSkillSelect: (skillId: string | null) => void;
}) {
  const tr = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full">
      {/* 模式切换：输入卡正上方居中的连体胶囊 */}
      <div className="flex justify-center mb-7">
        <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1">
          {([
            ['agent', <Bot key="mode-agent" className="w-4 h-4" />, 'Agent模式'],
            ['canvas', <PenTool key="mode-canvas" className="w-4 h-4" />, '画布模式'],
          ] as const).map(([mode, icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTaskMode(mode)}
              aria-pressed={taskMode === mode}
              className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium transition-colors ${
                taskMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </div>
    <div
      className="rounded-2xl border border-border bg-card shadow-sm"
    >
      {/* 输出类型选择行（仅 agent 模式） */}
      {taskMode === 'agent' && (
        <div className="flex items-center gap-1 px-3 pt-3 pb-0">
          {OUTPUT_TYPES.map(ot => (
            <button
              key={ot.type}
              onClick={() => setOutputType(ot.type)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                outputType === ot.type
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {ot.icon}{ot.label}
            </button>
          ))}
        </div>
      )}

      {/* 上传文件预览条 */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {uploadedFiles.map(f => (
            <div key={f.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-[11px] text-muted-foreground max-w-[160px]">
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{f.name}</span>
              <button onClick={() => onFileRemove(f.id)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 文本输入 */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder={
            taskMode === 'agent'
              ? (activeSkillId ? (useSkillStore.getState().getSkillById(activeSkillId)?.inputPlaceholder ?? '描述你的需求...') : OUTPUT_TYPES.find(o => o.type === outputType)?.desc ?? '描述你想制作的内容...')
              : '输入项目名称或一句话描述（第一行作为项目名）...'
          }
          className="w-full resize-none border-0 bg-transparent shadow-none text-[14px] text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground outline-none leading-relaxed min-h-[80px]"
          rows={3}
        />
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {/* 左：技能 / 模型 / 附加素材，从行首起 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 模型快速选择（仅 agent 模式） */}
          {taskMode === 'agent' && (
            <>
              <SkillQuickSelector activeSkillId={activeSkillId} onSelect={onSkillSelect} />
              <ModelQuickSelector
                outputType={outputType}
                selectedModelId={selectedModelId}
                onSelect={onModelSelect}
              />
            </>
          )}

          {/* 附加参考素材：与发送按钮分开，两种模式都能附加 */}
          <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-accent transition"
              title="附加参考素材（图片 / 音视频 / 文本）" aria-label="附加参考素材"
            >
              <Paperclip className="w-3.5 h-3.5" /> {tr('home.attach')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.txt,.md,.docx,.srt,.csv,.json"
              className="hidden"
              onChange={e => e.target.files && onFileUpload(e.target.files)}
            />
        </div>

        {/* 右：仅保留发送 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={!inputText.trim()}
            aria-label="创建项目"
            className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
              inputText.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const tr = useT();
  const { projects, createProject, updateProject } = useProjectStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  // 每个账号只看自己的项目；历史无归属的数据已在 DataOwnershipGuard 中迁移
  const visibleProjects = projects.filter((p) => !p.ownerId || p.ownerId === currentUserId);
  const { defaultModels, apiKeys, localModelsCache, updateLocalModelsCache } = useModelStore();
  const { activeSkillId, setActiveSkill, getSkillById } = useSkillStore();
  const templates = useTemplateStore((state) => state.templates);
  const quickTemplates = templates.filter((t) => t.isPublic).slice(0, 3);

  const [taskMode, setTaskMode] = useState<TaskMode>('agent');
  const [outputType, setOutputType] = useState<OutputType>('video');
  const [inputText, setInputText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedModelProvider, setSelectedModelProvider] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动探测本地模型服务，与「设置 → 模型 & Key」共用同一份探测逻辑
  useEffect(() => {
    void detectAllLocalBackends().then((results) => {
      for (const r of results) {
        updateLocalModelsCache(r.id, r.status === 'online' ? r.models : [], r.type);
      }
    });
  }, [updateLocalModelsCache]);

  // 技能预选：activeSkillId 变化时自动切换到 Agent 模式和对应输出类型
  useEffect(() => {
    if (activeSkillId) {
      const skill = getSkillById(activeSkillId);
      if (skill) {
        setTaskMode('agent');
        setOutputType(skill.outputType);
        textareaRef.current?.focus();
      }
    }
  }, [activeSkillId, getSkillById]);

  const handleSkillSelect = useCallback((skillId: string | null) => {
    setActiveSkill(skillId);
    if (skillId) {
      const skill = getSkillById(skillId);
      if (skill) {
        setTaskMode('agent');
        setOutputType(skill.outputType);
      }
    }
  }, [setActiveSkill, getSkillById]);

  // 自动高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [inputText]);

  // 切换输出类型时重置模型选择
  useEffect(() => {
    setSelectedModelId(null);
    setSelectedModelProvider(null);
  }, [outputType]);

  const handleModelSelect = useCallback((modelId: string, providerId: string) => {
    setSelectedModelId(modelId);
    setSelectedModelProvider(providerId);
  }, []);

  const handleFileUpload = useCallback(async (files: FileList) => {
    // 文本类素材读取内容，作为上下文真正注入后续 AI 调用；
    // 图片/音视频保留 URL 供资产库预览与下载。
    const newFiles = await Promise.all(Array.from(files).map(async (f) => {
      let textContent: string | undefined;
      if (/\.(txt|md|csv|json|srt)$/i.test(f.name) || f.type.startsWith('text/')) {
        try { textContent = (await f.text()).slice(0, 12000); }
        catch { toast.error(`无法读取 ${f.name} 的文本内容`); }
      }
      const stored = await persistUploadedFile(f);
      return {
        id: Math.random().toString(36).slice(2),
        name: f.name,
        type: f.type,
        url: stored.url,
        size: f.size,
        textContent,
        persistent: stored.persistent,
      };
    }));
    // 上传的参考文件必须落库，否则跳转后即丢失、资产库也看不到。
    // blob URL 刷新后失效，因此只作为本次会话的参考素材。
    const addAsset = useAssetStore.getState().addAsset;
    const userId = useAuthStore.getState().user?.id || 'anonymous';
    for (const f of newFiles) {
      const kind = f.type.startsWith('image/') ? 'image'
        : f.type.startsWith('video/') ? 'video'
        : f.type.startsWith('audio/') ? 'audio' : 'text';
      addAsset({
        userId, type: kind, name: f.name, fileUrl: f.url,
        fileSize: f.size, mimeType: f.type,
      });
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
    const transient = newFiles.filter((f) => !f.persistent).length;
    if (transient > 0) {
      toast.warning(`${transient} 个素材仅本次会话可用，刷新后可能丢失`);
    } else {
      toast.success(`已附加 ${newFiles.length} 个参考素材，文本类会作为 AI 输入`);
    }
  }, []);

  const handleFileRemove = useCallback((id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleCreate = () => {
    const text = inputText.trim();
    if (!text) { textareaRef.current?.focus(); return; }

    // 检查是否有可用模型（agent 模式才检查）
    if (taskMode === 'agent') {
      const checkProvider = selectedModelProvider ?? defaultModels[outputType]?.provider;
      const isLocal = checkProvider && ['ollama', 'lm-studio', 'mlx', 'mflux'].includes(checkProvider);
      // 如果选中了本地模型，或者当前没有选中 provider 但有可用的本地模型 → 跳过 Key 检查
      const hasLocalModels = localModelsCache.some(c => c.type === outputType && c.models.length > 0 && (Date.now() - c.lastChecked < 5 * 60 * 1000));
      if (checkProvider && !isLocal && !hasLocalModels) {
        const hasKey = apiKeys.some(k => k.protocol === checkProvider && k.apiKeyEncrypted && k.baseUrl);
        if (!hasKey) {
          toast.warning('所选服务尚未配置完整，请先在「设置 → 模型 & Key」填写服务地址与 API Key');
        }
      }
    }

    const name = text.split('\n')[0].slice(0, 60);
    const proj = createProject(name, text);
    // 保存 taskMode 和 outputType 到 project
    const chosenProvider = selectedModelProvider ?? defaultModels[outputType]?.provider;
    const chosenModel = selectedModelId ?? defaultModels[outputType]?.model;
    updateProject(proj.id, {
      taskMode, outputType,
      modelRef: chosenProvider && chosenModel
        ? { provider: chosenProvider, model: chosenModel, serviceId: defaultModels[outputType]?.serviceId }
        : undefined,
      // 技能与参考素材都跟随项目持久化，刷新、重新进入后仍能读到
      skillId: activeSkillId || undefined,
      attachments: uploadedFiles.map((f) => ({
        id: f.id, name: f.name, type: f.type, url: f.url,
        textContent: f.textContent,
      })),
    });
    if (activeSkillId) {
      useSkillStore.getState().incrementUses(activeSkillId);
      // 技能固化到项目后清空首页预选
      setActiveSkill(null);
    }
    setInputText('');
    setUploadedFiles([]);

    const modelParam = selectedModelId ? `&modelId=${selectedModelId}` : '';
    if (taskMode === 'agent') {
      toast.success('Agent 任务已创建，正在启动...');
      navigate(`/task/${proj.id}?outputType=${outputType}${modelParam}`);
    } else {
      toast.success('画布工作区已创建');
      navigate(`/canvas/${proj.id}`);
    }
  };

  const suggestions = taskMode === 'agent' ? SUGGESTIONS[outputType] : SUGGESTIONS.video;

  const inputBoxProps = {
    taskMode, setTaskMode,
    outputType, setOutputType,
    inputText, setInputText,
    textareaRef, handleCreate,
    uploadedFiles, onFileUpload: handleFileUpload, onFileRemove: handleFileRemove,
    selectedModelId, onModelSelect: handleModelSelect,
    activeSkillId, onSkillSelect: handleSkillSelect,
  };

  return (
    <div className="overflow-y-auto bg-background" style={{ height: 'calc(100vh - 48px)' }}>
      <div className="flex flex-col items-center px-8" style={{ paddingTop: '32vh', paddingBottom: '48px' }}>
        <div className="w-full max-w-[900px]">

          {/* 标题：仅空态显示 */}
          {visibleProjects.length === 0 && (
            <div className="text-center mb-8">
              <h1 className="text-[28px] font-semibold text-muted-foreground mb-2 leading-tight tracking-tight">
                {tr('home.title')}
              </h1>
            </div>
          )}

          <InputBox {...inputBoxProps} />

          {/* 快速提示词 */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => { setInputText(s.prompt); textareaRef.current?.focus(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-0 bg-card hover:bg-accent text-[12px] text-muted-foreground transition-all hover:text-foreground"
              >
                {s.icon}{s.label}
              </button>
            ))}
          </div>

          {/* 从模板开始：首页直接引用模板库，点击即创建项目并进入画布 */}
          {quickTemplates.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <span className="text-[12px] text-muted-foreground mr-1">{tr('home.fromTemplate')}</span>
              {quickTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    const result = launchTemplate(t.id);
                    if (!result) { toast.error('模板不存在或已被删除'); return; }
                    if (result.missingModels) {
                      toast.warning('项目已创建，请先在「设置 → 模型 & Key」配置默认模型，否则节点无法执行');
                    }
                    navigate(`/canvas/${result.projectId}`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-0 bg-card hover:bg-accent text-[12px] text-muted-foreground transition-all hover:text-foreground"
                >
                  {t.name}
                  <span className="text-[11px] text-muted-foreground">
                    {t.workflowData.nodes.length} 节点
                  </span>
                </button>
              ))}
              <button
                onClick={() => navigate('/templates')}
                className="px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition"
              >
                {tr('home.allTemplates')} →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
