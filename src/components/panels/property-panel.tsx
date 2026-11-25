import { confirmAction } from '@/components/shared/confirm-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useModelStore } from '@/stores/model-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Type,
  ImageIcon,
  Video,
  Music,
  FileText,
  Sparkles,
  Trash2,
  X,
  Copy,
  RotateCcw,
  Loader2,
  CheckCircle,
  AlertCircle} from 'lucide-react';
import { toast } from 'sonner';
import { TextNodeProps } from './text-node-props';
import { ImageNodeProps } from './image-node-props';
import { VideoNodeProps } from './video-node-props';
import { AudioNodeProps } from './audio-node-props';
import { AiProcessNodeProps } from './ai-process-node-props';
import { ScriptNodePanel } from './script-node-panel';

const nodeIcons: Record<string, React.ReactNode> = {
  text: <Type className="w-4 h-4 text-indigo-400" />,
  image: <ImageIcon className="w-4 h-4 text-slate-500" />,
  video: <Video className="w-4 h-4 text-amber-400" />,
  audio: <Music className="w-4 h-4 text-pink-400" />,
  script: <FileText className="w-4 h-4 text-violet-400" />,
  'ai-process': <Sparkles className="w-4 h-4 text-cyan-400" />,
};

const nodeBgColors: Record<string, string> = {
  text: 'bg-indigo-500/10 border-indigo-500/20',
  image: 'bg-slate-500/10 border-slate-500/20',
  video: 'bg-amber-500/10 border-amber-500/20',
  audio: 'bg-pink-500/10 border-pink-500/20',
  script: 'bg-violet-500/10 border-violet-500/20',
  'ai-process': 'bg-cyan-500/10 border-cyan-500/20',
};

const nodeActionColors: Record<string, string> = {
  text: 'bg-indigo-600 hover:bg-indigo-700',
  image: 'bg-gray-700 hover:bg-gray-800',
  video: 'bg-amber-600 hover:bg-amber-700',
  audio: 'bg-pink-600 hover:bg-pink-700',
  script: 'bg-violet-600 hover:bg-violet-700',
  'ai-process': 'bg-cyan-600 hover:bg-cyan-700',
};

