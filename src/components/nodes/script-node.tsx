import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, Loader2, CheckCircle, AlertCircle, ImageIcon, Video } from 'lucide-react';

export const ScriptNode = memo(function ScriptNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const status = d.status as string;
  const title = (d.title as string) || '';
  const scenes = (d.scenes as Array<Record<string, unknown>>) || [];

  // 统计已生成图片和视频的场景数
  const imgCount = scenes.filter(s => s.generatedImageUrl).length;
  const vidCount = scenes.filter(s => s.generatedVideoUrl).length;

  return (
    <div
      title={
        status === 'error' ? ((d.errorMessage as string) || '执行失败')
          : d.outputKind === 'plan' ? '此节点产出文字方案，不是音频 / 视频 / 图片文件'
          : undefined
      }
      className={`w-80 rounded-xl border border-border/50 bg-white dark:bg-[#1c1c1c] transition-all duration-150 ${
        selected
          ? 'border-violet-400/60 shadow-[0_0_0_2px_rgba(167,139,250,0.12)]'
          : 'hover:border-border/80 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30">
        <div className="w-4 h-4 rounded-md bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
          <FileText className="w-2.5 h-2.5 text-violet-500 dark:text-violet-400" />
        </div>
        <span className="text-[11px] font-medium flex-1 truncate text-muted-foreground">
          {(d.label as string) || '脚本节点'}
        </span>
        {/* 分镜生成进度指标 */}
        {scenes.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {imgCount > 0 && (
              <span className="flex items-center gap-0.5">
                <ImageIcon className="w-2.5 h-2.5 text-slate-500/60" />
                {imgCount}
              </span>
            )}
            {vidCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Video className="w-2.5 h-2.5 text-amber-400/60" />
                {vidCount}
              </span>
            )}
          </div>
        )}
        {d.outputKind === 'plan' && (
          <span className="text-[11px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground">方案</span>
        )}
        <StatusIcon status={status} />
      </div>

      <div className="px-2.5 py-2">
        {title && (
          <p className="text-[11px] font-medium mb-1.5 text-violet-300/80">{title}</p>
        )}

        {scenes.length > 0 ? (
          <>
            {/* 分镜图九宫格缩略 — 如果有任何生成的图片 */}
            {imgCount > 0 && (
              <div className="grid grid-cols-3 gap-0.5 mb-1.5 rounded overflow-hidden">
                {scenes.slice(0, 9).map((scene, i) => (
                  <div key={i} className="relative aspect-video bg-violet-500/5">
                    {(scene.generatedImageUrl as string) ? (
                      <img
                        src={scene.generatedImageUrl as string}
                        alt={`#${(scene.sceneNumber as number) || i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[7px] text-muted-foreground font-mono">
                          #{(scene.sceneNumber as number) || i + 1}
                        </span>
                      </div>
                    )}
                    {/* 已有视频标记 */}
                    {(scene.generatedVideoUrl as string) && (
                      <div className="absolute bottom-0 right-0 bg-slate-500/80 p-0.5 rounded-tl">
                        <Video className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {scenes.length > 9 && (
                  <div className="aspect-video bg-violet-500/10 flex items-center justify-center">
                    <span className="text-[8px] text-violet-400/50">+{scenes.length - 9}</span>
                  </div>
                )}
              </div>
            )}

            {/* 文字列表 — 无图片时显示，或者在九宫格下面显示简要 */}
            {imgCount === 0 && (
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {scenes.slice(0, 6).map((scene, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] p-1 rounded bg-violet-500/5"
                  >
                    <span className="text-violet-400/70 font-mono flex-shrink-0">
                      #{(scene.sceneNumber as number) || i + 1}
                    </span>
                    <span className="text-muted-foreground line-clamp-2">
                      {(scene.sceneDescription as string) || '未描述'}
                    </span>
                  </div>
                ))}
                {scenes.length > 6 && (
                  <p className="text-[11px] text-muted-foreground text-center py-0.5">
                    还有 {scenes.length - 6} 个场景...
                  </p>
                )}
              </div>
            )}

            {/* 场景总数和统计 */}
            <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-border/20">
              <span className="text-[11px] text-muted-foreground">
                {scenes.length} 个分镜
              </span>
              <span className="text-[11px] text-muted-foreground">
                总时长 {scenes.reduce((sum, s) => sum + ((s.durationSeconds as number) || 0), 0)}s
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-16 rounded bg-violet-500/5 border border-dashed border-violet-500/15 flex flex-col items-center justify-center">
            <FileText className="w-4 h-4 text-violet-500/25 mb-0.5" />
            <p className="text-[11px] text-muted-foreground">从文本生成分镜脚本</p>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-violet-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-400 !border-2 !border-white dark:!border-[#1c1c1c]" />
    </div>
  );
});

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-slate-500" />;
    case 'error':
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    default:
      return null;
  }
}
