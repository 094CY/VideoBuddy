import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Music, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export const AudioNode = memo(function AudioNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
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
          ? 'border-pink-400/60 shadow-[0_0_0_2px_rgba(244,114,182,0.12)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-pink-50 dark:bg-pink-950 flex items-center justify-center">
          <Music className="w-2.5 h-2.5 text-pink-500 dark:text-pink-400" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {(d.label as string) || '音频节点'}
        </span>
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>
      <div className="px-2.5 py-2">
        <div className="w-full h-12 rounded-lg bg-pink-50/50 dark:bg-pink-950/30 border border-dashed border-pink-200 dark:border-pink-800/40 flex items-center justify-center">
          <div className="flex items-end gap-0.5">
            {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.3, 0.7, 0.5, 0.6, 0.9].map((h, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-pink-400/40 dark:bg-pink-500/40"
                style={{ height: `${h * 18}px` }}
              />
            ))}
          </div>
        </div>
        {prompt && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{prompt}</p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-pink-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-pink-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
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
