import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Type, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export const TextNode = memo(function TextNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
  const content = (d.content as string) || '';

  return (
    <div
      title={
        status === 'error' ? ((d.errorMessage as string) || '执行失败')
          : d.outputKind === 'plan' ? '此节点产出文字方案，不是音频 / 视频 / 图片文件'
          : undefined
      }
      className={`w-56 rounded-xl border border-border/50 bg-card transition-all duration-150 ${
        selected
          ? 'border-indigo-400/60 shadow-[0_0_0_2px_rgba(99,102,241,0.15)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
          <Type className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {(d.label as string) || '文本节点'}
        </span>
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>
      <div className="px-2.5 py-2 min-h-[32px]">
        {content ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{content}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">双击编辑文本内容...</p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-indigo-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-indigo-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
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
