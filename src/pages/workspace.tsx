import { confirmAction } from '@/components/shared/confirm-store';
import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useProjectStore } from '@/stores/project-store';
import { useTemplateStore } from '@/stores/template-store';
import { TextNode } from '@/components/nodes/text-node';
import { ImageNode } from '@/components/nodes/image-node';
import { VideoNode } from '@/components/nodes/video-node';
import { AudioNode } from '@/components/nodes/audio-node';
import { ScriptNode } from '@/components/nodes/script-node';
import { AIProcessNode } from '@/components/nodes/ai-process-node';
import { NodePanel } from '@/components/panels/node-panel';
import { PropertyPanel } from '@/components/panels/property-panel';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import { QuickMenu } from '@/components/workspace/quick-menu';
import { CanvasEmptyState } from '@/components/workspace/canvas-empty-state';
import { ExecutionPanel } from '@/components/workspace/execution-panel';
import { VersionPanel } from '@/components/workspace/version-panel';
import { CommentPanel } from '@/components/workspace/comment-panel';
import { StoryExtrapolationPanel } from '@/components/workspace/story-extrapolation-panel';
import { ExportPanel } from '@/components/workspace/export-panel';
import { AgentRunner } from '@/components/workspace/agent-runner';

const OUTPUT_TYPE_LABEL: Record<string, string> = {
  video: '视频', image: '图片', text: '文本', audio: '音频',
};
// Removed ResizablePanel — using custom flex + drag approach for reliability
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText, Sparkles, ImageIcon, Video, Music, PenLine, AlertTriangle, LayoutGrid,
  type LucideIcon,

  Plus,
} from 'lucide-react';
import type { NodeType } from '@/types';
import { useThemeStore } from '@/stores/theme-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsPanelStore } from '@/stores/settings-panel-store';
import { toast } from 'sonner';

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  script: ScriptNode,
  'ai-process': AIProcessNode,
};

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const inMainLayout = location.pathname.startsWith('/canvas/');
  const taskMode = inMainLayout ? 'canvas' : (searchParams.get('mode') as 'agent' | 'canvas' | null);
  const rawProject = useProjectStore((s) => s.getProject(id || ''));
  const currentUserId = useAuthStore((s) => s.user?.id);
  // 直接改 URL 也不允许打开其他账号的项目
  const project = rawProject && (!rawProject.ownerId || rawProject.ownerId === currentUserId)
    ? rawProject
    : undefined;
  const updateProject = useProjectStore((s) => s.updateProject);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    selectNode,
    loadWorkflow,
    clearWorkflow,
    canUndo,
    canRedo,
    undo,
    redo,
    isExecuting,
    executeWorkflow,
    cancelExecution,
    autoLayout,
    selectedNodeId,
  } = useWorkflowStore();

  // 模板/外部导入的节点可能没有 provider / model。
  // 执行前显示缺少模型的提示。
  const missingModelNodes = nodes.filter((n) => {
    const d = n.data as Record<string, unknown>;
    return !d.provider || !d.model;
  }).length;

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showStoryExtrapolation, setShowStoryExtrapolation] = useState(false);
  const [showTimeExtrapolation, setShowTimeExtrapolation] = useState(false);
  const [extrapolationMode, setExtrapolationMode] = useState<'story' | 'time'>('story');
  const [showExport, setShowExport] = useState(false);
  const [panelWidth, setPanelWidth] = useState(360);
  const [doubleClickMenu, setDoubleClickMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateCategory, setTemplateCategory] = useState('短视频');
  const { addTemplate } = useTemplateStore();
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    x: number; y: number; nodeId: string; nodeType: string; flowX: number; flowY: number;
  } | null>(null);

  // 画布上有节点时允许存为模板。
  const canSaveAsTemplate = nodes.length > 0;

  const handleSaveAsTemplate = useCallback(() => {
    setTemplateName(project?.name || '');
    setTemplateDesc(project?.description || '');
    setShowSaveTemplateDialog(true);
  }, [project]);

  // 快捷模板加载 — 直接将模板的节点/边加载到当前画布
  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const tpl = useTemplateStore.getState().getTemplate(templateId);
      if (!tpl) {
        toast.error('模板不存在');
        return;
      }
      const wf = tpl.workflowData;
      if (wf.nodes && wf.nodes.length > 0) {
        loadWorkflow(
          wf.nodes as never[],
          wf.edges as never[]
        );
        useTemplateStore.getState().incrementUseCount(templateId);
        toast.success(`已加载模板「${tpl.name}」`);
        setTimeout(() => rfInstance?.fitView({ padding: 0.2, duration: 300 }), 100);
      }
    },
    [loadWorkflow, rfInstance]
  );

  const handleConfirmSaveTemplate = useCallback(() => {
    const wfData = useWorkflowStore.getState().getWorkflowData();
    if (wfData.nodes.length === 0) {
      toast.error('当前工作流为空，无法保存为模板');
      return;
    }
    if (!templateName.trim()) {
      toast.error('请输入模板名称');
      return;
    }
    // 模板只保留结构与配置，不带上一次的运行结果，
    // 否则复用模板时会看到别人的图片/视频和错误状态。
    const sanitizedNodes = wfData.nodes.map((n) => {
      const d = (n.data || {}) as Record<string, unknown>;
      const cleaned: Record<string, unknown> = { ...d };
      [
        'status', 'errorMessage', 'statusDetail',
        'outputText', 'generatedText',
        'imageUrl', 'videoUrl', 'audioUrl', 'coverUrl',
        'upstreamText', 'upstreamImageUrl', 'upstreamAudioUrl', 'upstreamVideoUrls', 'upstreamScenes',
        'assignedSceneIndex',
      ].forEach((k) => delete cleaned[k]);
      cleaned.status = 'idle';
      return { ...n, data: cleaned };
    });

    addTemplate(templateName, templateDesc, templateCategory, {
      nodes: sanitizedNodes as never[],
      edges: wfData.edges as never[],
    });
    setShowSaveTemplateDialog(false);
    setTemplateName('');
    setTemplateDesc('');
    toast.success('已保存为个人模板');
  }, [templateName, templateDesc, templateCategory, addTemplate]);


  // Load workflow from project on mount / project switch
  useEffect(() => {
    if (project?.workflowData) {
      const wf = project.workflowData;
      if (wf.nodes && wf.nodes.length > 0) {
        loadWorkflow(wf.nodes as never[], wf.edges as never[]);
      } else {
        clearWorkflow();
      }
    } else {
      clearWorkflow();
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 把当前画布写回项目。
   * 切项目、返回、刷新、切后台与关闭页面前都会调用，并有定时兜底。
   */
  const flushSave = useCallback((projectId?: string) => {
    const targetId = projectId || id;
    if (!targetId) return;
    const wfData = useWorkflowStore.getState().getWorkflowData();
    // 空画布同样写入，保证删除全部节点后的状态被保存
    updateProject(targetId, {
      workflowData: { nodes: wfData.nodes as never[], edges: wfData.edges as never[] },
    });
  }, [id, updateProject]);

  // 产物与状态变化后 1.5s 内落盘
  useEffect(() => {
    if (!id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useWorkflowStore.subscribe((state, prev) => {
      if (state.nodes === prev.nodes) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; flushSave(); }, 1500);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [id, flushSave]);

  // 30 秒兜底
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => flushSave(), 30000);
    return () => clearInterval(interval);
  }, [id, flushSave]);

  // 离开前强制保存：cleanup 会在 projectId 变化（切项目）与组件卸载时触发
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushSave(); };
    const onUnload = () => flushSave();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      flushSave();
    };
  }, [flushSave]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setDoubleClickMenu(null);
    setNodeContextMenu(null);
  }, [selectNode]);

  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!rfInstance) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const flowPos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      setDoubleClickMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [rfInstance]
  );

  const handleDoubleClickAddNode = useCallback(
    (type: NodeType, extraData?: Record<string, unknown>) => {
      if (!doubleClickMenu) return;
      addNode(type, { x: doubleClickMenu.flowX, y: doubleClickMenu.flowY }, extraData);
      setDoubleClickMenu(null);
      toast.success('节点已添加');
    },
    [doubleClickMenu, addNode]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/videobuddy-node') as NodeType;
      if (!type || !rfInstance) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      let extraData: Record<string, unknown> | undefined;
      const extraStr = event.dataTransfer.getData('application/videobuddy-extra');
      if (extraStr) {
        try {
          extraData = JSON.parse(extraStr);
        } catch {
          // ignore
        }
      }

      addNode(type, position, extraData);
    },
    [rfInstance, addNode]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleAddNodeFromPanel = useCallback(
    (type: NodeType, extraData?: Record<string, unknown>) => {
      const center = rfInstance?.getViewport();
      const x = center ? (-center.x + 500) / (center.zoom || 1) : 300;
      const y = center ? (-center.y + 350) / (center.zoom || 1) : 200;
      const jitter = Math.random() * 60 - 30;
      addNode(type, { x: x + jitter, y: y + jitter }, extraData);
      toast.success('节点已添加到画布');
    },
    [rfInstance, addNode]
  );

  // 节点右键菜单处理
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string; type?: string; position: { x: number; y: number } }) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      setNodeContextMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        nodeId: node.id,
        nodeType: node.type || 'text',
        flowX: node.position.x + 280,
        flowY: node.position.y,
      });
    },
    []
  );

  // 从当前节点快速添加下游节点并自动连线
  const handleAddDownstreamNode = useCallback(
    (type: NodeType) => {
      if (!nodeContextMenu) return;
      const newId = addNode(type, { x: nodeContextMenu.flowX, y: nodeContextMenu.flowY });
      // 自动建立连接
      onConnect({
        source: nodeContextMenu.nodeId,
        target: newId,
        sourceHandle: null,
        targetHandle: null,
      });
      selectNode(newId);
      setNodeContextMenu(null);
      toast.success('已添加下游节点并自动连接');
    },
    [nodeContextMenu, addNode, onConnect, selectNode]
  );

  // 获取当前节点允许添加的下游节点类型
  const getAllowedDownstreamTypes = useCallback((srcType: string): Array<{ type: NodeType; label: string; icon: LucideIcon }> => {
    const allTypes: Record<string, Array<{ type: NodeType; label: string; icon: LucideIcon }>> = {
      'text':       [
        { type: 'script', label: '分镜脚本', icon: FileText },
        { type: 'ai-process', label: 'AI 处理', icon: Sparkles },
        { type: 'image', label: '生成图片', icon: ImageIcon },
        { type: 'video', label: '生成视频', icon: Video },
        { type: 'audio', label: '生成音频', icon: Music },
      ],
      'script':     [
        { type: 'image', label: '生成分镜图', icon: ImageIcon },
        { type: 'video', label: '生成视频', icon: Video },
        { type: 'audio', label: '生成配音', icon: Music },
        { type: 'ai-process', label: 'AI 后处理', icon: Sparkles },
      ],
      'ai-process': [
        { type: 'text', label: '文本节点', icon: PenLine },
        { type: 'script', label: '分镜脚本', icon: FileText },
        { type: 'image', label: '生成图片', icon: ImageIcon },
        { type: 'video', label: '生成视频', icon: Video },
        { type: 'audio', label: '生成音频', icon: Music },
      ],
      'image':      [
        { type: 'video', label: '图生视频', icon: Video },
        { type: 'image', label: '图生图', icon: ImageIcon },
        { type: 'ai-process', label: 'AI 后处理', icon: Sparkles },
      ],
      'video':      [
        { type: 'video', label: '片段汇总', icon: Video },
        { type: 'ai-process', label: 'AI 后处理', icon: Sparkles },
      ],
      // 音频 → 视频目前不传递音轨数据，不提供该入口，避免连上却没有效果
      'audio':      [
        { type: 'ai-process', label: 'AI 后处理', icon: Sparkles },
      ],
    };
    return allTypes[srcType] || [];
  }, []);

  const handleSave = useCallback(() => {
    if (!id) return;
    flushSave();
    toast.success('项目已保存');
  }, [id, flushSave]);

  // 键盘快捷键挂在 document 上：
  // 快捷键监听挂在 document 上，覆盖 Portal 内的焦点；
  // 输入框获得焦点时跳过画布快捷键。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowQuickMenu(false);
      }

      // 保存：输入态下也应生效（符合编辑器通用习惯）
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
        return;
      }

      // 其余快捷键在输入态下一律让位给浏览器/输入框
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        active?.isContentEditable === true;
      if (isTyping) return;

      // Quick menu
      if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShowQuickMenu(true);
        return;
      }
      // Undo/Redo
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      // Fit view
      if (event.key === 'f' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        rfInstance?.fitView({ padding: 0.2, duration: 300 });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, handleSave, rfInstance]);

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: true,
      style: { stroke: 'hsl(239 84% 67% / 0.4)', strokeWidth: 1.2 },
    }),
    []
  );

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">项目不存在</p>
      </div>
    );
  }

  return (
    <div className={inMainLayout ? "h-full flex flex-col bg-background" : "h-screen flex flex-col bg-background"}>
      {/* Top toolbar — Agent 模式用简化版 */}
      {taskMode === 'agent' ? (
        <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-card/50 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate max-w-[320px]">{project?.name || '新任务'}</span>
            <span className="text-[10px] text-muted-foreground bg-accent/40 px-1.5 py-0.5 rounded-full flex-shrink-0">Agent</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex-shrink-0">
              {OUTPUT_TYPE_LABEL[searchParams.get('outputType') || 'video'] || '视频'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/dashboard')}
              className="h-8 flex items-center gap-1 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition"
            >
              <Plus className="w-3.5 h-3.5" /> 新任务
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition"
              onClick={() => { const { toggleTheme } = useThemeStore.getState(); toggleTheme(); }}
            >
              {useThemeStore.getState().theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>
        </header>
      ) : (
      <WorkspaceHeader
        project={project}
        onBack={() => { flushSave(); navigate('/dashboard'); }}
        hideBack={inMainLayout}
        onSave={handleSave}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        isExecuting={isExecuting}
        onExecute={executeWorkflow}
        onCancelExecution={cancelExecution}
        onToggleExecution={() => setShowExecution(!showExecution)}
        onToggleVersions={() => setShowVersions(!showVersions)}
        onToggleComments={() => setShowComments(!showComments)}
        onToggleExport={() => setShowExport(!showExport)}
        canSaveAsTemplate={canSaveAsTemplate}
        onSaveAsTemplate={handleSaveAsTemplate}
      />
      )}

      {/* Main workspace — Agent 模式 或 画布模式 */}
      {taskMode === 'agent' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0">
          <AgentRunner
            key={id}
            outputType={(searchParams.get('outputType') as 'video' | 'image' | 'text' | 'audio') ?? 'video'}
            prompt={[
              project?.description || project?.name || '',
              ...(project?.attachments || [])
                .filter((a) => a.textContent?.trim())
                .map((a) => `\n\n【参考素材：${a.name}】\n${a.textContent}`),
            ].join('')}
            skillId={project?.skillId}
            attachmentCount={project?.attachments?.length || 0}
            projectName={project?.name || '新任务'}
          />
          </div>
        </div>
      ) : (
      <div className="flex-1 flex overflow-hidden">
        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 h-full">
          <div className="h-full relative" ref={reactFlowWrapper}>
            {missingModelNodes > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-card/95 shadow-sm max-w-[92%]">
                <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <p className="text-[12px] text-foreground leading-snug">
                  {missingModelNodes} 个节点未指定模型，执行前需先配置模型服务并设为默认
                </p>
                <button
                  onClick={() => useSettingsPanelStore.getState().openSettings('models')}
                  className="text-[12px] font-medium text-foreground underline underline-offset-2 whitespace-nowrap"
                >
                  去配置
                </button>
              </div>
            )}
            {/* Floating Node Panel (includes AI Creative tools) */}
            <NodePanel
              onAddNode={handleAddNodeFromPanel}
              onOpenStoryExtrapolation={() => {
                setExtrapolationMode('story');
                setShowStoryExtrapolation(true);
                setShowTimeExtrapolation(false);
              }}
              onOpenTimeExtrapolation={() => {
                setExtrapolationMode('time');
                setShowTimeExtrapolation(true);
                setShowStoryExtrapolation(false);
              }}
              isStoryOpen={showStoryExtrapolation}
              isTimeOpen={showTimeExtrapolation}
            />
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneClick={handlePaneClick}
              onDoubleClick={handlePaneDoubleClick}
              onInit={setRfInstance}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView={nodes.length > 0}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode="Shift"
              panOnScroll
              selectionOnDrag
              proOptions={{ hideAttribution: true }}
              className="bg-[hsl(var(--canvas-bg,var(--background)))]"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color="hsl(var(--canvas-dot-color))"
              />
              <Controls className="!bottom-14 !left-4" />
              <MiniMap
                nodeStrokeWidth={2}
                pannable
                zoomable
                // 深色主题下默认小地图是一整块浅灰，和画布反差过大，
                // 这里统一为卡片底色 + 半透明遮罩，并按主题取节点颜色。
                className="!bottom-14 !right-4 !rounded-lg hidden lg:block !border !border-border/60 !bg-card/85 backdrop-blur-md overflow-hidden"
                maskColor="hsl(var(--background) / 0.7)"
                nodeColor="hsl(239 84% 67% / 0.7)"
                style={{ width: 160, height: 110 }}
              />

              {/* Bottom status bar */}
              <Panel position="bottom-center" className="mb-1">
                <div className="px-4 py-1.5 rounded-full bg-card/80 backdrop-blur-md border border-border/50 text-xs text-muted-foreground flex items-center gap-3">
                  <span>节点: {nodes.length}</span>
                  <span className="w-px h-3 bg-border" />
                  <span>连线: {edges.length}</span>
                  {isExecuting && (
                    <>
                      <span className="w-px h-3 bg-border" />
                      <span className="text-blue-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        执行中...
                      </span>
                    </>
                  )}
                  <span className="w-px h-3 bg-border" />
                  <span className="opacity-60">按 / 快捷菜单 · F 适配视图</span>
                  <span className="w-px h-3 bg-border" />
                  <button
                    onClick={() => { if (nodes.length === 0) { toast.info('画布还没有节点'); return; } autoLayout(); toast.success('已整理画布布局'); }}
                    disabled={isExecuting}
                    className="flex items-center gap-1 text-foreground hover:opacity-70 transition disabled:opacity-40"
                    title="按依赖关系自动整理节点布局"
                    aria-label="一键整理布局"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> 一键整理
                  </button>
                </div>
              </Panel>
            </ReactFlow>

            {/* Empty state when no nodes */}
            {nodes.length === 0 && (
              <CanvasEmptyState onAddNode={handleAddNodeFromPanel} onLoadTemplate={handleLoadTemplate} />
            )}

            {/* Double-click context menu for adding nodes */}
            {doubleClickMenu && (
              <div
                className="absolute z-40 animate-in fade-in zoom-in-95 duration-150"
                style={{ left: doubleClickMenu.x, top: doubleClickMenu.y, transform: 'translate(-50%, -50%)' }}
              >
                <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-2 min-w-[180px]">
                  <p className="text-[10px] text-muted-foreground px-2 py-1 mb-1">添加节点</p>
                  {[
                    { label: '文本节点', type: 'text' as NodeType, icon: PenLine, color: 'text-indigo-400' },
                    { label: '图片节点', type: 'image' as NodeType, icon: ImageIcon, color: 'text-slate-500' },
                    { label: '视频节点', type: 'video' as NodeType, icon: Video, color: 'text-amber-400' },
                    { label: '音频节点', type: 'audio' as NodeType, icon: Music, color: 'text-pink-400' },
                    { label: '脚本节点', type: 'script' as NodeType, icon: FileText, color: 'text-violet-400' },
                    { label: 'AI 处理', type: 'ai-process' as NodeType, icon: Sparkles, color: 'text-cyan-400' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm hover:bg-accent transition text-left"
                      onClick={() => handleDoubleClickAddNode(item.type)}
                    >
                      <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                {/* Click outside to close */}
                <div
                  className="fixed inset-0 -z-10"
                  onClick={() => setDoubleClickMenu(null)}
                />
              </div>
            )}

            {/* Node right-click context menu — 快速添加下游节点 */}
            {nodeContextMenu && (
              <div
                className="absolute z-50 animate-in fade-in zoom-in-95 duration-150"
                style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
              >
                <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-2 min-w-[200px]">
                  <p className="text-[10px] text-muted-foreground px-2 py-1 mb-1">添加下游节点 →</p>
                  {getAllowedDownstreamTypes(nodeContextMenu.nodeType).map((item) => (
                    <button
                      key={item.type}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm hover:bg-accent transition text-left"
                      onClick={() => handleAddDownstreamNode(item.type)}
                    >
                      <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <div className="border-t border-border/50 mt-1 pt-1">
                    <button
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm hover:bg-red-500/10 transition text-left text-red-400"
                      onClick={async () => {
                        const ok = await confirmAction({ title: '删除该节点？', description: '删除后可用 ⌘Z 撤销。', confirmText: '删除', destructive: true });
                        if (!ok) return;
                        deleteNode(nodeContextMenu.nodeId);
                        setNodeContextMenu(null);
                        toast.success('节点已删除');
                      }}
                    >
                      <span className="text-sm"></span>
                      <span>删除节点</span>
                    </button>
                  </div>
                </div>
                <div
                  className="fixed inset-0 -z-10"
                  onClick={() => setNodeContextMenu(null)}
                />
              </div>
            )}

            {/* Quick menu overlay */}
            {showQuickMenu && (
              <QuickMenu
                onClose={() => setShowQuickMenu(false)}
                onAddNode={(type, extraData) => {
                  handleAddNodeFromPanel(type, extraData);
                  setShowQuickMenu(false);
                }}
              />
            )}

            {/* Execution panel overlay */}
            {showExecution && (
              <ExecutionPanel onClose={() => setShowExecution(false)} />
            )}

            {/* Version panel overlay */}
            {showVersions && (
              <VersionPanel
                projectId={id || ''}
                onClose={() => setShowVersions(false)}
              />
            )}

            {/* 批注面板（仅当前账号可见） */}
            {showComments && (
              <CommentPanel
                projectId={id || ''}
                onClose={() => setShowComments(false)}
              />
            )}

            {/* Story extrapolation panel */}
            {(showStoryExtrapolation || showTimeExtrapolation) && (
              <StoryExtrapolationPanel
                initialMode={extrapolationMode}
                onClose={() => {
                  setShowStoryExtrapolation(false);
                  setShowTimeExtrapolation(false);
                }}
              />
            )}

            {/* Export panel */}
            {showExport && (
              <ExportPanel
                onClose={() => setShowExport(false)}
              />
            )}

            {/* AI Creative tools now integrated into NodePanel */}
          </div>
        </div>

        {/* Drag handle — 自定义可拖拽分割条 */}
        <div
          className="w-[3px] hover:bg-primary/20 active:bg-primary/40 cursor-col-resize flex-shrink-0 relative transition-colors group"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = panelWidth;
            const onMouseMove = (ev: MouseEvent) => {
              const delta = startX - ev.clientX;
              const newWidth = Math.min(Math.max(startWidth + delta, 280), 700);
              setPanelWidth(newWidth);
            };
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        >
          {/* Visual grip indicator */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 rounded-full flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-4 rounded-full bg-muted-foreground/30 group-hover:bg-primary/50 transition-colors" />
          </div>
        </div>

        {/* 未选择节点时不渲染属性抽屉 */}
        {selectedNodeId && (
        <div style={{ width: panelWidth }} className="flex-shrink-0 overflow-hidden my-2 mr-2 ml-1 rounded-xl max-w-[45vw] shadow-lg bg-card/90 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.06]">
          <div className="h-full overflow-y-auto">
            <PropertyPanel />
          </div>
        </div>
        )}
      </div>
      )}

      {/* Save as template dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>保存为模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>模板名称</Label>
              <Input
                placeholder="例如：我的短视频工作流"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Textarea
                placeholder="简要描述模板的用途..."
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>分类</Label>
              <select
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                className="w-full h-8 rounded-md border border-border bg-background/50 px-3 text-sm"
              >
                <option value="短视频">短视频</option>
                <option value="广告营销">广告营销</option>
                <option value="短剧">短剧</option>
                <option value="自媒体">自媒体</option>
                <option value="音频">音频</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveTemplateDialog(false)}>
              取消
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleConfirmSaveTemplate}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
