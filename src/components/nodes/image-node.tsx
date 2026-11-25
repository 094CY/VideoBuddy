import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ImageIcon, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export const ImageNode = memo(function ImageNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
  const imageUrl = d.imageUrl as string | undefined;
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
          ? 'border-slate-400/60 shadow-[0_0_0_2px_rgba(148,163,184,0.15)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          <ImageIcon className="w-2.5 h-2.5 text-slate-500" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {(d.label as string) || '图片节点'}
        </span>
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>
      <div className="px-2.5 py-2">
        {imageUrl ? (
          <div className="w-full h-28 rounded-lg overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full h-20 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-700/40 flex flex-col items-center justify-center">
            <ImageIcon className="w-4 h-4 text-slate-300 dark:text-slate-600 mb-0.5" />
            <p className="text-[11px] text-muted-foreground">
              {prompt ? '等待生成...' : '输入提示词生成图片'}
            </p>
          </div>
        )}
        {prompt && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{prompt}</p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
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
