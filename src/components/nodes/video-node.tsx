import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Video, Loader2, CheckCircle, AlertCircle, Play } from 'lucide-react';

export const VideoNode = memo(function VideoNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
  const videoUrl = d.videoUrl as string | undefined;
  const prompt = (d.prompt as string) || '';

  return (
    <div
      title={
        status === 'error' ? ((d.errorMessage as string) || '执行失败')
          : d.outputKind === 'plan' ? '此节点产出文字方案，不是音频 / 视频 / 图片文件'
          : undefined
      }
      className={`w-56 rounded-xl border border-border/50 bg-white dark:bg-[#1c1c1c] transition-all duration-150 ${
        selected
          ? 'border-amber-400/60 shadow-[0_0_0_2px_rgba(251,191,36,0.12)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
          <Video className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {(d.label as string) || '视频节点'}
        </span>
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>
      <div className="px-2.5 py-2">
        {videoUrl ? (
          <div className="w-full h-24 rounded-lg overflow-hidden relative">
            <video src={videoUrl} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="w-5 h-5 text-white" />
            </div>
          </div>
        ) : (
          <div className="w-full h-20 rounded-lg bg-amber-50/50 dark:bg-amber-950/30 border border-dashed border-amber-200 dark:border-amber-800/40 flex flex-col items-center justify-center">
            <Video className="w-4 h-4 text-amber-300 dark:text-amber-700 mb-0.5" />
            <p className="text-[11px] text-muted-foreground">
              {prompt ? '等待生成...' : '输入描述生成视频'}
            </p>
          </div>
        )}
        {prompt && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{prompt}</p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-amber-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-amber-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
    </div>
  );
});

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running': return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
    case 'completed': return <CheckCircle className="w-3 h-3 text-emerald-500/70" />;
    case 'error': return <AlertCircle className="w-3 h-3 text-red-400" />;
    default: return null;
  }
}
