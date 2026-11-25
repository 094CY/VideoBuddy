import { EntityCard } from '@/components/ui/entity-card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useArtifactStore, type ArtifactItem } from '@/stores/artifact-store';
import { confirmAction } from '@/components/shared/confirm-store';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAssetStore, readFileAsText } from '@/stores/asset-store';
import { persistUploadedFile } from '@/lib/asset-upload';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';
import type { Project } from '@/types';
import { SearchField } from '@/components/ui/search-field';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Upload,
  ImageIcon,
  Video,
  Music,
  FileText,
  Trash2,
  Grid3X3,
  List,
  Loader2,
  Eye,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Copy,
  Plus,
  Sparkles,
  Film,
  Type,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── 库模式：素材 vs 产物 ───
type LibMode = 'assets' | 'artifacts';

const typeFilters = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'text', label: '文本' },
];

const typeIcons: Record<string, React.ReactNode> = {
  image: <ImageIcon className="w-4 h-4 text-blue-400" />,
  video: <Video className="w-4 h-4 text-amber-400" />,
  audio: <Music className="w-4 h-4 text-purple-400" />,
  text: <FileText className="w-4 h-4 text-muted-foreground" />,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getAssetType(mimeType: string): 'image' | 'video' | 'audio' | 'text' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'text';
}

// ─── 产物 icon mapping ───
const artifactTypeIcon: Record<string, React.ReactNode> = {
  image: <ImageIcon className="w-3.5 h-3.5 text-blue-400" />,
  video: <Film className="w-3.5 h-3.5 text-amber-400" />,
  audio: <Music className="w-3.5 h-3.5 text-purple-400" />,
  text: <Type className="w-3.5 h-3.5 text-green-400" />,
};

// ─── 产物角标颜色 ───
const artifactTypeBadge: Record<string, string> = {
  image: 'bg-blue-50 text-blue-500 dark:bg-blue-950 dark:text-blue-400',
  video: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  audio: 'bg-purple-50 text-purple-500 dark:bg-purple-950 dark:text-purple-400',
  text: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
};

/**
 * 从所有项目的工作流里汇总 AI 已生成的成果。
 * 产物由各项目的工作流节点实时汇总。
 * 这里把各项目节点的真实产出聚合成产物列表，让 Tab 具备实际价值。
 */
function collectArtifactsFromProjects(projects: Project[]): ArtifactItem[] {
  const items: ArtifactItem[] = [];
  projects.forEach((p) => {
    const wf = p.workflowData as { nodes?: Array<Record<string, unknown>> } | undefined;
    const nodes = wf?.nodes;
    if (!Array.isArray(nodes)) return;

    nodes.forEach((n, idx) => {
      const d = (n.data || {}) as Record<string, unknown>;
      const nodeType = (n.type as string) || '';
      const label = (d.label as string) || `节点 ${idx + 1}`;
      const createdAt = (d.completedAt as string) || p.updatedAt || p.createdAt;

      const push = (url: unknown, type: ArtifactItem['type'], name: string) => {
        if (typeof url === 'string' && url) {
          items.push({
            id: `${p.id}-${n.id}-${type}`,
            type,
            name,
            fileUrl: url,
            sourceProject: p.name,
            createdAt,
          });
        }
      };

      if (nodeType === 'image') push(d.imageUrl, 'image', label);
      if (nodeType === 'video') push(d.videoUrl, 'video', label);
      if (nodeType === 'audio') push(d.audioUrl || d.uploadedAudioUrl, 'audio', label);
      if (nodeType === 'text' && typeof d.outputText === 'string' && d.outputText) {
        items.push({
          id: `${p.id}-${n.id}-text`,
          type: 'text',
          name: label,
          content: d.outputText,
          sourceProject: p.name,
          createdAt,
        });
      }

      // 脚本节点的分镜产物
      if (nodeType === 'script' && Array.isArray(d.scenes)) {
        (d.scenes as Array<Record<string, unknown>>).forEach((scene) => {
          const num = scene.sceneNumber ?? '?';
          if (typeof scene.generatedImageUrl === 'string' && scene.generatedImageUrl) {
            items.push({
              id: `${p.id}-${n.id}-scene-${num}-img`,
              type: 'image',
              name: `${label} 场景${num} 分镜图`,
              fileUrl: scene.generatedImageUrl,
              sourceProject: p.name,
              createdAt,
            });
          }
          if (typeof scene.generatedVideoUrl === 'string' && scene.generatedVideoUrl) {
            items.push({
              id: `${p.id}-${n.id}-scene-${num}-vid`,
              type: 'video',
              name: `${label} 场景${num} 分镜视频`,
              fileUrl: scene.generatedVideoUrl,
              sourceProject: p.name,
              createdAt,
            });
          }
        });
      }
    });
  });
  return items;
}

