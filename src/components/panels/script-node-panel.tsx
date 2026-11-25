/**
 * 脚本/分镜节点的属性面板。
 *
 * 从 property-panel.tsx 拆出：这个面板本身就接近 550 行，
 * 内部还带批量生图/生视频的进度逻辑，混在主文件里让整体无法维护。
 */
import { useState } from 'react';
import { useModelStore } from '@/stores/model-store';
import { callImageGeneration, callVideoGeneration } from '@/services/ai-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ImageIcon, Video, Loader2, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ModelSelector } from './node-props-shared';

export function ScriptNodePanel({
  data,
  update,
  status,
  handleGenerate,
  nodeActionColors,
}: {
  data: Record<string, unknown>;
  update: (key: string, value: unknown) => void;
  status: string;
  handleGenerate: () => void;
  nodeActionColors: Record<string, string>;
}) {
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, type: '' });

  const scenes = (data.scenes as Array<Record<string, unknown>>) || [];

  const handleAddScene = () => {
    const newScene = {
      id: `scene-${Date.now()}`,
      sceneNumber: scenes.length + 1,
      durationSeconds: 5,
      shotType: '中景',
      cameraAngle: '平视',
      cameraMovement: '固定',
      sceneDescription: '',
      dialogue: '',
      voiceover: '',
      mood: '',
      lighting: '自然光',
      musicNote: '',
      referenceImageUrl: '',
      generatedImageUrl: '',
      generatedVideoUrl: '',
    };
    update('scenes', [...scenes, newScene]);
    setExpandedScene(scenes.length);
    toast.success('已添加新场景');
  };

  const updateScene = (index: number, key: string, value: unknown) => {
    const updatedScenes = [...scenes];
    updatedScenes[index] = { ...updatedScenes[index], [key]: value };
    update('scenes', updatedScenes);
  };

  const removeScene = (index: number) => {
    const updatedScenes = scenes.filter((_, i) => i !== index);
    // 重新编号
    updatedScenes.forEach((s, i) => { s.sceneNumber = i + 1; });
    update('scenes', updatedScenes);
    setExpandedScene(null);
    toast.success('场景已删除');
  };

  const handleBatchGenerateImages = async () => {
    if (scenes.length === 0) {
      toast.error('没有分镜场景可以生图');
      return;
    }

    const modelStore = useModelStore.getState();
    const defaultImgModel = modelStore.getDefaultModel('image');
    if (!defaultImgModel) {
      toast.error('请先在「设置 → 模型 & Key」添加图片模型并设为默认');
      return;
    }
    const lookup = defaultImgModel.serviceId || defaultImgModel.provider;
    const imgService = modelStore.getApiKeyForProvider(lookup);
    const effectiveProvider = defaultImgModel.provider;
    const effectiveModel = defaultImgModel.model;
    const effectiveKey = modelStore.getPlainApiKey(lookup) || '';
    const effectiveBaseUrl = imgService?.baseUrl || '';

    if (!effectiveKey || !effectiveBaseUrl) {
      toast.error('图片服务配置不完整，请在「设置 → 模型 & Key」检查地址与密钥');
      return;
    }

    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: scenes.length, type: '生图' });
    toast.info(`开始批量生成 ${scenes.length} 张分镜图...`);

    let successCount = 0;
    let failCount = 0;
    const updatedScenes = [...scenes];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      setBatchProgress({ current: i + 1, total: scenes.length, type: '生图' });
      try {
        const prompt = (scene.sceneDescription as string) || `场景 ${scene.sceneNumber}`;
        const result = await callImageGeneration({
          provider: effectiveProvider,
          model: effectiveModel,
          apiKey: effectiveKey,
          baseUrl: effectiveBaseUrl,
          prompt: `电影分镜画面：${prompt}。情绪氛围：${scene.mood || ''}。镜头：${scene.shotType || ''} ${scene.cameraAngle || ''}`,
          width: 1024,
          height: 576,
        });
        // 保存生成的图片 URL 到场景数据
        if (result && result.imageUrl) {
          updatedScenes[i] = { ...updatedScenes[i], generatedImageUrl: result.imageUrl };
        }
        successCount++;
        toast.success(`场景 ${scene.sceneNumber} 图片生成完成 (${successCount}/${scenes.length})`);
      } catch (err) {
        failCount++;
        toast.error(`场景 ${scene.sceneNumber} 生图失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }

    update('scenes', updatedScenes);
    setIsBatchGenerating(false);

    if (failCount === 0) {
      toast.success(`全部 ${successCount} 张分镜图生成完成！`);
    } else {
      toast.warning(`完成 ${successCount} 张，失败 ${failCount} 张`);
    }
  };

  const handleBatchGenerateVideos = async () => {
    if (scenes.length === 0) {
      toast.error('没有分镜场景可以生成视频');
      return;
    }

    const modelStore = useModelStore.getState();
    const defaultVideoModel = modelStore.getDefaultModel('video');
    if (!defaultVideoModel) {
      toast.error('请先在「设置 → 模型 & Key」添加视频模型并设为默认');
      return;
    }
    const lookup = defaultVideoModel.serviceId || defaultVideoModel.provider;
    const videoService = modelStore.getApiKeyForProvider(lookup);
    const vidProvider = defaultVideoModel.provider;
    const vidModel = defaultVideoModel.model;
    const vidApiKey = modelStore.getPlainApiKey(lookup) || '';
    const vidBaseUrl = videoService?.baseUrl || '';

    if (!vidApiKey || !vidBaseUrl) {
      toast.error('视频服务配置不完整，请在「设置 → 模型 & Key」检查地址与密钥');
      return;
    }

    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: scenes.length, type: '生视频' });
    toast.info(`开始批量生成 ${scenes.length} 个分镜视频，需等待视频任务完成（每个最多约 5 分钟）...`);

    let successCount = 0;
    let failCount = 0;
    const updatedScenes = [...scenes];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      setBatchProgress({ current: i + 1, total: scenes.length, type: '生视频' });
      try {
        const prompt = (scene.sceneDescription as string) || `场景 ${scene.sceneNumber}`;
        const imageUrl = (scene.generatedImageUrl as string) || undefined;
        // 用 callVideoGeneration（提交 + 轮询）而非 submitVideoGeneration（仅提交），
        // 否则拿不到 videoUrl，分镜视频永远不会写入，导出面板也收集不到。
        const result = await callVideoGeneration({
          provider: vidProvider,
          model: vidModel,
          apiKey: vidApiKey,
          baseUrl: vidBaseUrl,
          prompt: `${prompt}。${scene.cameraMovement || '固定'}镜头，${scene.mood || ''}氛围`,
          duration: (scene.durationSeconds as number) || 5,
          imageUrl,
        });
        if (result && result.videoUrl) {
          updatedScenes[i] = { ...updatedScenes[i], generatedVideoUrl: result.videoUrl };
          successCount++;
          toast.success(`场景 ${scene.sceneNumber} 视频已生成 (${successCount}/${scenes.length})`);
        } else {
          failCount++;
          toast.error(`场景 ${scene.sceneNumber} 未返回视频地址`);
        }
      } catch (err) {
        failCount++;
        toast.error(`场景 ${scene.sceneNumber} 视频提交失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }

    update('scenes', updatedScenes);
    setIsBatchGenerating(false);

    if (failCount === 0) {
      toast.success(`全部 ${successCount} 个分镜视频已生成！`);
    } else {
      toast.warning(`已生成 ${successCount} 个，失败 ${failCount} 个`);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">剧名</Label>
        <Input
          value={(data.title as string) || ''}
          onChange={(e) => update('title', e.target.value)}
          placeholder="输入剧名..."
          className="h-8 text-sm bg-muted/50"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">源文本</Label>
        <Textarea
          value={(data.sourceText as string) || ''}
          onChange={(e) => update('sourceText', e.target.value)}
          placeholder="粘贴剧本或故事大纲..."
          rows={4}
          className="text-sm bg-muted/50 min-h-[80px]"
        />
      </div>

      {/* Scene list with view toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">
            分镜场景 ({scenes.length})
          </Label>
          <div className="flex items-center gap-1">
            {/* 列表/九宫格切换 */}
            <button
              className={`p-1 rounded transition ${viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <button
              className={`p-1 rounded transition ${viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('grid')}
              title="九宫格视图"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleAddScene}>
              <Plus className="w-3 h-3 mr-0.5" /> 添加
            </Button>
          </div>
        </div>

        {/* 九宫格视图 */}
        {viewMode === 'grid' && scenes.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {scenes.map((scene, i) => (
              <div
                key={i}
                className={`relative rounded-lg border overflow-hidden cursor-pointer transition-all hover:ring-1 hover:ring-violet-500/50 ${expandedScene === i ? 'ring-2 ring-violet-500' : 'border-border/40'}`}
                onClick={() => setExpandedScene(expandedScene === i ? null : i)}
              >
                {/* 分镜图预览 */}
                {(scene.generatedImageUrl as string) ? (
                  <img
                    src={scene.generatedImageUrl as string}
                    alt={`场景 ${scene.sceneNumber}`}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-violet-500/5 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                {/* 场景编号 */}
                <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[8px] px-1 rounded font-mono">
                  #{(scene.sceneNumber as number) || i + 1}
                </div>
                {/* 时长 */}
                <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[8px] px-1 rounded">
                  {(scene.durationSeconds as number) || 0}s
                </div>
                {/* 已有视频标记 */}
                {(scene.generatedVideoUrl as string) && (
                  <div className="absolute top-0.5 right-0.5 bg-slate-500/80 text-white text-[8px] px-1 rounded">
                    <Video className="w-2.5 h-2.5 inline" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 列表视图 */}
        {viewMode === 'list' && scenes.length > 0 && (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-0.5">
            {scenes.map((scene, i) => (
              <div key={i}>
                <div
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${expandedScene === i ? 'bg-violet-500/15 border border-violet-500/30' : 'bg-accent/20 hover:bg-accent/30'}`}
                  onClick={() => setExpandedScene(expandedScene === i ? null : i)}
                >
                  {/* 分镜图缩略图 */}
                  {(scene.generatedImageUrl as string) ? (
                    <img src={scene.generatedImageUrl as string} alt="" className="w-8 h-5 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-5 rounded bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[8px] text-violet-400 font-mono">#{(scene.sceneNumber as number) || i + 1}</span>
                    </div>
                  )}
                  <span className="flex-1 text-muted-foreground line-clamp-1">
                    {(scene.sceneDescription as string) || `场景 ${i + 1}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {(scene.durationSeconds as number) || 0}s
                  </span>
                  <svg
                    className={`w-3 h-3 text-muted-foreground transition-transform flex-shrink-0 ${expandedScene === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* 展开编辑 */}
                {expandedScene === i && (
                  <div className="mt-1 p-2.5 rounded-md bg-accent/10 border border-border/30 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">场景描述</Label>
                      <Textarea
                        value={(scene.sceneDescription as string) || ''}
                        onChange={(e) => updateScene(i, 'sceneDescription', e.target.value)}
                        rows={2}
                        className="text-xs bg-muted/50 min-h-[48px]"
                        placeholder="描述画面内容..."
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">景别</Label>
                        <select
                          value={(scene.shotType as string) || '中景'}
                          onChange={(e) => updateScene(i, 'shotType', e.target.value)}
                          className="w-full h-6 rounded border border-border/50 bg-muted/50 px-1 text-[10px]"
                        >
                          <option value="特写">特写</option>
                          <option value="近景">近景</option>
                          <option value="中景">中景</option>
                          <option value="全景">全景</option>
                          <option value="远景">远景</option>
                          <option value="大远景">大远景</option>
                        </select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">运镜</Label>
                        <select
                          value={(scene.cameraMovement as string) || '固定'}
                          onChange={(e) => updateScene(i, 'cameraMovement', e.target.value)}
                          className="w-full h-6 rounded border border-border/50 bg-muted/50 px-1 text-[10px]"
                        >
                          <option value="固定">固定</option>
                          <option value="推">推</option>
                          <option value="拉">拉</option>
                          <option value="摇">摇</option>
                          <option value="移">移</option>
                          <option value="跟">跟</option>
                          <option value="升">升</option>
                          <option value="降">降</option>
                          <option value="环绕">环绕</option>
                        </select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">时长(s)</Label>
                        <Input
                          type="number"
                          value={(scene.durationSeconds as number) || 5}
                          onChange={(e) => updateScene(i, 'durationSeconds', Number(e.target.value))}
                          className="h-6 text-[10px] bg-muted/50 px-1"
                          min={1}
                          max={120}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">情绪氛围</Label>
                        <Input
                          value={(scene.mood as string) || ''}
                          onChange={(e) => updateScene(i, 'mood', e.target.value)}
                          className="h-6 text-[10px] bg-muted/50 px-1.5"
                          placeholder="如：紧张、温馨..."
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">灯光</Label>
                        <Input
                          value={(scene.lighting as string) || ''}
                          onChange={(e) => updateScene(i, 'lighting', e.target.value)}
                          className="h-6 text-[10px] bg-muted/50 px-1.5"
                          placeholder="如：暖色调..."
                        />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px] text-muted-foreground">对白/旁白</Label>
                      <Input
                        value={(scene.dialogue as string) || (scene.voiceover as string) || ''}
                        onChange={(e) => updateScene(i, 'dialogue', e.target.value)}
                        className="h-6 text-[10px] bg-muted/50 px-1.5"
                        placeholder="对白或旁白文案..."
                      />
                    </div>

                    {/* 分镜图预览 */}
                    {(scene.generatedImageUrl as string) && (
                      <div className="relative rounded overflow-hidden border border-border/40">
                        <img
                          src={scene.generatedImageUrl as string}
                          alt={`场景 ${scene.sceneNumber}`}
                          className="w-full aspect-video object-cover"
                        />
                        <button
                          className="absolute top-1 right-1 w-4 h-4 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                          onClick={(e) => { e.stopPropagation(); updateScene(i, 'generatedImageUrl', ''); }}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}

                    {/* 视频预览 */}
                    {(scene.generatedVideoUrl as string) && (
                      <div className="relative rounded overflow-hidden border border-border/40">
                        <video
                          src={scene.generatedVideoUrl as string}
                          controls
                          className="w-full aspect-video"
                        />
                      </div>
                    )}

                    {/* 删除场景 */}
                    <button
                      className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition"
                      onClick={(e) => { e.stopPropagation(); removeScene(i); }}
                    >
                      <Trash2 className="w-3 h-3" /> 删除此场景
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {scenes.length === 0 && (
          <div className="text-center py-4 text-[10px] text-muted-foreground">
            暂无分镜场景，请先生成分镜脚本
          </div>
        )}
      </div>

      <ModelSelector
        type="text"
        currentProvider={(data.provider as string) || ''}
        currentModel={(data.model as string) || ''}
        currentServiceId={(data.serviceId as string) || ''}
        onSelect={(provider, model, serviceId) => {
          update('provider', provider);
          update('model', model);
          update('serviceId', serviceId);
        }}
      />

      {/* 批量进度 */}
      {isBatchGenerating && (
        <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-violet-300 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              批量{batchProgress.type}中...
            </span>
            <span className="text-[10px] text-muted-foreground">
              {batchProgress.current}/{batchProgress.total}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-violet-500/10 overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button
          size="sm"
          className={`w-full ${nodeActionColors['script']}`}
          onClick={handleGenerate}
          disabled={status === 'running' || isBatchGenerating}
        >
          {status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5 mr-1" />
          )}
          生成分镜脚本
        </Button>

        {scenes.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={handleBatchGenerateImages}
                disabled={isBatchGenerating}
              >
                {isBatchGenerating && batchProgress.type === '生图' ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ImageIcon className="w-3 h-3 mr-1" />
                )}
                生成分镜图
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={handleBatchGenerateVideos}
                disabled={isBatchGenerating}
              >
                {isBatchGenerating && batchProgress.type === '生视频' ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Video className="w-3 h-3 mr-1" />
                )}
                批量生视频
              </Button>
            </div>
            {/* 切换到九宫格视图的快捷提示 */}
            {viewMode === 'list' && scenes.some(s => s.generatedImageUrl) && (
              <button
                className="w-full text-[10px] text-violet-400 hover:text-violet-300 py-1 transition"
                onClick={() => setViewMode('grid')}
              >
                有分镜图已生成，点击切换到九宫格预览 →
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
