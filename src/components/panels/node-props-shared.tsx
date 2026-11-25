/**
 * 属性面板共享子组件。
 *
 * 图片与音频节点的上传控件。
 * 这几个组件与具体节点类型无关，被文本/图片/视频/音频多个区块复用，
 * 因此单独成文件，供各节点分区组件 import。
 */
import { useRef, useCallback, useState } from 'react';
import { useModelStore } from '@/stores/model-store';
import { useAssetStore } from '@/stores/asset-store';
import { useAuthStore } from '@/stores/auth-store';
import { persistUploadedFile } from '@/lib/asset-upload';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Type, Video, Music, FolderOpen, Check, Upload } from 'lucide-react';
import { toast } from 'sonner';

export function ModelSelector({
  type,
  currentProvider,
  currentModel,
  currentServiceId = '',
  onSelect,
}: {
  type: 'text' | 'image' | 'video' | 'audio';
  currentProvider: string;
  currentModel: string;
  currentServiceId?: string;
  onSelect: (protocolId: string, modelId: string, serviceId: string) => void;
}) {
  const models = useModelStore((s) => s.customModels).filter((m) => m.type === type);

  const makeValue = (protocolId: string, modelId: string, serviceId: string) =>
    `${protocolId}::${modelId}::${serviceId}`;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">AI 模型</Label>
      {models.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            还没有可用模型。请到「设置 → 模型 & Key」添加服务与模型 ID。
          </p>
        </div>
      ) : (
        <Select
          value={currentModel ? makeValue(currentProvider, currentModel, currentServiceId) : ''}
          onValueChange={(val) => {
            const [protocolId, modelId, serviceId] = val.split('::');
            onSelect(protocolId, modelId, serviceId);
          }}
        >
          <SelectTrigger className="h-8 text-sm bg-muted/50">
            <SelectValue placeholder="选择模型..." />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={makeValue(m.protocolId, m.id, m.serviceId)} value={makeValue(m.protocolId, m.id, m.serviceId)}>
                <span className="flex items-center gap-1.5">
                  {m.name}
                  <span className="text-[11px] text-muted-foreground">· {m.serviceName}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function ImageUploadZone({ onUpload }: { onUpload: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addAsset = useAssetStore((s) => s.addAsset);
  const currentUserId = useAuthStore((s) => s.user?.id || 'anonymous');

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const { url, persistent } = await persistUploadedFile(file);
    if (!persistent) toast.warning('素材保存失败，本次会话后需重新上传');
    addAsset({
      userId: currentUserId,
      type: 'image',
      name: file.name,
      fileUrl: url,
      fileSize: file.size,
      mimeType: file.type,
    });
    onUpload(url);
  }, [addAsset, onUpload, currentUserId]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <div
        className="border border-dashed border-border/50 rounded-lg p-3 text-center hover:bg-accent/20 transition cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-[10px] text-muted-foreground">拖拽或点击上传图片</p>
      </div>
    </>
  );
}

export function AudioUploadZone({ onUpload }: { onUpload: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addAsset = useAssetStore((s) => s.addAsset);
  const currentUserId = useAuthStore((s) => s.user?.id || 'anonymous');

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) return;
    const { url, persistent } = await persistUploadedFile(file);
    if (!persistent) toast.warning('素材保存失败，本次会话后需重新上传');
    addAsset({
      userId: currentUserId,
      type: 'audio',
      name: file.name,
      fileUrl: url,
      fileSize: file.size,
      mimeType: file.type,
    });
    onUpload(url);
  }, [addAsset, onUpload, currentUserId]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <div
        className="border border-dashed border-border/50 rounded-lg p-3 text-center hover:bg-accent/20 transition cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-[10px] text-muted-foreground">上传音频文件</p>
      </div>
    </>
  );
}

/** 素材选择器 — 从素材库选择已有素材 */
export function AssetPicker({
  type,
  onSelect,
}: {
  type: 'image' | 'video' | 'audio' | 'text';
  onSelect: (url: string, name: string, textContent?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const getAssetsByType = useAssetStore((s) => s.getAssetsByType);
  const assets = getAssetsByType(type);

  if (assets.length === 0 && !open) {
    return null; // 没有素材则不显示
  }

  const typeLabel: Record<string, string> = {
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本',
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition w-full"
        onClick={() => setOpen(!open)}
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span>从素材库选择{typeLabel[type]}</span>
        <span className="ml-auto text-[10px] opacity-60">{assets.length} 个</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-muted/50">
          {assets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              暂无{typeLabel[type]}素材，请先在素材库上传
            </p>
          ) : (
            assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/30 transition text-xs border-b border-border/20 last:border-0"
                onClick={() => {
                  onSelect(asset.fileUrl, asset.name, asset.textContent);
                  setOpen(false);
                  toast.success(`已使用素材: ${asset.name}`);
                }}
              >
                {type === 'image' && asset.fileUrl && (
                  <img
                    src={asset.fileUrl}
                    alt={asset.name}
                    className="w-8 h-8 rounded object-cover flex-shrink-0 bg-accent"
                  />
                )}
                {type !== 'image' && (
                  <div className="w-8 h-8 rounded bg-accent/50 flex items-center justify-center flex-shrink-0">
                    {type === 'video' && <Video className="w-3.5 h-3.5 text-amber-400" />}
                    {type === 'audio' && <Music className="w-3.5 h-3.5 text-pink-400" />}
                    {type === 'text' && <Type className="w-3.5 h-3.5 text-indigo-400" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-foreground">{asset.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {asset.fileSize ? `${(asset.fileSize / 1024).toFixed(0)} KB` : ''}
                  </p>
                </div>
                <Check className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** 各节点「执行」按钮的配色，按节点类型区分 */
export const nodeActionColors: Record<string, string> = {
  text: 'bg-indigo-600 hover:bg-indigo-700',
  image: 'bg-gray-700 hover:bg-gray-800',
  video: 'bg-amber-600 hover:bg-amber-700',
  audio: 'bg-pink-600 hover:bg-pink-700',
  script: 'bg-violet-600 hover:bg-violet-700',
  'ai-process': 'bg-cyan-600 hover:bg-cyan-700',
};

/** 各节点分区组件共用的入参 */
export interface NodePanelProps {
  data: Record<string, unknown>;
  update: (key: string, value: unknown) => void;
  status: string;
  upstream: { text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string };
  onGenerate: () => void;
}
