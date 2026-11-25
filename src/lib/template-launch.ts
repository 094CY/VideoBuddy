import { useTemplateStore, normalizeTemplateWorkflow } from '@/stores/template-store';
import { useProjectStore } from '@/stores/project-store';
import { useModelStore } from '@/stores/model-store';

export interface TemplateLaunchResult {
  projectId: string;
  /** 未设置任何默认模型时，节点会缺 provider/model，无法直接执行 */
  missingModels: boolean;
}

/**
 * 从模板创建项目，供模板库与首页快捷入口共用。
 */
export function launchTemplate(templateId: string): TemplateLaunchResult | null {
  const templateStore = useTemplateStore.getState();
  const template = templateStore.getTemplate(templateId);
  if (!template) return null;

  const { defaultModels } = useModelStore.getState();
  const missingModels = !(['text', 'image', 'video', 'audio'] as const)
    .some((type) => Boolean(defaultModels[type]));

  const projectStore = useProjectStore.getState();
  const project = projectStore.createProject(
    `${template.name} - 新项目`,
    template.description,
  );
  projectStore.updateProject(project.id, {
    workflowData: normalizeTemplateWorkflow(template.workflowData),
  });
  templateStore.incrementUseCount(templateId);

  return { projectId: project.id, missingModels };
}