export function PropertyPanel() {
  const { selectedNodeId, nodes, edges, updateNodeData, deleteNode, selectNode, executeNode } = useWorkflowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // 获取直接上游节点输出内容 — 用于节点间数据衔接
  const getUpstreamContent = (nodeId: string): { text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string } => {
    const result: { text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string } = {};
    const incomingEdges = edges.filter(e => e.target === nodeId);
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) continue;
      const sourceData = sourceNode.data as Record<string, unknown>;
      if (sourceNode.type === 'text') {
        result.text = (sourceData.content as string) || undefined;
      } else if (sourceNode.type === 'image') {
        result.imageUrl = (sourceData.imageUrl as string) || (sourceData.uploadedImageUrl as string) || undefined;
      } else if (sourceNode.type === 'video') {
        result.videoUrl = (sourceData.videoUrl as string) || undefined;
      } else if (sourceNode.type === 'audio') {
        result.audioUrl = (sourceData.audioUrl as string) || (sourceData.uploadedAudioUrl as string) || undefined;
      } else if (sourceNode.type === 'script') {
        result.text = (sourceData.sourceText as string) || (sourceData.title as string) || undefined;
        // 也把分镜图提取出来
        const scenes = (sourceData.scenes as Array<Record<string, unknown>>) || [];
        if (scenes.length > 0) {
          const firstImgScene = scenes.find(s => s.generatedImageUrl);
          if (firstImgScene) result.imageUrl = firstImgScene.generatedImageUrl as string;
        }
      } else if (sourceNode.type === 'ai-process') {
        result.text = (sourceData.outputText as string) || undefined;
      }
    }
    return result;
  };

  // 递归获取完整上游工作流链路摘要 — 按拓扑序从源头到当前节点
  const getFullUpstreamSummary = (nodeId: string): Array<{
    id: string; type: string; label: string; status: string;
    summary: string; imageUrl?: string; videoUrl?: string; audioUrl?: string;
    sceneCount?: number; scenes?: Array<Record<string, unknown>>;
  }> => {
    const visited = new Set<string>();
    const result: Array<{
      id: string; type: string; label: string; status: string;
      summary: string; imageUrl?: string; videoUrl?: string; audioUrl?: string;
      sceneCount?: number; scenes?: Array<Record<string, unknown>>;
    }> = [];

    const traverse = (nid: string) => {
      if (visited.has(nid)) return;
      visited.add(nid);
      // 先递归处理更上游的节点
      const incoming = edges.filter(e => e.target === nid);
      for (const edge of incoming) {
        traverse(edge.source);
      }
      // 将当前节点加入摘要（排除自身）
      if (nid !== nodeId) {
        const node = nodes.find(n => n.id === nid);
        if (!node) return;
        const nd = node.data as Record<string, unknown>;
        const nodeType = node.type || 'text';
        let summary = '';
        let imageUrl: string | undefined;
        let videoUrl: string | undefined;
        let audioUrl: string | undefined;
        let sceneCount: number | undefined;
        let scenes: Array<Record<string, unknown>> | undefined;

        if (nodeType === 'text') {
          summary = ((nd.content as string) || '').slice(0, 80);
        } else if (nodeType === 'image') {
          imageUrl = (nd.imageUrl as string) || (nd.uploadedImageUrl as string) || undefined;
          summary = (nd.prompt as string)?.slice(0, 60) || '图片素材';
        } else if (nodeType === 'video') {
          videoUrl = (nd.videoUrl as string) || undefined;
          summary = (nd.prompt as string)?.slice(0, 60) || '视频素材';
        } else if (nodeType === 'audio') {
          audioUrl = (nd.audioUrl as string) || (nd.uploadedAudioUrl as string) || undefined;
          summary = (nd.prompt as string)?.slice(0, 60) || '音频素材';
        } else if (nodeType === 'script') {
          scenes = (nd.scenes as Array<Record<string, unknown>>) || [];
          sceneCount = scenes.length;
          summary = (nd.title as string) || `${sceneCount} 个分镜场景`;
        } else if (nodeType === 'ai-process') {
          summary = ((nd.outputText as string) || (nd.prompt as string) || '').slice(0, 80);
        }

        result.push({
          id: nid,
          type: nodeType,
          label: (nd.label as string) || nodeType,
          status: (nd.status as string) || 'idle',
          summary,
          imageUrl,
          videoUrl,
          audioUrl,
          sceneCount,
          scenes,
        });
      }
    };

    traverse(nodeId);
    return result;
  };

  if (!selectedNode) return null;

  const data = selectedNode.data as Record<string, unknown>;
  const nodeType = selectedNode.type || 'text';
  const status = data.status as string;

  const update = (key: string, value: unknown) => {
    updateNodeData(selectedNode.id, { [key]: value });
  };

  // 上游节点的输出，供各节点分区组件做「引用上游内容」
  const upstream = getUpstreamContent(selectedNode.id);

  const handleGenerate = async () => {
    // 前置校验：模型与密钥配置
    const provider = (data.provider as string) || '';
    const model = (data.model as string) || '';
    if (!provider || !model) {
      toast.error('请先选择 AI 模型。在右侧面板的"AI 模型"下拉框中选择一个模型。');
      return;
    }
    const modelStore = useModelStore.getState();
    const serviceId = (data.serviceId as string) || '';
    const lookup = serviceId || provider;
    const keyConfig = modelStore.getApiKeyForProvider(lookup);
    if (!keyConfig?.apiKeyEncrypted || !keyConfig?.baseUrl) {
      toast.error('模型服务配置不完整，请在「设置 → 模型 & Key」检查服务地址与 API Key');
      return;
    }

    toast.info('AI 生成任务已提交...');
    try {
      await executeNode(selectedNode.id);
      // 重新获取节点数据检查状态
      const updatedNode = useWorkflowStore.getState().nodes.find(n => n.id === selectedNode.id);
      const updatedData = updatedNode?.data as Record<string, unknown>;
      if (updatedData?.status === 'completed') {
        toast.success('AI 生成完成！');
      } else if (updatedData?.status === 'error') {
        toast.error((updatedData.errorMessage as string) || '生成失败');
      }
    } catch {
      toast.error('生成失败，请检查网络和 API Key 配置');
    }
  };

  return (
    <aside className="w-full h-full min-w-[280px] bg-transparent flex flex-col animate-slide-in-right overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${nodeBgColors[nodeType]}`}>
            {nodeIcons[nodeType]}
          </div>
          <div>
            <span className="text-sm font-medium">{(data.label as string) || '节点属性'}</span>
            {status && status !== 'idle' && (
              <div className="flex items-center gap-1 mt-0.5">
                {status === 'running' && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                {status === 'completed' && <CheckCircle className="w-3 h-3 text-slate-500" />}
                {status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                <span className="text-[10px] text-muted-foreground capitalize">
                  {status === 'running' ? '生成中...' : status === 'completed' ? '已完成' : status === 'error' ? '失败' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => selectNode(null)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Scrollable content — min-h-0 确保 flex-1 在小屏幕上正确收缩，让 ScrollArea 出现滚动条 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3.5 space-y-3.5">
          {/* Common: Label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">节点名称</Label>
            <Input
              value={(data.label as string) || ''}
              onChange={(e) => update('label', e.target.value)}
              className="h-8 text-sm bg-muted/50"
            />
          </div>

          <Separator className="opacity-0 my-0.5" />

          {/* ===== 统一失败原因提示 =====
              错误信息在文本节点分支外统一展示，覆盖图片/视频/音频/脚本节点
              用户只能看到「失败」两个字，不知道具体原因。 */}
          {status === 'error' && (data.errorMessage as string) && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-400 leading-relaxed break-words">
                  {data.errorMessage as string}
                </p>
              </div>
            </div>
          )}

          {/* ===== 上游工作流摘要（只读信息展示，不可点击跳转） ===== */}
          {(() => {
            const upstreamNodes = getFullUpstreamSummary(selectedNode.id);
            if (upstreamNodes.length === 0) return null;
            const completedCount = upstreamNodes.filter(u => u.status === 'completed').length;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-3 rounded-full bg-indigo-500" />
                  <Label className="text-xs text-muted-foreground font-medium">上游依赖</Label>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {completedCount}/{upstreamNodes.length} 已完成
                  </span>
                </div>
                <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                  {upstreamNodes.map((up) => (
                    <div
                      key={up.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30"
                    >
                      {/* 状态指示灯 */}
                      <div className="flex-shrink-0">
                        {up.status === 'completed' ? (
                          <CheckCircle className="w-3 h-3 text-slate-500" />
                        ) : up.status === 'error' ? (
                          <AlertCircle className="w-3 h-3 text-red-400" />
                        ) : up.status === 'running' ? (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      {/* 节点类型图标 */}
                      <div className="flex-shrink-0">
                        {up.type === 'text' && <Type className="w-3 h-3 text-indigo-400" />}
                        {up.type === 'image' && <ImageIcon className="w-3 h-3 text-slate-500" />}
                        {up.type === 'video' && <Video className="w-3 h-3 text-amber-400" />}
                        {up.type === 'audio' && <Music className="w-3 h-3 text-pink-400" />}
                        {up.type === 'script' && <FileText className="w-3 h-3 text-violet-400" />}
                        {up.type === 'ai-process' && <Sparkles className="w-3 h-3 text-cyan-400" />}
                      </div>
                      {/* 节点名称 + 摘要 */}
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium truncate block">{up.label}</span>
                        {up.summary && (
                          <p className="text-[11px] text-muted-foreground truncate">{up.summary}</p>
                        )}
                      </div>
                      {/* 分镜数量 */}
                      {up.type === 'script' && up.sceneCount != null && up.sceneCount > 0 && (
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">{up.sceneCount} 场景</span>
                      )}
                    </div>
                  ))}
                </div>
                <Separator className="opacity-0 my-0.5" />
              </div>
            );
          })()}

          {nodeType === 'text' && (
            <TextNodeProps
              data={data}
              update={update}
              status={status}
              upstream={upstream}
              onGenerate={handleGenerate}
            />
          )}
          {nodeType === 'image' && (
            <ImageNodeProps
              data={data}
              update={update}
              status={status}
              upstream={upstream}
              onGenerate={handleGenerate}
            />
          )}
          {nodeType === 'video' && (
            <VideoNodeProps
              data={data}
              update={update}
              status={status}
              upstream={upstream}
              onGenerate={handleGenerate}
            />
          )}
          {nodeType === 'audio' && (
            <AudioNodeProps
              data={data}
              update={update}
              status={status}
              upstream={upstream}
              onGenerate={handleGenerate}
            />
          )}
          {/* ===== SCRIPT NODE ===== */}
          {nodeType === 'script' && (
            <ScriptNodePanel
              data={data}
              update={update}
              status={status}
              handleGenerate={handleGenerate}
              nodeActionColors={nodeActionColors}
            />
          )}

          {nodeType === 'ai-process' && (
            <AiProcessNodeProps
              data={data}
              update={update}
              status={status}
              upstream={upstream}
              onGenerate={handleGenerate}
            />
          )}
        </div>
      </ScrollArea>

      {/* 底部操作栏 — 固定在面板底部，不随内容滚动 */}
      <div className="flex-shrink-0 px-3 py-2 space-y-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs justify-center text-muted-foreground hover:text-foreground h-7"
            onClick={async () => {
              const text = JSON.stringify(selectedNode.data, null, 2);
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(text);
                } else {
                  const ta = document.createElement('textarea');
                  ta.value = text;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                }
                toast.success('节点数据已复制');
              } catch {
                toast.error('复制失败');
              }
            }}
          >
            <Copy className="w-3 h-3 mr-1.5" /> 复制
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs justify-center text-muted-foreground hover:text-foreground h-7"
            onClick={() => {
              update('status', 'idle');
              toast.success('状态已重置');
            }}
          >
            <RotateCcw className="w-3 h-3 mr-1.5" /> 重置
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7"
            onClick={async () => {
              const ok = await confirmAction({
                title: `删除节点「${(data.label as string) || '未命名'}」？`,
                description: '删除后可用 ⌘Z 撤销。',
                confirmText: '删除', destructive: true,
              });
              if (!ok) return;
              deleteNode(selectedNode.id);
              toast.success('节点已删除');
            }}
          >
            <Trash2 className="w-3 h-3 mr-1.5" /> 删除
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** 脚本节点专用面板 — 分镜场景编辑、九宫格预览、批量生图/生视频 */