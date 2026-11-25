import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, Loader2, AlertCircle, Clock, Play, Square } from 'lucide-react';
import { getStatusLabel } from '@/lib/utils';

interface ExecutionPanelProps {
  onClose: () => void;
}

export function ExecutionPanel({ onClose }: ExecutionPanelProps) {
  const { executionTasks, isExecuting, nodes, cancelExecution, resumePendingTask } = useWorkflowStore();

  const pendingNodes = nodes.filter(
    (n) => (n.data as Record<string, unknown>)?.pendingTask,
  );
  const completedCount = executionTasks.filter((t) => t.status === 'completed').length;
  const failedCount = executionTasks.filter((t) => t.status === 'failed').length;
  const totalCount = executionTasks.length;
  // 失败节点也应计入「已处理」，否则只要有一个节点失败，进度条永远停在 100% 以下
  const settledCount = completedCount + failedCount;
  const progress = totalCount > 0 ? Math.round((settledCount / totalCount) * 100) : 0;

  return (
    <div className="absolute top-4 right-4 z-30 w-72 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          ) : (
            <Play className="w-4 h-4 text-slate-500" />
          )}
          <span className="text-sm font-medium">工作流执行</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Progress */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">执行进度</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {settledCount} / {totalCount} 节点已处理
          {failedCount > 0 && <span className="text-red-400"> · {failedCount} 个失败</span>}
        </p>
      </div>

      {/* Task list */}
      <div className="max-h-64 overflow-y-auto p-2">
        {pendingNodes.length > 0 && (
          <div className="space-y-1.5 pb-2 border-b border-border/40">
            <p className="text-[11px] text-muted-foreground">已提交、可查询结果的任务</p>
            {pendingNodes.map((n) => {
              const task = (n.data as Record<string, unknown>).pendingTask as { taskId: string };
              return (
                <button
                  key={n.id}
                  onClick={async () => {
                    const { toast } = await import('sonner');
                    try {
                      await resumePendingTask(n.id);
                      toast.success('任务结果已取回');
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : '查询失败');
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg border border-border/50 hover:bg-accent transition text-[11px]"
                >
                  <span className="font-medium">{(n.data as Record<string, unknown>).label as string}</span>
                  <span className="ml-2 text-muted-foreground">任务 {String(task.taskId).slice(0, 12)}…</span>
                  <span className="float-right text-muted-foreground">查询结果 →</span>
                </button>
              );
            })}
          </div>
        )}

        {executionTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">尚未执行任何任务</p>
        ) : (
          executionTasks.map((task) => {
            const node = nodes.find((n) => n.id === task.nodeId);
            const label = (node?.data as Record<string, unknown>)?.label as string || task.nodeId;
            return (
              <div
                key={task.id}
                className="px-2.5 py-1.5 rounded-lg hover:bg-accent/30 transition"
              >
                <div className="flex items-center gap-2">
                  <TaskStatusIcon status={task.status} />
                  <span className="text-xs flex-1 truncate">{label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {getStatusLabel(task.status)}
                  </span>
                </div>
                {/* 展示失败原因，否则用户只知道失败了却不知道为什么 */}
                {task.error && (
                  <p className="text-[10px] text-red-400 mt-1 pl-[22px] break-words leading-relaxed">
                    {task.error}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      {isExecuting && (
        <div className="px-4 py-3 border-t border-border/30">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8 text-red-400 border-red-500/20 hover:bg-red-500/10"
            onClick={cancelExecution}
          >
            <Square className="w-3 h-3 mr-1" /> 取消执行
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />;
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500/70 flex-shrink-0" />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
  }
}