// ─── 产物面板组件 ───
function ArtifactsPanel() {
  const manualArtifacts = useArtifactStore((st) => st.items);
  const removeArtifact = useArtifactStore((st) => st.remove);
  const projects = useProjectStore((s) => s.projects);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const ownProjects = useMemo(
    () => projects.filter((p) => !p.ownerId || p.ownerId === currentUserId),
    [projects, currentUserId]
  );

  // 自动汇总的产物 + 用户手动保存的产物（只汇总本项目账号的项目）
  const artifacts = useMemo<ArtifactItem[]>(
    () => [...collectArtifactsFromProjects(ownProjects), ...manualArtifacts],
    [ownProjects, manualArtifacts]
  );

  const [activeType, setActiveType] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewItem, setPreviewItem] = useState<ArtifactItem | null>(null);
  const [textContent, setTextContent] = useState('');

  const filtered = artifacts.filter(a => {
    const matchType = activeType === 'all' || a.type === activeType;
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const deleteArtifact = useCallback((id: string) => {
    // 自动汇总的产物来自项目工作流节点，不是独立记录，无法在这里删除
    if (!manualArtifacts.some((a) => a.id === id)) {
      toast.info('该产物由项目工作流自动汇总，请在画布中清空对应节点的结果');
      return;
    }
    removeArtifact(id);
    toast.success('已从产物库移除');
  }, [manualArtifacts, removeArtifact]);

  useEffect(() => {
    if (previewItem?.type === 'text') {
      setTextContent(previewItem.content || '（无内容）');
    }
  }, [previewItem]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-6 pb-12">

        {/* 标题行（左侧导航已有名称，只保留统计和操作） */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-[12px] text-muted-foreground">
            {artifacts.length} 个产物 · 来自所有项目的执行结果
          </p>
          <div className="flex items-center gap-2">
            <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-muted/60 gap-1.5">
              <Sparkles className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">自动汇总各项目成果</span>
            </div>
          </div>
        </div>

        {/* 筛选 + 视图切换 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            {typeFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveType(f.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                  activeType === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <SearchField value={search} onValueChange={setSearch} placeholder="搜索..." size="sm" className="w-40" />
            <div className="flex items-center p-0.5 rounded-lg bg-muted gap-0.5">
              <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition-all ${viewMode === 'grid' ? 'bg-card shadow-sm text-muted-foreground' : 'text-muted-foreground'}`}>
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition-all ${viewMode === 'list' ? 'bg-card shadow-sm text-muted-foreground' : 'text-muted-foreground'}`}>
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 内容区 */}
        {filtered.length === 0 ? (
          <Empty className="w-full rounded-xl border border-dashed border-border/60 py-14 mt-4 gap-0">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="mb-2"><Sparkles className="w-5 h-5" /></EmptyMedia>
              <EmptyTitle className="text-[14px]">暂无产物</EmptyTitle>
              <EmptyDescription className="text-[12px]">
                在工作流中执行节点生成图片 / 视频 / 音频后，成果会自动汇总到这里
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((item) => (
              <EntityCard
                key={item.id}
                className="p-0 overflow-hidden"
                onClick={() => setPreviewItem(item)}
              >
                <div className="aspect-square flex items-center justify-center relative overflow-hidden">
                  {item.type === 'image' && item.fileUrl ? (
                    <img src={item.fileUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type === 'video' && item.fileUrl ? (
                    <video src={item.fileUrl} className="w-full h-full object-cover" muted />
                  ) : item.type === 'text' ? (
                    <div className="p-2 w-full h-full overflow-hidden flex flex-col bg-muted/40">
                      <Type className="w-4 h-4 text-muted-foreground mb-1" />
                      <p className="text-[11px] leading-snug text-muted-foreground line-clamp-4">{item.content?.slice(0, 120) || item.name}</p>
                    </div>
                  ) : item.type === 'audio' ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full bg-muted/40">
                      <Music className="w-6 h-6 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">{typeIcons[item.type]}</div>
                  )}
                  {/* 类型角标 */}
                  <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${artifactTypeBadge[item.type]}`}>
                    {item.type === 'image' ? '图片' : item.type === 'video' ? '视频' : item.type === 'audio' ? '音频' : '文案'}
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white/80" />
                  </div>
                  <button
                    className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 items-center justify-center text-white/70 hover:text-red-300 transition hidden group-hover:flex"
                    onClick={(e) => { e.stopPropagation(); deleteArtifact(item.id); }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[12px] font-medium truncate text-muted-foreground">{item.name}</p>
                  {item.sourceProject && (
                    <p className="text-[11px] text-muted-foreground truncate">来自: {item.sourceProject}</p>
                  )}
                </div>
              </EntityCard>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition cursor-pointer"
                onClick={() => setPreviewItem(item)}
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {item.type === 'image' && item.fileUrl
                    ? <img src={item.fileUrl} alt="" className="w-full h-full object-cover" />
                    : artifactTypeIcon[item.type]
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate text-muted-foreground">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.type === 'image' ? '图片' : item.type === 'video' ? '视频' : item.type === 'audio' ? '音频' : '文案'}
                    {item.sourceProject && ` · ${item.sourceProject}`}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</span>
                <button
                  className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-400 transition"
                  onClick={(e) => { e.stopPropagation(); deleteArtifact(item.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) { setPreviewItem(null); setTextContent(''); } }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-card border-border/60 gap-0 rounded-2xl">
          {previewItem && (
            <div className="flex flex-col">
              <div className="relative flex items-center justify-center min-h-[200px] max-h-[60vh] bg-muted/40 overflow-hidden rounded-t-2xl">
                {previewItem.type === 'text' ? (
                  <div className="flex flex-col w-full h-full min-h-[200px]">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <Type className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-[12px] text-muted-foreground">{previewItem.name}</span>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(textContent).then(() => toast.success('已复制'))}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground bg-muted hover:bg-accent transition"
                      >
                        <Copy className="w-3 h-3" /> 复制
                      </button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto max-h-[50vh]">
                      <pre className="text-[12px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">{textContent}</pre>
                    </div>
                  </div>
                ) : previewItem.type === 'image' && previewItem.fileUrl ? (
                  <img src={previewItem.fileUrl} alt={previewItem.name} className="max-w-full max-h-[60vh] object-contain" />
                ) : previewItem.type === 'audio' ? (
                  <div className="flex flex-col items-center gap-3 py-12 w-full px-8">
                    <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                      <Music className="w-7 h-7 text-purple-400" />
                    </div>
                    <p className="text-[13px] font-medium text-muted-foreground">{previewItem.name}</p>
                    {previewItem.fileUrl && <audio src={previewItem.fileUrl} controls className="w-full max-w-sm h-8" />}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground py-16">
                    {artifactTypeIcon[previewItem.type]}
                    <p className="text-xs">暂无预览</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {artifactTypeIcon[previewItem.type]}
                  <div>
                    <p className="text-[13px] font-medium text-muted-foreground">{previewItem.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {previewItem.sourceProject && `来自：${previewItem.sourceProject} · `}{formatDate(previewItem.createdAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { deleteArtifact(previewItem.id); setPreviewItem(null); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 主导出组件 ───
export function AssetsPage() {
  const { assets, addAsset, deleteAsset } = useAssetStore();
  const currentUserId = useAuthStore((s) => s.user?.id || 'anonymous');
  const [libMode, setLibMode] = useState<LibMode>('assets');
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewAsset, setPreviewAsset] = useState<typeof assets[0] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [textContent, setTextContent] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredAssets = assets.filter((a) => {
    // 每个账号只看自己上传的参考素材
    const matchesOwner = !a.userId || a.userId === currentUserId;
    const matchesType = activeType === 'all' || a.type === activeType;
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    return matchesOwner && matchesType && matchesSearch;
  });

  useEffect(() => {
    if (previewAsset?.type === 'text') {
      if (previewAsset.textContent) {
        setTextContent(previewAsset.textContent);
      } else if (previewAsset.fileUrl) {
        if (previewAsset.fileUrl.startsWith('data:')) {
          try { setTextContent(atob(previewAsset.fileUrl.split(',')[1])); }
          catch { setTextContent('（无法解析文本内容）'); }
        } else {
          fetch(previewAsset.fileUrl).then(r => r.text()).then(setTextContent)
            .catch(() => setTextContent('（无法读取文件内容）'));
        }
      }
    }
  }, [previewAsset]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;
    let oversizedCount = 0;
    for (const file of fileArray) {
      try {
        const assetType = getAssetType(file.type);
        let textContentStr: string | undefined;
        if (assetType === 'text') textContentStr = await readFileAsText(file);
        const stored = await persistUploadedFile(file);
        const fileUrl = stored.url;
        if (!stored.persistent) oversizedCount++;
        addAsset({ userId: currentUserId, type: assetType, name: file.name, fileUrl, fileSize: file.size, mimeType: file.type, textContent: textContentStr });
        successCount++;
      } catch {
        toast.error(`上传 ${file.name} 失败`);
      }
    }
    setUploading(false);
    if (successCount > 0) {
      toast.success(`成功上传 ${successCount} 个文件`);
    }
    if (oversizedCount > 0) {
      toast.warning(
        `有 ${oversizedCount} 个文件未能保存到服务端，仅本次会话可用，请重新上传`,
        { duration: 6000 }
      );
    }
  }, [addAsset, currentUserId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleCopyContent = useCallback(() => {
    if (textContent) navigator.clipboard.writeText(textContent).then(() => toast.success('已复制到剪贴板'));
  }, [textContent]);

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden bg-background transition-colors ${dragActive ? 'ring-2 ring-inset ring-blue-400/30' : ''}`}
      onDragOver={libMode === 'assets' ? handleDragOver : undefined}
      onDragLeave={libMode === 'assets' ? handleDragLeave : undefined}
      onDrop={libMode === 'assets' ? handleDrop : undefined}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.txt,.md,.json,.csv,.srt,.ass,.vtt"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 全局拖拽遮罩 */}
      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/5 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-500">
            <Upload className="w-10 h-10" />
            <p className="text-[14px] font-medium">松开以上传</p>
          </div>
        </div>
      )}

      {/* ─── 顶部：胶囊模式切换 + 操作按钮（左侧导航已有名称） ─── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-shrink-0">
        <div className="flex items-center p-0.5 rounded-full bg-muted gap-0.5">
          <button
            onClick={() => setLibMode('assets')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              libMode === 'assets'
                ? 'bg-card text-muted-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="w-3 h-3" />
            素材
          </button>
          <button
            onClick={() => setLibMode('artifacts')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              libMode === 'artifacts'
                ? 'bg-card text-muted-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            产物
          </button>
        </div>

      </div>

      {/* ─── 素材 / 产物 内容区 ─── */}
      {libMode === 'artifacts' ? (
        <ArtifactsPanel />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-6 pb-12">
            {/* 描述 */}

            {/* 筛选 + 视图切换 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                {typeFilters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveType(f.id)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                      activeType === f.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <SearchField value={search} onValueChange={setSearch} placeholder="搜索..." size="sm" className="w-40" />
                <div className="flex items-center p-0.5 rounded-lg bg-muted gap-0.5">
                  <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition-all ${viewMode === 'grid' ? 'bg-card shadow-sm text-muted-foreground' : 'text-muted-foreground'}`}>
                    <Grid3X3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition-all ${viewMode === 'list' ? 'bg-card shadow-sm text-muted-foreground' : 'text-muted-foreground'}`}>
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 内容区 */}
            {filteredAssets.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="block w-full rounded-xl border border-dashed border-border/60 py-5 mt-4 cursor-pointer hover:bg-accent/40 transition-colors disabled:opacity-50"
              >
                <Empty className="border-0 p-0 md:p-0 gap-0 pointer-events-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="mb-2">
                      {uploading
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Upload className="w-5 h-5" />}
                    </EmptyMedia>
                    <EmptyTitle className="text-[14px]">
                      {uploading ? '正在上传…' : '点击选择文件，或拖拽到此处上传'}
                    </EmptyTitle>
                    <EmptyDescription className="text-[12px]">
                      图片 · 视频 · 音频 · 文本
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </button>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl bg-muted/50 flex flex-col items-center justify-center cursor-pointer hover:bg-accent transition-colors"
                >
                  <Plus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground mt-1">上传</span>
                </div>
                {filteredAssets.map((asset) => (
                  <EntityCard
                    key={asset.id}
                    className="p-0 overflow-hidden"
                    onClick={() => setPreviewAsset(asset)}
                  >
                    <div className="aspect-square flex items-center justify-center relative overflow-hidden">
                      {asset.type === 'image' && asset.fileUrl ? (
                        <img src={asset.fileUrl} alt={asset.name} className="w-full h-full object-cover" />
                      ) : asset.type === 'video' && asset.fileUrl ? (
                        <video src={asset.fileUrl} className="w-full h-full object-cover" muted />
                      ) : asset.type === 'text' ? (
                        <div className="p-2 w-full h-full overflow-hidden flex flex-col">
                          <FileText className="w-4 h-4 text-muted-foreground mb-1" />
                          <p className="text-[11px] leading-snug text-muted-foreground line-clamp-4">
                            {asset.textContent?.slice(0, 120) || asset.name}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">{typeIcons[asset.type]}</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-4 h-4 text-white/80" />
                      </div>
                      <button
                        className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 items-center justify-center text-white/70 hover:text-red-300 transition hidden group-hover:flex"
                        onClick={async (e) => { e.stopPropagation(); const ok = await confirmAction({ title: '删除该素材？', description: '删除后不可恢复。', confirmText: '删除', destructive: true }); if (!ok) return; deleteAsset(asset.id); toast.success('已删除'); }}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-[12px] font-medium truncate text-muted-foreground">{asset.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(asset.fileSize || 0)}</p>
                    </div>
                  </EntityCard>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-[12px] text-muted-foreground hover:bg-accent/50 transition disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> 上传素材（也可拖拽文件到此页面）
                </button>
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition cursor-pointer"
                    onClick={() => setPreviewAsset(asset)}
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                      {asset.type === 'image' && asset.fileUrl
                        ? <img src={asset.fileUrl} alt="" className="w-full h-full object-cover" />
                        : typeIcons[asset.type]
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate text-muted-foreground">{asset.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(asset.fileSize || 0)} · {asset.type}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatDate(asset.createdAt)}</span>
                    <button
                      className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-400 transition"
                      onClick={async (e) => { e.stopPropagation(); const ok = await confirmAction({ title: '删除该素材？', description: '删除后不可恢复。', confirmText: '删除', destructive: true }); if (!ok) return; deleteAsset(asset.id); toast.success('已删除'); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 预览弹窗（素材） */}
      <Dialog open={!!previewAsset} onOpenChange={(open) => {
        if (!open) { setPreviewAsset(null); setIsPlaying(false); setIsMuted(false); setTextContent(''); }
      }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-card border-border/60 gap-0 rounded-2xl">
          {previewAsset && (
            <div className="flex flex-col">
              <div className="relative flex items-center justify-center min-h-[240px] max-h-[60vh] bg-muted/40 overflow-hidden rounded-t-2xl">
                {previewAsset.type === 'image' ? (
                  previewAsset.fileUrl
                    ? <img src={previewAsset.fileUrl} alt={previewAsset.name} className="max-w-full max-h-[60vh] object-contain" />
                    : <div className="flex flex-col items-center gap-2 text-muted-foreground"><ImageIcon className="w-10 h-10" /><p className="text-xs">无法加载预览</p></div>
                ) : previewAsset.type === 'video' ? (
                  previewAsset.fileUrl ? (
                    <div className="relative w-full">
                      <video ref={videoRef} src={previewAsset.fileUrl} className="w-full max-h-[60vh] object-contain" muted={isMuted}
                        onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                        <button className="h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
                          onClick={() => { if (videoRef.current) { if (isPlaying) videoRef.current.pause(); else void videoRef.current.play(); } }}>
                          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        <button className="h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
                          onClick={() => setIsMuted(!isMuted)}>
                          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  ) : <div className="flex flex-col items-center gap-2 text-muted-foreground"><Video className="w-10 h-10" /><p className="text-xs">无法加载预览</p></div>
                ) : previewAsset.type === 'audio' ? (
                  <div className="flex flex-col items-center gap-3 py-12 w-full px-8">
                    <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                      <Music className="w-7 h-7 text-purple-400" />
                    </div>
                    <p className="text-[13px] font-medium text-muted-foreground">{previewAsset.name}</p>
                    {previewAsset.fileUrl && <audio ref={audioRef} src={previewAsset.fileUrl} controls className="w-full max-w-sm h-8"
                      onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />}
                  </div>
                ) : (
                  <div className="flex flex-col w-full h-full min-h-[240px]">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">{previewAsset.name}</span>
                      </div>
                      <button onClick={handleCopyContent}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground bg-muted hover:bg-accent transition">
                        <Copy className="w-3 h-3" /> 复制
                      </button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto max-h-[50vh]">
                      <pre className="text-[12px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">{textContent || '正在加载...'}</pre>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {typeIcons[previewAsset.type]}
                  <div>
                    <p className="text-[13px] font-medium text-muted-foreground">{previewAsset.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatFileSize(previewAsset.fileSize || 0)} · {formatDate(previewAsset.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {previewAsset.fileUrl && (
                    <button
                      onClick={() => { const a = document.createElement('a'); a.href = previewAsset.fileUrl; a.download = previewAsset.name; a.click(); toast.success('开始下载'); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-accent transition"
                    >
                      <Download className="w-3.5 h-3.5" /> 下载
                    </button>
                  )}
                  <button
                    onClick={async () => { const ok = await confirmAction({ title: '删除该素材？', description: '删除后不可恢复。', confirmText: '删除', destructive: true }); if (!ok) return; deleteAsset(previewAsset.id); setPreviewAsset(null); toast.success('已删除'); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
