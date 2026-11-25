/**
 * AgentRunner — 对话式 Agent 执行面板
 * 用户消息 + AI 回复（含多步骤工具调用）以对话流展示
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useModelStore } from '@/stores/model-store';
import { useArtifactStore } from '@/stores/artifact-store';
import { useSkillStore, buildSkillDirective } from '@/stores/skill-store';
import {
  callAIChat,
  callImageGeneration,
  callVideoGeneration,
  callTTS,
  type ChatMessage,
} from '@/services/ai-service';
import { toast } from 'sonner';
import {
  Loader2, Copy, Download, Square,
  ArrowUp, RotateCcw, Sparkles,
  Image as ImageIcon, Video, Music, FileText,
} from 'lucide-react';

type OutputType = 'video' | 'image' | 'text' | 'audio';

// 对话消息类型
interface ChatBubble {
  id: string;
  role: 'user' | 'assistant';
  content?: string;         // 文本内容（Markdown）
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  error?: string;
  thinking?: string;        // 思考过程 / 工具调用标签
  isStreaming?: boolean;
}

interface AgentRunnerProps {
  outputType: OutputType;
  prompt: string;
  projectName: string;
  projectId?: string;
  hasPriorRun?: boolean;
  modelRef?: { provider: string; model: string; serviceId?: string };
  onRunStateChange?: (status: 'completed' | 'failed' | 'cancelled') => void;
  onModelChange?: (ref: { provider: string; model: string; serviceId?: string }) => void;
  /** 创建任务时选中的技能；其方法论会注入每一次 AI 调用 */
  skillId?: string;
  /** 创建任务时附加的参考素材数量 */
  attachmentCount?: number;
}

const LOCAL_PROVIDERS = ['ollama', 'lm-studio', 'mlx', 'mflux'];
const activeRuns = new Set<string>();

function useModelKey(type: 'text' | 'image' | 'video' | 'audio') {
  const { defaultModels, getPlainApiKey, getApiKeyForProvider, localModelsCache } = useModelStore();
  const dm = defaultModels[type];

  if (dm) {
    const isLocal = LOCAL_PROVIDERS.includes(dm.provider);
    if (isLocal) {
      return { provider: dm.provider, model: dm.model, apiKey: 'local', baseUrl: getLocalBaseUrl(dm.provider), isLocal: true };
    }
    // 服务地址与密钥来自已登记的模型服务
    const lookup = dm.serviceId || dm.provider;
    const service = getApiKeyForProvider(lookup);
    return {
      provider: dm.provider,
      model: dm.model,
      apiKey: getPlainApiKey(lookup) ?? '',
      baseUrl: service?.baseUrl,
      isLocal: false,
    };
  }

  const modelType = type === 'text' ? 'text' : type === 'image' ? 'image' : type;
  for (const entry of localModelsCache) {
    if (entry.type !== modelType) continue;
    if (Date.now() - entry.lastChecked > 5 * 60 * 1000) continue;
    if (entry.models.length > 0) {
      return { provider: entry.backendId, model: entry.models[0], apiKey: 'local', baseUrl: getLocalBaseUrl(entry.backendId), isLocal: true };
    }
  }

  return null;
}

function getLocalBaseUrl(provider: string): string {
  switch (provider) {
    case 'ollama': return '/local-api/ollama';
    case 'lm-studio': return '/local-api/lm-studio';
    case 'mlx': return '/local-api/mlx';
    case 'mflux': return '/api/mflux';
    default: return '';
  }
}

let msgCounter = 0;
const mkId = () => `msg-${++msgCounter}-${Date.now()}`;

