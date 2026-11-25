import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clapperboard,
  X,
  Wand2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ImageIcon,
  Clock,
  Sparkles,
  Cpu,
  Upload,
  Trash2,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { useModelStore } from '@/stores/model-store';
import { callAIChat, getStoryExtrapolatePrompt, getTimeExtrapolatePrompt } from '@/services/ai-service';
import { useNavigate } from 'react-router-dom';

interface StoryExtrapolationPanelProps {
  onClose: () => void;
  initialMode?: 'story' | 'time';
}

interface ExtrapolationResult {
  id: string;
  type: 'before' | 'after';
  index: number;
  description: string;
  mood: string;
  isGenerating?: boolean;
}

export function StoryExtrapolationPanel({ onClose, initialMode = 'story' }: StoryExtrapolationPanelProps) {
  const [inputDescription, setInputDescription] = useState('');
  const [results, setResults] = useState<ExtrapolationResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'story' | 'time'>(initialMode);
  const [referenceImage, setReferenceImage] = useState<{ file: File; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 获取当前模型信息
  const modelStore = useModelStore();
  const defaultModel = modelStore.getDefaultModel('text');
  const currentProvider = defaultModel?.provider || '';
  const currentModel = defaultModel?.model || '';
  const lookup = defaultModel?.serviceId || currentProvider;
  const keyConfig = lookup ? modelStore.getApiKeyForProvider(lookup) : undefined;
  const hasApiKey = Boolean(lookup && modelStore.getPlainApiKey(lookup) && keyConfig?.baseUrl);

  // 文件上传处理
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片文件（JPG、PNG、GIF 等）');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }
    const preview = URL.createObjectURL(file);
    setReferenceImage({ file, preview });
    // 重置 input 以便重新选择同一文件
    e.target.value = '';
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (referenceImage) {
      URL.revokeObjectURL(referenceImage.preview);
      setReferenceImage(null);
    }
  }, [referenceImage]);

  const handleExtrapolate = async (extrapolateMode: 'story' | 'time') => {
    if (!inputDescription.trim()) {
      toast.error('请输入画面描述');
      return;
    }

    const storeState = useModelStore.getState();
    const defModel = storeState.getDefaultModel('text');
    if (!defModel) {
      toast.error('请先在「设置 → 模型 & Key」添加文本模型并设为默认');
      return;
    }
    const provider = defModel.provider;
    const model = defModel.model;
    const lookup = defModel.serviceId || provider;
    const keyConfig = storeState.getApiKeyForProvider(lookup);
    const apiKey = storeState.getPlainApiKey(lookup) || '';

    if (!apiKey || !keyConfig?.baseUrl) {
      toast.error('文本服务配置不完整，请在「设置 → 模型 & Key」检查服务地址与 API Key');
      return;
    }

    setIsGenerating(true);
    setResults([]);

    try {
      const keyConfig = storeState.getApiKeyForProvider(provider);
      const systemPrompt = extrapolateMode === 'story' ? getStoryExtrapolatePrompt() : getTimeExtrapolatePrompt();
      const userMsg = extrapolateMode === 'story'
        ? `请根据以下关键画面描述，推演前因后果：\n\n${inputDescription}${referenceImage ? '\n\n（当前接口仅使用文字描述）' : ''}`
        : `请根据以下当前画面描述，推演时间前后的画面变化：\n\n${inputDescription}${referenceImage ? '\n\n（当前接口仅使用文字描述）' : ''}`;

      const result = await callAIChat({
        provider,
        model,
        apiKey,
        baseUrl: keyConfig?.baseUrl,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        temperature: extrapolateMode === 'story' ? 0.9 : 0.8,
        maxTokens: extrapolateMode === 'story' ? 2048 : 1024,
      });

      let parsed: ExtrapolationResult[] = [];
      try {
        let jsonStr = result.content;
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        const rawResults = JSON.parse(jsonStr);
        parsed = rawResults.map((r: Record<string, unknown>, i: number) => ({
          id: String(i + 1),
          type: r.type as 'before' | 'after',
          index: (r.index as number) || i + 1,
          description: (r.description as string) || '',
          mood: (r.mood as string) || '',
        }));
      } catch {
        parsed = [{
          id: '1',
          type: 'after',
          index: 1,
          description: result.content,
          mood: '推演结果',
        }];
      }

      setResults(parsed);
      toast.success(extrapolateMode === 'story' ? '剧情推演完成' : '画面推演完成');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '推演失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const beforeResults = results
    .filter((r) => r.type === 'before')
    .sort((a, b) => b.index - a.index);
  const afterResults = results
    .filter((r) => r.type === 'after')
    .sort((a, b) => a.index - b.index);

  return (
    <div className="absolute right-5 top-5 w-[420px] bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl z-50 flex flex-col max-h-[calc(100vh-140px)] animate-in fade-in slide-in-from-right-3 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{mode === 'story' ? '剧情推演' : '画面推演'}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            <button
              className={`px-3 py-1 rounded-md text-[11px] transition ${
                mode === 'story'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode('story')}
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              剧情推演
            </button>
            <button
              className={`px-3 py-1 rounded-md text-[11px] transition ${
                mode === 'time'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode('time')}
            >
              <Clock className="w-3 h-3 inline mr-1" />
              画面推演
            </button>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 模型信息条 — 显示当前使用的模型 */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate">
            {currentModel || '未设置文本模型'}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            ({keyConfig?.name || currentProvider || '未配置服务'})
          </span>
          {!hasApiKey && (
            <span className="text-[11px] text-destructive flex-shrink-0">未配置服务</span>
          )}
        </div>
        <button
          onClick={() => navigate('/settings/models')}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition flex-shrink-0"
          title="前往模型设置"
        >
          <Settings className="w-3 h-3" />
          切换
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Input */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {mode === 'story' ? '关键画面描述' : '当前画面描述'}
              </Label>
              <Textarea
                value={inputDescription}
                onChange={(e) => setInputDescription(e.target.value)}
                placeholder={
                  mode === 'story'
                    ? '描述一个关键画面，AI将推演前因后果...\n例如：女主角站在窗前，手中拿着一张旧照片，眼角有泪痕。'
                    : '描述当前画面，AI将预测时间前后的画面变化...\n例如：一个人站在路口，正要转身离去。'
                }
                rows={3}
                className="text-xs resize-none bg-background/50"
              />
            </div>

            {/* Upload zone for reference image — 真实可交互 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {referenceImage ? (
              <div className="relative rounded-lg border border-border overflow-hidden group">
                <img
                  src={referenceImage.preview}
                  alt="参考画面"
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" /> 更换
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> 删除
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-[10px] text-white/80 truncate">
                  {referenceImage.file.name}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-border rounded-lg p-3 text-center hover:bg-accent/50 hover:border-muted-foreground/30 transition cursor-pointer"
              >
                <ImageIcon className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-[10px] text-muted-foreground">点击上传参考画面（可选）</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">支持 JPG、PNG、GIF，不超过 10MB</p>
              </button>
            )}

            <Button
              size="sm"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => handleExtrapolate(mode)}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 mr-1" />
              )}
              {mode === 'story' ? '开始推演剧情' : '开始推演画面'}
            </Button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground font-medium">推演结果</div>

              {/* Timeline visualization */}
              <div className="relative">
                {/* Before scenes */}
                {beforeResults.map((result) => (
                  <div key={result.id} className="flex gap-3 mb-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                        <ArrowLeft className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-medium text-blue-400">
                          {mode === 'story' ? `前因 #${result.index}` : `回溯`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {result.mood}
                        </span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">
                        {result.description}
                      </p>
                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                          <ImageIcon className="w-3 h-3 mr-0.5" /> 生成图片
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Center: Current scene */}
                <div className="flex gap-3 mb-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 ring-2 ring-indigo-500/30">
                      <Clapperboard className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="w-px flex-1 bg-border mt-1" />
                  </div>
                  <div className="flex-1 p-3 rounded-lg bg-accent/50 border border-border">
                    <span className="text-[10px] font-medium text-muted-foreground">当前画面</span>
                    <p className="text-xs text-foreground leading-relaxed mt-1">
                      {inputDescription}
                    </p>
                  </div>
                </div>

                {/* After scenes */}
                {afterResults.map((result) => (
                  <div key={result.id} className="flex gap-3 mb-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-lg bg-slate-500/15 flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                      </div>
                      {result.index < afterResults.length && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-slate-500/5 border border-slate-500/10">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-medium text-slate-500">
                          {mode === 'story' ? `后续 #${result.index}` : `预测`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {result.mood}
                        </span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">
                        {result.description}
                      </p>
                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                          <ImageIcon className="w-3 h-3 mr-0.5" /> 生成图片
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
