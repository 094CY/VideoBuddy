import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const processTypeLabels: Record<string, string> = {
  'text-expand': '文案扩写',
  'script-generate': '剧本生成',
  'style-transfer': '风格转换',
  'storyboard-grid-9': '9 宫格分镜方案',
  'storyboard-grid-25': '25 宫格分镜方案',
  'story-extrapolate': '剧情推演',
  'custom-prompt': '自定义指令',
};

export const AIProcessNode = memo(function AIProcessNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
  const processType = (d.processType as string) || 'text-expand';
  const prompt = (d.prompt as string) || '';
  const outputText = (d.outputText as string) || '';

  return (
    <div
      title={
        status === 'error' ? ((d.errorMessage as string) || '执行失败')
          : d.outputKind === 'plan' ? '此节点产出文字方案，不是音频 / 视频 / 图片文件'
          : undefined
      }
      className={`w-56 rounded-xl border border-border/50 bg-white dark:bg-[#1c1c1c] transition-all duration-150 ${
        selected
          ? 'border-cyan-400/60 shadow-[0_0_0_2px_rgba(34,211,238,0.12)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-cyan-50 dark:bg-cyan-950 flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-cyan-500 dark:text-cyan-400" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {processTypeLabels[processType] || 'AI 处理'}
        </span>
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>
      <div className="px-2.5 py-2">
        {outputText ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{outputText}</p>
        ) : prompt ? (
          <p className="text-[11px] text-muted-foreground line-clamp-3 italic">{prompt}</p>
        ) : (
          <div className="w-full h-12 rounded-lg bg-cyan-50/50 dark:bg-cyan-950/30 border border-dashed border-cyan-200 dark:border-cyan-800/40 flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground">配置 AI 处理指令</p>
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-cyan-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-cyan-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
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