export function AgentRunner({ outputType, prompt, skillId, attachmentCount = 0, projectName,
  projectId, hasPriorRun = false, modelRef, onRunStateChange, onModelChange }: AgentRunnerProps) {
  const skillDirective = buildSkillDirective(skillId);
  const skills = useSkillStore((state) => state.skills);
  const activeSkill = skillId ? skills.find((item) => item.id === skillId) : null;
  const textConf  = useModelKey('text');
  const imageConf = useModelKey('image');
  const videoConf = useModelKey('video');
  const audioConf = useModelKey('audio');

  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [running, setRunning] = useState(false);
  const [taskType, setTaskType] = useState<OutputType>(outputType);
  const [followUp, setFollowUp] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const addMsg = useCallback((msg: ChatBubble) => {
    setMessages(prev => [...prev, msg]);
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom]);

  // Agent 生成的成果必须落库，否则刷新/返回后全部消失，资产库和导出都收不到
  const savedArtifacts = useRef(new Set<string>());
  const persistArtifact = useCallback((url: string, type: 'image' | 'video' | 'audio', name: string) => {
    if (!url || savedArtifacts.current.has(url)) return;
    savedArtifacts.current.add(url);
    if (url.startsWith('data:')) {
      toast.warning('产物未能保存到服务端，仅本次会话可见，刷新后可能丢失');
    }
    useArtifactStore.getState().add({ type, name, fileUrl: url, sourceProject: projectName });
  }, [projectName]);

  const updateLastAssistant = useCallback((patch: Partial<ChatBubble>) => {
    let next: Partial<ChatBubble> = patch;
    if (typeof patch.error === 'string' && /abort/i.test(patch.error)) {
      next = { content: '已暂停生成，可继续对话或重新生成。' };
    }
    const hasPayload = Object.keys(next).some((k) => k !== 'thinking' && k !== 'isStreaming');
    if (hasPayload) next = { ...next, thinking: undefined, isStreaming: false };
    if (next.imageUrl) persistArtifact(next.imageUrl, 'image', 'Agent 生成图片');
    if (next.videoUrl) persistArtifact(next.videoUrl, 'video', 'Agent 生成视频');
    if (next.audioUrl) persistArtifact(next.audioUrl, 'audio', 'Agent 生成音频');
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'assistant');
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      const updated = [...prev];
      updated[realIdx] = { ...updated[realIdx], ...next };
      return updated;
    });
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom, persistArtifact]);

  const checkKey = (conf: ReturnType<typeof useModelKey>): boolean => {
    if (!conf) return false;
    if (conf.isLocal) return true;
    return Boolean(conf.apiKey && conf.baseUrl);
  };

  const withSkill = (system: string) =>
    skillDirective ? `${system}\n\n${skillDirective}` : system;

  const chatMsgs = (system: string, user: string): ChatMessage[] => [
    { role: 'system', content: withSkill(system) },
    { role: 'user', content: user },
  ];

  // 主执行逻辑
  const run = useCallback(async (userPrompt: string, isFollowUp = false, skipUserMsg = false) => {
    const lockKey = projectId || projectName;
    if (activeRuns.has(lockKey)) return;
    activeRuns.add(lockKey);
    let failed = false;
    setRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;

    // 清理上一轮残留的进行中状态，避免多个 spinner 同时存在
    setMessages((prev) => prev.map((m) => m.role === 'assistant' && m.thinking
      ? { ...m, thinking: undefined, isStreaming: false } : m));
    // 添加用户消息气泡（重新生成时复用首条需求）
    if (!skipUserMsg) addMsg({ id: mkId(), role: 'user', content: userPrompt });

    // 添加 AI 思考气泡
    const aiId = mkId();
    addMsg({ id: aiId, role: 'assistant', thinking: '正在分析需求…', isStreaming: true });

    try {
      if (taskType === 'text') {
        if (!checkKey(textConf)) throw new Error('未配置可用的文本模型，请在「设置 → 模型 & Key」中选择模型并完成服务配置。')
        const tc = textConf!;

        if (!isFollowUp) {
          // Step 1: 大纲
          updateLastAssistant({ thinking: '正在生成内容大纲…' });
          const outlineRes = await callAIChat({
            provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
            messages: chatMsgs('你是专业的内容策划，请根据需求生成详细的内容大纲。', `请为以下需求生成内容大纲（3-5个核心段落）：\n${userPrompt}`),
            signal: abort.signal,
          });
          updateLastAssistant({ thinking: '正在撰写完整内容…' });

          // Step 2: 完整内容
          const contentRes = await callAIChat({
            provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
            messages: chatMsgs('你是专业的文案写手，请根据大纲生成完整、高质量的内容。', `根据以下大纲生成完整内容：\n${outlineRes.content}`),
            signal: abort.signal,
          });
          updateLastAssistant({ content: contentRes.content, thinking: undefined, isStreaming: false });
        } else {
          // 追问：直接对话
          const allMsgs: ChatMessage[] = [
            { role: 'system', content: withSkill('你是专业的内容助手，帮助用户完善和修改内容。') },
            ...messages.filter(m => m.content).map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content!,
            })),
            { role: 'user', content: userPrompt },
          ];
          const res = await callAIChat({
            provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
            messages: allMsgs, signal: abort.signal,
          });
          updateLastAssistant({ content: res.content, thinking: undefined, isStreaming: false });
        }
      }

      else if (taskType === 'image') {
        if (!isFollowUp) {
          if (!checkKey(imageConf)) throw new Error('未配置可用的图像模型，请在「设置 → 模型 & Key」中选择模型并完成服务配置。')
          const ic = imageConf!;

          // 有技能时一定走文本模型，方法论通过系统指令进入优化过程；
          // 纯英文且无技能才允许直接生图。
          const isEnglishPrompt = /^[a-zA-Z0-9\s,.\-!?:;()/'"…]+$/.test(userPrompt.trim()) && userPrompt.trim().length > 20;
          const textReady = Boolean(textConf) && (textConf!.isLocal || Boolean(textConf!.apiKey && textConf!.baseUrl));
          const optimize = textReady && (Boolean(skillDirective) || !isEnglishPrompt);
          let finalPrompt = userPrompt;

          if (optimize) {
            const tc = textConf!;
            updateLastAssistant({ thinking: '正在优化图像 Prompt…' });
            let optimized = '';
            try {
              const promptRes = await callAIChat({
                provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
                messages: chatMsgs(
                  '你是专业的 AI 图像 Prompt 工程师，请将用户需求优化为高质量的图像生成 Prompt，英文输出，注重画面细节、光线、风格描述。仅输出 Prompt 文本。',
                  `请将以下需求优化为图像 Prompt：\n${userPrompt}`
              ),
                signal: abort.signal,
              });
              optimized = promptRes.content?.trim() || '';
            } catch {
              // 文本模型不可用时继续用原始需求生图
              optimized = '';
            }
            // 文本模型返回空内容或失败时回退到原始需求与技能要点，不把空 Prompt 交给生图
            finalPrompt = optimized || [userPrompt, skillDirective].filter(Boolean).join('\n\n');
            updateLastAssistant({
              content: `${optimized ? '**优化后的 Prompt：**' : '**Prompt：**'}\n\n${finalPrompt}`,
            });
          } else {
            // 无文本模型时，技能要点随需求一同传给生图模型
            finalPrompt = [userPrompt, skillDirective].filter(Boolean).join('\n\n');
            updateLastAssistant({ content: `**Prompt：**\n\n${finalPrompt}` });
          }

          if (!finalPrompt.trim()) {
            updateLastAssistant({ error: '没有可送入图像模型的内容，请补充需求。', thinking: undefined, isStreaming: false });
            setRunning(false);
            return;
          }

          updateLastAssistant({ thinking: '正在生成图像…' });
          try {
            const imgRes = await callImageGeneration({
              provider: ic.provider, model: ic.model, apiKey: ic.apiKey, baseUrl: ic.baseUrl,
              prompt: finalPrompt, width: ic.isLocal ? 512 : 1024, height: ic.isLocal ? 512 : 1024, signal: abort.signal,
            });
            updateLastAssistant({ imageUrl: imgRes.imageUrl, thinking: undefined, isStreaming: false });
          } catch (imgErr) {
            updateLastAssistant({ error: (imgErr as Error).message, thinking: undefined, isStreaming: false });
          }
        } else {
          // 追问：用新 prompt 重新生成
          if (!checkKey(imageConf)) throw new Error('未配置可用的图像模型，请在「设置 → 模型 & Key」中选择模型并完成服务配置。')
          const ic = imageConf!;
          updateLastAssistant({ thinking: '正在根据修改意见重新生成…' });

          // 先让文本模型优化追问
          if (textConf && checkKey(textConf)) {
            const allMsgs: ChatMessage[] = [
              { role: 'system', content: withSkill('用户之前生成了一张图，现在想修改。请根据对话历史和用户新要求，输出新的英文图像 Prompt。仅输出 Prompt。') },
              ...messages.filter(m => m.content).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content! })),
              { role: 'user', content: userPrompt },
            ];
            const newPrompt = await callAIChat({
              provider: textConf.provider, model: textConf.model, apiKey: textConf.apiKey, baseUrl: textConf.baseUrl,
              messages: allMsgs, signal: abort.signal,
            });
            updateLastAssistant({ content: `**修改后的 Prompt：**\n\n${newPrompt.content}`, thinking: '正在生成图像…' });

            const imgRes = await callImageGeneration({
              provider: ic.provider, model: ic.model, apiKey: ic.apiKey, baseUrl: ic.baseUrl,
              prompt: newPrompt.content, width: ic.isLocal ? 512 : 1024, height: ic.isLocal ? 512 : 1024, signal: abort.signal,
            });
            updateLastAssistant({ imageUrl: imgRes.imageUrl, thinking: undefined, isStreaming: false });
          }
        }
      }

      else if (taskType === 'audio') {
        if (!checkKey(textConf) || !checkKey(audioConf)) throw new Error('未配置可用的文本或音频模型，请在「设置 → 模型 & Key」中选择模型并完成服务配置。')
        const tc = textConf!; const ac = audioConf!;

        updateLastAssistant({ thinking: '正在生成配音文案…' });
        const scriptRes = await callAIChat({
          provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
          messages: chatMsgs('你是专业的配音文案写手，生成简洁口语化的文案，适合 TTS。', `请为以下需求生成配音文案（200字以内）：\n${userPrompt}`),
          signal: abort.signal,
        });
        updateLastAssistant({ content: scriptRes.content, thinking: '正在合成语音…' });

        const audioRes = await callTTS({
          provider: ac.provider, model: ac.model, apiKey: ac.apiKey, baseUrl: ac.baseUrl,
          text: scriptRes.content, signal: abort.signal,
        });
        updateLastAssistant({ audioUrl: audioRes.audioUrl, thinking: undefined, isStreaming: false });
      }

      else if (taskType === 'video') {
        if (!checkKey(textConf)) throw new Error('未配置可用的文本模型，请在「设置 → 模型 & Key」中选择模型并完成服务配置。')
        const tc = textConf!;

        updateLastAssistant({ thinking: '正在生成视频脚本…' });
        const scriptRes = await callAIChat({
          provider: tc.provider, model: tc.model, apiKey: tc.apiKey, baseUrl: tc.baseUrl,
          messages: chatMsgs(
            '你是专业的短视频脚本策划，生成分镜脚本，每个场景包含场景描述（英文）和旁白（中文），用---分隔。',
            `请为以下需求生成视频脚本（3个场景）：\n${userPrompt}`
          ),
          signal: abort.signal,
        });
        updateLastAssistant({ content: scriptRes.content, thinking: undefined, isStreaming: false });

        const scenes = scriptRes.content.split('---').filter(s => s.trim()).slice(0, 3);
        const firstScene = scenes[0] ?? scriptRes.content.slice(0, 200);

        // 分镜图
        if (imageConf && (imageConf.apiKey || imageConf.isLocal)) {
          const imgAiId = mkId();
          addMsg({ id: imgAiId, role: 'assistant', thinking: '正在生成分镜图…', isStreaming: true });
          try {
            const imgRes = await callImageGeneration({
              provider: imageConf.provider, model: imageConf.model,
              apiKey: imageConf.apiKey, baseUrl: imageConf.baseUrl,
              prompt: firstScene.trim(), width: 1280, height: 720, signal: abort.signal,
            });
            updateLastAssistant({ imageUrl: imgRes.imageUrl, thinking: undefined, isStreaming: false });

            // 视频
            if (videoConf && (videoConf.apiKey || videoConf.isLocal)) {
              const vidAiId = mkId();
              addMsg({ id: vidAiId, role: 'assistant', thinking: '正在生成视频…', isStreaming: true });
              try {
                const vidRes = await callVideoGeneration({
                  provider: videoConf.provider, model: videoConf.model,
                  apiKey: videoConf.apiKey, baseUrl: videoConf.baseUrl,
                  prompt: firstScene.trim(), imageUrl: imgRes.imageUrl, duration: 5, signal: abort.signal,
                });
                updateLastAssistant({ videoUrl: vidRes.videoUrl, thinking: undefined, isStreaming: false });
              } catch (e) {
                updateLastAssistant({ error: (e as Error).message, thinking: undefined, isStreaming: false });
              }
            }
          } catch (e) {
            updateLastAssistant({ error: (e as Error).message, thinking: undefined, isStreaming: false });
          }
        }

        // 旁白
        if (audioConf && (audioConf.apiKey || audioConf.isLocal)) {
          const audioAiId = mkId();
          addMsg({ id: audioAiId, role: 'assistant', thinking: '正在合成旁白…', isStreaming: true });
          try {
            const narration = scenes.map(s => {
              const lines = s.split('\n').filter(l => l.trim());
              return lines.find(l => /[\u4e00-\u9fff]/.test(l)) ?? lines[0] ?? '';
            }).join('，');
            const audioRes = await callTTS({
              provider: audioConf.provider, model: audioConf.model,
              apiKey: audioConf.apiKey, baseUrl: audioConf.baseUrl,
              text: narration || scriptRes.content.slice(0, 200), signal: abort.signal,
            });
            updateLastAssistant({ audioUrl: audioRes.audioUrl, thinking: undefined, isStreaming: false });
          } catch (e) {
            updateLastAssistant({ error: (e as Error).message, thinking: undefined, isStreaming: false });
          }
        }
      }

    } catch (e) {
      failed = true;
      if ((e as Error).name === 'AbortError') {
        updateLastAssistant({ content: '已取消生成。' });
      } else {
        updateLastAssistant({ error: (e as Error).message });
      }
    } finally {
      activeRuns.delete(lockKey);
      setRunning(false);
      onRunStateChange?.(failed ? 'failed' : 'completed');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [taskType, textConf, imageConf, videoConf, audioConf, messages, addMsg, updateLastAssistant, scrollToBottom]);

  // 自动启动：StrictMode 双挂载与刷新重入都只执行一次；已执行过的任务不再重跑
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (!prompt || hasPriorRun || taskArtifacts.length > 0 || messages.length > 0) return;
    void run(prompt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleFollowUp = () => {
    const text = followUp.trim();
    if (!text || running) return;
    setFollowUp('');
    run(text, true);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制');
  };

  const allArtifacts = useArtifactStore((st) => st.items);
  const taskArtifacts = useMemo(
    () => allArtifacts.filter((a) => a.sourceProject === projectName),
    [allArtifacts, projectName],
  );
  const latestResult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && (m.imageUrl || m.videoUrl || m.audioUrl || m.error || m.content)) return m;
    }
    return null;
  }, [messages]);
  const isProcessNote = (text?: string) => !text
    || text.startsWith('**优化后的 Prompt：**') || text.startsWith('**Prompt：**');

  // 四类任务结果统一成同一种数据结构，面板按 type 切换展示
  type ResultItem = { id: string; type: OutputType; url?: string; text?: string; name?: string };
  const results = useMemo(() => {
    const items: ResultItem[] = [];
    const seen = new Set<string>();
    const push = (item: ResultItem) => {
      const key = item.url || item.text || '';
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };
    for (const a of taskArtifacts) {
      if (a.type === 'text' && a.content) push({ id: a.id, type: 'text', text: a.content, name: a.name });
      else if (a.fileUrl) push({ id: a.id, type: a.type as OutputType, url: a.fileUrl, name: a.name });
    }
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.imageUrl) push({ id: `${m.id}-i`, type: 'image', url: m.imageUrl });
      if (m.videoUrl) push({ id: `${m.id}-v`, type: 'video', url: m.videoUrl });
      if (m.audioUrl) push({ id: `${m.id}-a`, type: 'audio', url: m.audioUrl });
      if (m.content && !isProcessNote(m.content)) push({ id: `${m.id}-t`, type: 'text', text: m.content });
    }
    return items;
  }, [taskArtifacts, messages]);

  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    const last = results.at(-1);
    if (last && (!selectedId || !results.some((r) => r.id === selectedId))) setSelectedId(last.id);
  }, [results, selectedId]);
  const selected = results.find((r) => r.id === selectedId) || results.at(-1);

  type RunStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';
  const runStatus: RunStatus = running ? 'running'
    : latestResult?.error ? 'failed'
      : /已暂停|已取消/.test(latestResult?.content || '') ? 'cancelled'
        : results.length > 0 ? 'success' : 'idle';
  const statusText = {
    idle: '等待执行', running: '正在生成…', success: '已完成',
    failed: '执行失败', cancelled: '已暂停',
  }[runStatus];
  const statusTone = {
    idle: 'bg-muted-foreground', running: 'bg-amber-500 animate-pulse',
    success: 'bg-emerald-500', failed: 'bg-destructive', cancelled: 'bg-muted-foreground',
  }[runStatus];
  const typeLabel = { video: '视频', image: '图片', text: '文案', audio: '音频' }[taskType];
  const RESULT_ICON = { video: Video, image: ImageIcon, text: FileText, audio: Music };
  const RESULT_LABEL = { video: '视频', image: '图片', text: '文案', audio: '音频' };

  const [leftPercent, setLeftPercent] = useState(() => {
    const saved = Number(localStorage.getItem('videobuddy-agent-split'));
    return saved >= 28 && saved <= 65 ? saved : 42;
  });
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; percent: number } | null>(null);
  useEffect(() => {
    localStorage.setItem('videobuddy-agent-split', String(leftPercent));
  }, [leftPercent]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const width = shellRef.current?.clientWidth ?? 1000;
      const delta = ((e.clientX - dragRef.current.x) / width) * 100;
      setLeftPercent(Math.min(Math.max(dragRef.current.percent + delta, 28), 65));
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);
  const stages = [
    { label: '提交需求', done: Boolean(prompt) },
    { label: '优化提示词', done: results.length > 0 || messages.some((m) => isProcessNote(m.content)) },
    { label: '生成结果', done: results.length > 0 },
    { label: '完成', done: runStatus === 'success' || runStatus === 'cancelled' },
  ];
  const fullPrompt = skillDirective ? `${skillDirective}

---

${prompt}` : prompt;


  const { customModels, localModelsCache, defaultModels, setDefaultModel } = useModelStore();
  const modelOptions = useMemo(() => {
    const list: { key: string; label: string; provider: string; model: string; serviceId?: string }[] = [];
    for (const m of customModels) {
      if (m.type !== taskType) continue;
      list.push({
        key: `c:${m.serviceId}:${m.id}`,
        label: m.name || m.id,
        provider: m.protocolId || m.providerId,
        model: m.id,
        serviceId: m.serviceId,
      });
    }
    for (const entry of localModelsCache) {
      if (entry.type !== taskType) continue;
      for (const name of entry.models) {
        list.push({ key: `l:${entry.backendId}:${name}`, label: `${name} · ${entry.backendId}`, provider: entry.backendId, model: name });
      }
    }
    return list;
  }, [customModels, localModelsCache, taskType]);
  const activeDefault = defaultModels[taskType];
  const activeModelKey = activeDefault ? `${activeDefault.provider}:${activeDefault.model}` : '';
  const pickModel = (key: string) => {
    const opt = modelOptions.find((o) => o.key === key);
    if (!opt) return;
    setDefaultModel(taskType, opt.provider, opt.model, opt.serviceId);
    onModelChange?.({ provider: opt.provider, model: opt.model, serviceId: opt.serviceId });
  };
  const modelRestored = useRef(false);
  useEffect(() => {
    if (modelRestored.current || !modelRef) return;
    modelRestored.current = true;
    const current = useModelStore.getState().defaultModels[outputType];
    if (!current || current.provider !== modelRef.provider || current.model !== modelRef.model) {
      setDefaultModel(outputType, modelRef.provider, modelRef.model, modelRef.serviceId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={shellRef} className="flex h-full bg-background">
      {/* 左：任务需求、进度与继续对话 */}
      <div className="flex flex-col bg-background flex-shrink-0 min-w-[320px]" style={{ width: `${leftPercent}%` }}>
        <div className="h-10 flex items-center gap-2 px-4 text-[11px] text-muted-foreground flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusTone}`} />
          <span className="text-foreground">{statusText}</span>
          <span>· {activeSkill?.name || '未选择技能'}</span>
          {attachmentCount > 0 && <span>· 素材 {attachmentCount} 个</span>}
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 静态档案：任务需求与执行过程合在一张概览卡 */}
          <section data-slot="task-overview" className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-medium text-muted-foreground">任务需求</h4>
              <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{prompt}</p>
              <p className="text-[11px] text-muted-foreground">
                {typeLabel} · {activeDefault?.model || '未选择模型'} · {activeSkill?.name || '未选择技能'}
                {attachmentCount > 0 && ` · 素材 ${attachmentCount} 个`} · {results.length} 个产物
              </p>
            </div>

            <div className="border-t border-border/50 pt-3 space-y-2">
              <h4 className="text-[11px] font-medium text-muted-foreground">执行过程</h4>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {stages.map((stage, i) => (
                  <span key={stage.label} className={`flex items-center gap-1 text-[11px] ${stage.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stage.done ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                    {i + 1}. {stage.label}
                  </span>
                ))}
              </div>
              <details className="group">
                <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  查看生成提示词（{fullPrompt.length} 字）
                </summary>
                <p className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border/50 px-3 py-2 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {fullPrompt}
                </p>
              </details>
            </div>
          </section>

          {/* 动态交流：只用左右气泡，不叠卡片 */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[11px] font-medium text-muted-foreground">对话记录</h4>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div data-slot="user-bubble" className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground">
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div data-slot="assistant-bubble" className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-md border border-border/60 bg-card px-3.5 py-2">
                      {msg.thinking && (
                        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{msg.thinking}</span>
                        </div>
                      )}
                      {msg.error && (
                        <p className="text-[12px] text-destructive leading-snug">{msg.error}</p>
                      )}
                      {msg.content && (isProcessNote(msg.content) || msg.content.length > 240 ? (
                        <details>
                          <summary className="text-[12px] text-muted-foreground cursor-pointer hover:text-foreground">
                            {isProcessNote(msg.content) ? '查看优化后的 Prompt' : '查看详细内容'}（{msg.content.length} 字）
                          </summary>
                          <p className="mt-2 max-h-40 overflow-y-auto text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </details>
                      ) : (
                        <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 对话输入：一个带框容器，配置与按钮都在内部 */}
        <div className="flex-shrink-0 px-4 pb-4 pt-1">
          <div data-slot="agent-composer" className="rounded-2xl border border-border bg-card p-2">
            <div className="flex items-center gap-2 flex-wrap mb-1.5 text-[11px] text-muted-foreground">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as OutputType)}
                aria-label="任务类型"
                className="h-7 rounded-lg bg-muted px-2 text-[11px] text-foreground outline-none"
              >
                <option value="video">视频</option>
                <option value="image">图片</option>
                <option value="text">文案</option>
                <option value="audio">音频</option>
              </select>
              <select
                value={modelOptions.some((o) => `${o.provider}:${o.model}` === activeModelKey) ? activeModelKey : ''}
                onChange={(e) => pickModel(e.target.value)}
                aria-label="生成模型"
                className="h-7 min-w-0 max-w-[190px] rounded-lg bg-muted px-2 text-[11px] text-foreground outline-none"
              >
                <option value="">{activeDefault ? activeDefault.model : '选择模型'}</option>
                {modelOptions.filter((o) => `${o.provider}:${o.model}` !== activeModelKey).map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <span className="truncate">{activeSkill?.name || '无技能'}</span>
              {!activeDefault && <span className="text-destructive">请在上方选择模型</span>}
            </div>
            <Textarea
              ref={inputRef}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFollowUp();
                }
              }}
              placeholder={running ? '生成中…' : '描述修改意见或继续追问…'}
              disabled={running}
              rows={2}
              className="min-h-[52px] max-h-[120px] resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-relaxed shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <div className="flex items-center justify-end px-1 pt-0.5">
              {running ? (
                <Button type="button" size="icon" variant="ghost"
                  aria-label="暂停生成"
                  onClick={() => abortRef.current?.abort()}
                  className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Square className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button type="button" size="icon"
                  aria-label="发送"
                  onClick={handleFollowUp}
                  disabled={!followUp.trim()}
                  className="h-8 w-8 rounded-lg">
                  <ArrowUp className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 左右分栏拖拽：拖动分界线调整左侧内容流宽度 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右面板宽度"
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          dragRef.current = { x: e.clientX, percent: leftPercent };
          document.body.style.cursor = 'col-resize';
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          setLeftPercent((v) => Math.min(Math.max(v + (e.key === 'ArrowRight' ? 2 : -2), 28), 65));
        }}
        className="group/split relative w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center focus-visible:outline-none"
      >
        <span className="h-12 w-0.5 rounded-full bg-border group-hover/split:bg-foreground/40 group-focus-visible/split:bg-foreground/40 transition-colors" />
      </div>

      {/* 右：结果铺满剩余区域 */}
      <div className="flex-1 min-w-0 flex p-3">
        <div className="rounded-2xl border border-border/70 bg-card p-3 flex-1 flex flex-col min-h-0 w-full">
          <div className="flex items-center gap-2 flex-wrap mb-3 flex-shrink-0">
            <h3 className="text-[13px] font-medium text-foreground">结果</h3>
            <span className="text-[11px] text-muted-foreground">
              {selected ? RESULT_LABEL[selected.type] : typeLabel} · {results.length} 个产物
            </span>
            <div className="ml-auto flex items-center gap-3">
              {selected?.url && (
                <a href={selected.url} download
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition">
                  <Download className="w-3.5 h-3.5" /> 下载
                </a>
              )}
              {selected?.text && (
                <button onClick={() => copyText(selected.text!)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition">
                  <Copy className="w-3.5 h-3.5" /> 复制
                </button>
              )}
              {!running && messages.length > 0 && (
                <button onClick={() => run(prompt, false, true)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition">
                  <RotateCcw className="w-3 h-3" /> 重新生成
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center">
            {!selected ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-10">
                <Sparkles className="w-6 h-6 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">执行后在这里显示结果</p>
                <p className="text-[11px] text-muted-foreground">支持视频、图片、文案与音频</p>
              </div>
            ) : selected.type === 'image' ? (
              <img src={selected.url} alt="生成结果" className="h-full w-full object-contain" />
            ) : selected.type === 'video' ? (
              <video src={selected.url} controls className="h-full w-full object-contain bg-black" />
            ) : selected.type === 'audio' ? (
              <div className="w-full max-w-md px-6 py-8 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center">
                  <Music className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-[12px] text-muted-foreground truncate max-w-full">{selected.name || '音频结果'}</p>
                <audio src={selected.url} controls className="w-full" />
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto p-5 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                {selected.text}
              </div>
            )}
          </div>

          {results.length > 1 && (
            <div className="flex items-center gap-2 mt-3 overflow-x-auto flex-shrink-0">
              {results.map((r, i) => {
                const Icon = RESULT_ICON[r.type];
                return (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
                      r.id === selected?.id ? 'border border-border text-foreground' : 'border border-transparent text-muted-foreground hover:text-foreground'
                    }`}>
                    <Icon className="w-3.5 h-3.5" /> {RESULT_LABEL[r.type]} {i + 1}
                  </button>
                );
              })}
            </div>
          )}
          {latestResult?.error && (
            <p className="text-[11px] text-destructive leading-snug mt-3 flex-shrink-0">{latestResult.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
