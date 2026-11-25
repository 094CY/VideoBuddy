import { useParams, useSearchParams } from 'react-router-dom';
import { useProjectStore } from '@/stores/project-store';
import { AgentRunner } from '@/components/workspace/agent-runner';

const OUTPUT_TYPE_LABEL: Record<string, string> = {
  video: '视频', image: '图片', text: '文本', audio: '音频',
};

/**
 * Agent 任务页挂在主布局内：侧栏历史项目常驻，
 * 点任务后右侧直接显示结果与进度面板，不进入独立返回页。
 */
export function AgentTaskPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === id));
  const outputType = (searchParams.get('outputType') as 'video' | 'image' | 'text' | 'audio')
    || project?.outputType || 'video';

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">任务不存在</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="h-12 flex items-center px-5 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate max-w-[360px]">{project.name}</span>
          <span className="text-[10px] text-muted-foreground bg-accent/40 px-1.5 py-0.5 rounded-full flex-shrink-0">Agent</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex-shrink-0">
            {OUTPUT_TYPE_LABEL[outputType] || '视频'}
          </span>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <AgentRunner
          key={id}
          outputType={outputType}
          prompt={[
            project.description || project.name || '',
            ...(project.attachments || [])
              .filter((a) => a.textContent?.trim())
              .map((a) => `\n\n【参考素材：${a.name}】\n${a.textContent}`),
          ].join('')}
          skillId={project.skillId}
          attachmentCount={project.attachments?.length || 0}
          projectName={project.name}
          modelRef={project.modelRef}
          projectId={project.id}
          hasPriorRun={Boolean(project.agentRun)}
          onRunStateChange={(status) => useProjectStore.getState().updateProject(project.id, {
            agentRun: { status, finishedAt: new Date().toISOString() },
          })}
          onModelChange={(ref) => useProjectStore.getState().updateProject(project.id, { modelRef: ref })}
        />
      </div>
    </div>
  );
}
