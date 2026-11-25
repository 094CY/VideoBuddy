import { useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  X,
  Video,
  Loader2,
  CheckCircle,
  FileVideo,
  Settings2,
  Music,
  ImageIcon,
  FileText,
  Layers,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExportPanelProps {
  onClose: () => void;
}

interface ExportConfig {
  includeAudio: boolean;
}

interface VideoSegment {
  id: string;
  nodeId: string;
  label: string;
  duration: number;
  order: number;
  status: 'pending' | 'ready' | 'error';
}

interface AudioTrack {
  id: string;
  nodeId: string;
  label: string;
  type: 'tts' | 'bgm' | 'sfx';
  url?: string;
  status: 'ready' | 'pending';
}

interface ImageAsset {
  id: string;
  nodeId: string;
  label: string;
  url: string;
}

export function ExportPanel({ onClose }: ExportPanelProps) {
  const { nodes, edges } = useWorkflowStore();
  const [config, setConfig] = useState<ExportConfig>({
    includeAudio: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'image' | 'summary'>('summary');

  // ========== 收集全流程产物 ==========

  // 1) 视频片段（按拓扑顺序收集）
  const videoSegments: VideoSegment[] = [];

  // 拓扑排序以获得正确顺序
  const nodeOrder = new Map<string, number>();
  const visited = new Set<string>();
  let order = 0;
  const topoVisit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    edges.filter(e => e.target === nodeId).forEach(e => topoVisit(e.source));
    nodeOrder.set(nodeId, order++);
  };
  nodes.forEach(n => topoVisit(n.id));

  const sortedVideoNodes = nodes
    .filter((n) => n.type === 'video')
    .sort((a, b) => (nodeOrder.get(a.id) || 0) - (nodeOrder.get(b.id) || 0));

  sortedVideoNodes.forEach((n, i) => {
    const nd = n.data as Record<string, unknown>;
    const subType = (nd.videoSubType as string) || 'txt2vid';
    const subLabel = subType === 'concat' ? ' [拼接]' : subType === 'style-transfer' ? ' [转绘]' : subType === 'img2vid' ? ' [首帧]' : '';
    videoSegments.push({
      id: n.id,
      nodeId: n.id,
      label: (nd.label as string) || `视频片段 ${i + 1}${subLabel}`,
      duration: (nd.duration as number) || 5,
      order: videoSegments.length,
      // 就绪状态以存在可下载 URL 为准。
      // 会让就绪数量虚高，用户点导出才发现什么都没有。
      status: (nd.videoUrl || (Array.isArray(nd.videoClips) && nd.videoClips.length > 0))
        ? 'ready' as const
        : 'pending' as const,
    });
  });

  // 脚本节点中分镜生成的视频
  nodes.filter((n) => n.type === 'script').forEach((n) => {
    const nd = n.data as Record<string, unknown>;
    const scenes = (nd.scenes as Array<Record<string, unknown>>) || [];
    scenes.forEach((scene) => {
      if (scene.generatedVideoUrl) {
        videoSegments.push({
          id: `${n.id}-scene-${scene.sceneNumber || 0}`,
          nodeId: n.id,
          label: `${(nd.label as string) || '脚本'} - 场景 ${scene.sceneNumber || '?'}`,
          duration: (scene.durationSeconds as number) || 5,
          order: videoSegments.length,
          status: 'ready',
        });
      }
    });
  });

  // 2) 音频轨
  const audioTracks: AudioTrack[] = [];
  nodes.filter((n) => n.type === 'audio').forEach((n, i) => {
    const nd = n.data as Record<string, unknown>;
    const subType = (nd.audioSubType as string) || 'tts';
    const url = (nd.audioUrl as string) || (nd.uploadedAudioUrl as string);
    audioTracks.push({
      id: n.id,
      nodeId: n.id,
      label: (nd.label as string) || `音频 ${i + 1}`,
      type: subType as 'tts' | 'bgm' | 'sfx',
      url: url || undefined,
      status: url ? 'ready' : 'pending',
    });
  });

  // 3) 图片资源
  const imageAssets: ImageAsset[] = [];
  nodes.filter((n) => n.type === 'image').forEach((n, i) => {
    const nd = n.data as Record<string, unknown>;
    const url = (nd.imageUrl as string) || (nd.uploadedImageUrl as string);
    if (url) {
      imageAssets.push({
        id: n.id,
        nodeId: n.id,
        label: (nd.label as string) || `图片 ${i + 1}`,
        url,
      });
    }
  });
  // 脚本节点的分镜图
  nodes.filter((n) => n.type === 'script').forEach((n) => {
    const nd = n.data as Record<string, unknown>;
    const scenes = (nd.scenes as Array<Record<string, unknown>>) || [];
    scenes.forEach((scene) => {
      if (scene.generatedImageUrl) {
        imageAssets.push({
          id: `${n.id}-img-${scene.sceneNumber || 0}`,
          nodeId: n.id,
          label: `分镜 ${scene.sceneNumber || '?'}`,
          url: scene.generatedImageUrl as string,
        });
      }
    });
  });

  const totalDuration = videoSegments.reduce((sum, s) => sum + s.duration, 0);
  const readyVideos = videoSegments.filter(s => s.status === 'ready').length;
  const readyAudios = audioTracks.filter(a => a.status === 'ready').length;

  /** 下载单个文件。浏览器 <a download> 兜底不保证成功，因此如实返回成败。 */
  const safeDownload = async (url: string, filename: string): Promise<boolean> => {
    try {
      let blob: Blob;
      const isLocal = url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/');
      if (isLocal) {
        const resp = await fetch(url);
        if (!resp.ok) return false;
        blob = await resp.blob();
      } else {
        // 远端产物 URL 常有防盗链与 CORS 限制：登记域名后走服务端代理
        const { registerServiceHosts } = await import('@/lib/session');
        await registerServiceHosts([url]);
        const resp = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetUrl: url, method: 'GET' }),
        });
        if (!resp.ok) return false;
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await resp.json() as { data_uri?: string };
          if (!data.data_uri) return false;
          const inner = await fetch(data.data_uri);
          if (!inner.ok) return false;
          blob = await inner.blob();
        } else {
          blob = await resp.blob();
        }
      }
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      return true;
    } catch {
      return false;
    }
  };

  /** 从真实 URL 推断扩展名；平台不转码，不能给用户改后缀的错觉 */
  function guessExtension(url: string, fallback: string): string {
    try {
      const pathname = new URL(url, window.location.href).pathname;
      const match = pathname.match(/\.([A-Za-z0-9]{2,5})$/);
      if (match) return match[1].toLowerCase();
    } catch { /* 忽略无法解析的地址 */ }
    return fallback;
  }

  /** 收集所有可用视频 URL */
  const collectVideoUrls = () => {
    const urls: { url: string; label: string }[] = [];
    sortedVideoNodes.forEach((n, i) => {
      const nd = n.data as Record<string, unknown>;
      const baseLabel = (nd.label as string) || `视频片段_${i + 1}`;

      // 拼接节点：videoUrl 只保存了第一个片段，必须读取 videoClips 才能导出全部片段，
      // 否则第 2 个及以后的片段会永久丢失。
      const clips = nd.videoClips as string[] | undefined;
      if (Array.isArray(clips) && clips.length > 0) {
        clips.forEach((clipUrl, ci) => {
          if (clipUrl) urls.push({ url: clipUrl, label: `${baseLabel}_片段${ci + 1}` });
        });
        return;
      }

      const url = nd.videoUrl as string;
      if (url) urls.push({ url, label: baseLabel });
    });
    nodes.filter((n) => n.type === 'script').forEach((n) => {
      const nd = n.data as Record<string, unknown>;
      const scenes = (nd.scenes as Array<Record<string, unknown>>) || [];
      scenes.forEach((scene) => {
        const url = scene.generatedVideoUrl as string;
        if (url) urls.push({ url, label: `${(nd.label as string) || '脚本'}_场景${scene.sceneNumber || ''}` });
      });
    });
    return urls;
  };

  /** 收集音频 URL */
  const collectAudioUrls = () => {
    return audioTracks.filter(a => a.url).map(a => ({ url: a.url!, label: a.label }));
  };

  /** 收集图片 URL */
  const collectImageUrls = () => {
    return imageAssets.map(a => ({ url: a.url, label: a.label }));
  };

  const handleExport = async () => {
    const videoUrls = collectVideoUrls();
    const audioUrls = config.includeAudio ? collectAudioUrls() : [];
    const allUrls = [...videoUrls, ...audioUrls];

    if (allUrls.length === 0) {
      toast.error('未找到已生成的素材文件，请先执行工作流');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStage('正在准备下载...');

    let done = 0;
    let failed = 0;
    for (const item of allUrls) {
      const isVideo = videoUrls.some((v) => v.url === item.url);
      const ext = guessExtension(item.url, isVideo ? 'mp4' : 'mp3');
      const ok = await safeDownload(item.url, `${item.label}_${Date.now()}.${ext}`);
      if (ok) done++; else failed++;
      setExportProgress(Math.round(((done + failed) / allUrls.length) * 100));
      setExportStage(`已处理 ${done + failed}/${allUrls.length} 个文件`);
      await new Promise((r) => setTimeout(r, 300));
    }

    setExportStage(failed > 0 ? `完成，${failed} 个文件下载失败` : '下载完成');
    if (failed > 0) toast.error(`${failed} 个文件下载失败，可尝试在素材预览中单独保存`);
    else toast.success(`已下载 ${done} 个文件`);
    setIsExporting(false);
  };

  const handleExportImages = async () => {
    const imageUrls = collectImageUrls();
    if (imageUrls.length === 0) {
      toast.error('未找到已生成的图片');
      return;
    }
    let done = 0;
    for (const img of imageUrls) {
      if (await safeDownload(img.url, `${img.label}_${Date.now()}.png`)) done += 1;
      await new Promise(r => setTimeout(r, 300));
    }
    const failed = imageUrls.length - done;
    if (failed > 0) toast.error(`${failed} 张图片下载失败，${done} 张已保存`);
    else toast.success(`已下载 ${imageUrls.length} 张图片`);
  };

  return (
    <div className="absolute top-2 right-2 w-[340px] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[calc(100vh-180px)] animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">工作流导出</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border/30 px-2">
        {([
          { key: 'summary', label: '总览', icon: <Layers className="w-3 h-3" /> },
          { key: 'video', label: `视频 (${videoSegments.length})`, icon: <Video className="w-3 h-3" /> },
          { key: 'audio', label: `音频 (${audioTracks.length})`, icon: <Music className="w-3 h-3" /> },
          { key: 'image', label: `图片 (${imageAssets.length})`, icon: <ImageIcon className="w-3 h-3" /> },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">

          {/* ===== SUMMARY TAB ===== */}
          {activeTab === 'summary' && (
            <>
              {/* Pipeline Overview */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Video className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-muted-foreground">视频片段</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{readyVideos}<span className="text-xs text-muted-foreground">/{videoSegments.length}</span></p>
                  <p className="text-[11px] text-muted-foreground">{totalDuration}s 总时长</p>
                </div>
                <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Music className="w-3 h-3 text-pink-400" />
                    <span className="text-[10px] text-muted-foreground">音频轨</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{readyAudios}<span className="text-xs text-muted-foreground">/{audioTracks.length}</span></p>
                  <p className="text-[11px] text-muted-foreground">
                    {audioTracks.filter(a => a.type === 'tts').length} TTS · {audioTracks.filter(a => a.type === 'bgm').length} BGM
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-500/10 border border-slate-500/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ImageIcon className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] text-muted-foreground">图片素材</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{imageAssets.length}</p>
                  <p className="text-[11px] text-muted-foreground">含分镜图</p>
                </div>
                <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] text-muted-foreground">总节点</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{nodes.length}</p>
                  <p className="text-[11px] text-muted-foreground">{edges.length} 条连线</p>
                </div>
              </div>

              {/* Pipeline status */}
              {videoSegments.length === 0 && audioTracks.length === 0 && imageAssets.length === 0 && (
                <div className="p-4 text-center rounded-lg bg-accent/10 border border-border/30">
                  <Layers className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">工作流尚未生成任何产物</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">请先执行工作流（点击顶部 ▶ 按钮）</p>
                </div>
              )}

              {readyVideos > 0 && (
                <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15">
                  <p className="text-[10px] text-muted-foreground mb-1">导出说明</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    当前为纯前端架构，导出时将逐个下载视频和音频文件。如需合并拼接，请使用剪映等本地工具导入下载的素材文件进行最终合成。
                  </p>
                </div>
              )}
            </>
          )}

          {/* ===== VIDEO TAB ===== */}
          {activeTab === 'video' && (
            <>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">视频片段（按工作流顺序）</Label>
                <span className="text-[10px] text-muted-foreground">{readyVideos} 就绪 · {totalDuration}s</span>
              </div>
              {videoSegments.length === 0 ? (
                <div className="p-4 text-center rounded-lg bg-accent/10 border border-border/30">
                  <Video className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">暂无视频片段</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {videoSegments.map((seg, idx) => (
                    <div key={seg.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-accent/20 border border-border/20">
                      
                      <Badge variant="outline" className="text-[11px] h-4 w-5 justify-center flex-shrink-0">{idx + 1}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{seg.label}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{seg.duration}s</span>
                      {seg.status === 'ready' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ===== AUDIO TAB ===== */}
          {activeTab === 'audio' && (
            <>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">音频轨</Label>
                <span className="text-[10px] text-muted-foreground">{readyAudios} 就绪</span>
              </div>
              {audioTracks.length === 0 ? (
                <div className="p-4 text-center rounded-lg bg-accent/10 border border-border/30">
                  <Music className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">暂无音频轨</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">添加音频节点生成旁白、BGM 或音效</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {audioTracks.map((track) => (
                    <div key={track.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-accent/20 border border-border/20">
                      <Music className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{track.label}</p>
                        <p className="text-[11px] text-muted-foreground uppercase">{track.type}</p>
                      </div>
                      {track.status === 'ready' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ===== IMAGE TAB ===== */}
          {activeTab === 'image' && (
            <>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">生成的图片</Label>
                <span className="text-[10px] text-muted-foreground">{imageAssets.length} 张</span>
              </div>
              {imageAssets.length === 0 ? (
                <div className="p-4 text-center rounded-lg bg-accent/10 border border-border/30">
                  <ImageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">暂无图片</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {imageAssets.map((img) => (
                      <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-border/20 group">
                        <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <p className="text-[11px] text-white text-center px-1">{img.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={handleExportImages}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    下载全部图片 ({imageAssets.length})
                  </Button>
                </>
              )}
            </>
          )}

          {/* 导出范围：只保留真正生效的选项 */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground font-medium">下载范围</Label>
            </div>
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/25">
              <Info className="w-3 h-3 text-amber-700 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-900 dark:text-amber-100 leading-relaxed">
                下载的是 AI 生成的原始文件，按真实地址推断扩展名。平台不合成视频、不转码；
                需要统一规格或合并片段，请使用本地剪辑工具。
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">包含音频文件</Label>
              <Select value={config.includeAudio ? 'yes' : 'no'} onValueChange={(v) => setConfig({ ...config, includeAudio: v === 'yes' })}>
                <SelectTrigger className="h-8 text-xs bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">视频与音频</SelectItem>
                  <SelectItem value="no">仅视频</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export progress */}
          {isExporting && (
            <div className="p-3 rounded-lg bg-muted/50 border border-indigo-500/15 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">下载中...</span>
                <span className="text-[10px] text-muted-foreground">{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">{exportStage}</p>
            </div>
          )}

          {/* Export button */}
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleExport}
            disabled={isExporting || (videoSegments.length === 0 && audioTracks.length === 0)}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <FileVideo className="w-4 h-4 mr-1.5" />
            )}
            {isExporting ? '导出中...' : `批量下载素材 (${collectVideoUrls().length + (config.includeAudio ? collectAudioUrls().length : 0)} 个文件)`}
          </Button>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">
              (原始文件)
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
