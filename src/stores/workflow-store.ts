import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import { generateId } from '@/lib/utils';
import type { NodeType, TaskStatus, ModelType } from '@/types';
import { useModelStore } from '@/stores/model-store';
import {
  callAIChat,
  getTextExpandSystemPrompt,
  getScriptSystemPrompt,
  callImageGeneration,
  callVideoGeneration,
  callTTS,
} from '@/services/ai-service';
import { useUsageStore } from '@/stores/usage-store';
import { toast } from 'sonner';
import { fillNodeSubTypes, layoutWorkflow } from '@/lib/workflow-layout';

// ---- History for undo/redo ----
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

// ---- Execution task ----
export interface ExecutionTask {
  id: string;
  nodeId: string;
  status: TaskStatus;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface WorkflowStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Undo/Redo
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  /** 按依赖关系自动整理画布布局，消除节点重叠 */
  autoLayout: () => void;

  // React Flow handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Node operations
  addNode: (type: NodeType, position: { x: number; y: number }, extraData?: Record<string, unknown>) => string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // Workflow operations
  loadWorkflow: (nodes: Node[], edges: Edge[]) => void;
  clearWorkflow: () => void;
  getWorkflowData: () => { nodes: Node[]; edges: Edge[] };

  // Execution engine
  executionTasks: ExecutionTask[];
  isExecuting: boolean;
  executeWorkflow: () => Promise<void>;
  executeNode: (nodeId: string) => Promise<void>;
  cancelExecution: () => void;
  resumePendingTask: (nodeId: string) => Promise<void>;
  getNodeExecutionStatus: (nodeId: string) => TaskStatus | undefined;

  // 版本快照按项目隔离
  versions: { id: string; name: string; snapshot: HistoryEntry; createdAt: string; projectId?: string }[];
  saveVersion: (name: string, projectId?: string) => void;
  loadVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;
}

function getDefaultNodeData(type: NodeType, extraData?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { status: 'idle' };

  // 只有用户明确设置了默认模型才预填。平台不预置任何模型 ID，
  // 没配置时节点保持为空，执行前会给出明确的配置引导。
  const modelType: ModelType =
    type === 'script' || type === 'ai-process' ? 'text' : (type as ModelType);
  const dm = useModelStore.getState().getDefaultModel(modelType);
  if (dm) {
    base.provider = dm.provider;
    base.model = dm.model;
    base.serviceId = dm.serviceId;
  }

  switch (type) {
    case 'text':
      return { ...base, label: '文本节点', content: '', format: 'plain', ...extraData };
    case 'image':
      return { ...base, label: '图片节点', prompt: '', ...extraData };
    case 'video':
      return { ...base, label: '视频节点', prompt: '', duration: 5, fps: 24, ...extraData };
    case 'audio':
      return { ...base, label: '音频节点', prompt: '', ...extraData };
    case 'script':
      return { ...base, label: '脚本节点', title: '', scenes: [], ...extraData };
    case 'ai-process':
      return { ...base, label: 'AI 处理节点', processType: 'text-expand', prompt: '', ...extraData };
    default:
      return { ...base, label: '未知节点', ...extraData };
  }
}

// Topological sort for DAG execution
function topoSort(nodes: Node[], edges: Edge[]): string[] {
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  const nodeIds = nodes.map((n) => n.id);

  nodeIds.forEach((id) => {
    inDegree[id] = 0;
    adjList[id] = [];
  });

  edges.forEach((e) => {
    if (adjList[e.source]) {
      adjList[e.source].push(e.target);
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    }
  });

  const queue = nodeIds.filter((id) => inDegree[id] === 0);
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adjList[current] || []) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

// Debounce timer for updateNodeData pushHistory
let _updateDataHistoryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 执行中断控制。
 *
 * 放在模块级而不是 store state 里：AbortController 不可序列化，
 * 混进 state 会被 persist 尝试持久化。
 */
let executionAbortController: AbortController | null = null;

/**
 * 执行代次。每次开始或取消都自增，异步请求返回后用它判断
 * 标识异步结果所属的执行代次；取消后的结果不写入画布。
 */
let executionGeneration = 0;

/** 供各 AI 调用点透传，让「取消执行」能真正中断进行中的请求 */
function currentAbortSignal(): AbortSignal | undefined {
  return executionAbortController?.signal;
}

function isAbortError(error: unknown): boolean {
  // TimeoutError 是请求超时，属于失败，应展示错误而不是静默回到 idle
  return error instanceof Error && error.name === 'AbortError';
}

// 只持久化版本历史。nodes/edges 由 project-store 的 workflowData 负责落盘，
// 两者同时持久化会造成打开项目时的数据源冲突。
type WorkflowPersistedState = Pick<WorkflowStore, 'versions'>;

export const useWorkflowStore = create<WorkflowStore>()(
persist<WorkflowStore, [], [], WorkflowPersistedState>(
(set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  // Undo/Redo state
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    // Keep max 50 history entries
    if (newHistory.length > 50) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const entry = history[newIndex];
    set({
      nodes: structuredClone(entry.nodes),
      edges: structuredClone(entry.edges),
      historyIndex: newIndex,
      canUndo: newIndex > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = history[newIndex];
    set({
      nodes: structuredClone(entry.nodes),
      edges: structuredClone(entry.edges),
      historyIndex: newIndex,
      canUndo: true,
      canRedo: newIndex < history.length - 1,
    });
  },

  onNodesChange: (changes) => {
    const prev = get().nodes;
    const next = applyNodeChanges(changes, prev);
    set({ nodes: next });
    // Push history for structural changes (add, remove)
    const hasStructuralChange = changes.some(
      (c) => c.type === 'remove' || c.type === 'add'
    );
    // Push history when position drag ends
    const hasDragEnd = changes.some(
      (c) => c.type === 'position' && c.dragging === false
    );
    if (hasStructuralChange || hasDragEnd) {
      setTimeout(() => get().pushHistory(), 0);
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const hasStructuralChange = changes.some(
      (c) => c.type === 'remove' || c.type === 'add'
    );
    if (hasStructuralChange) {
      setTimeout(() => get().pushHistory(), 0);
    }
  },

  onConnect: (connection) => {
    // ========== 连接类型校验 ==========
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const targetNode = get().nodes.find(n => n.id === connection.target);

    if (sourceNode && targetNode) {
      const srcType = sourceNode.type || '';
      const tgtType = targetNode.type || '';

      const srcLabel = ((sourceNode.data as Record<string, unknown>)?.label as string) || srcType;
      const tgtLabel = ((targetNode.data as Record<string, unknown>)?.label as string) || tgtType;

      // 禁止自连接
      if (sourceNode.id === targetNode.id) {
        toast.error('不能将节点连接到它自己');
        return;
      }

      // 定义合法的连接规则 —— source → target[]
      // 核心逻辑：数据从上游流向下游，遵循视频制作管线
      const allowedConnections: Record<string, string[]> = {
        'text':       ['text', 'script', 'ai-process', 'image', 'video', 'audio'],   // 文本可以给任何节点提供输入
        'script':     ['image', 'video', 'audio', 'ai-process'],                      // 脚本→分镜图/视频/音频/后处理
        'ai-process': ['text', 'image', 'video', 'audio', 'ai-process', 'script'],    // AI处理输出可用于任何节点
        'image':      ['image', 'video', 'ai-process'],                               // 图片→图生图/首帧生视频/AI后处理
        'video':      ['video', 'ai-process'],                                        // 视频→拼接/转绘/AI后处理
        'audio':      ['video', 'ai-process'],                                        // 音频→视频（配音轨）/AI后处理
      };

      const allowed = allowedConnections[srcType];
      if (allowed && !allowed.includes(tgtType)) {
        // 必须给用户明确反馈，否则松手后连线凭空消失会被当成 BUG
        toast.error(`不支持该连接：「${srcLabel}」→「${tgtLabel}」不符合视频制作管线规则`);
        return;
      }

      // 防止重复连接（同一 source→target 只允许一条边）
      const existingEdge = get().edges.find(
        e => e.source === connection.source && e.target === connection.target
      );
      if (existingEdge) {
        toast.info('这两个节点之间已经有连线了');
        return;
      }
    }

    set({
      edges: addEdge(
        {
          ...connection,
          id: `edge-${generateId()}`,
          animated: true,
          style: { stroke: 'hsl(239 84% 67% / 0.5)', strokeWidth: 1.2 },
        },
        get().edges
      ),
    });
    setTimeout(() => get().pushHistory(), 0);
  },

  addNode: (type, position, extraData) => {
    const id = `node-${generateId()}`;
    const newNode: Node = {
      id,
      type,
      position,
      data: getDefaultNodeData(type, extraData),
    };
    set({ nodes: [...get().nodes, newNode] });
    setTimeout(() => get().pushHistory(), 0);
    return id;
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    });
    // Debounced push history so rapid edits are batched
    if (_updateDataHistoryTimer) clearTimeout(_updateDataHistoryTimer);
    _updateDataHistoryTimer = setTimeout(() => {
      get().pushHistory();
      _updateDataHistoryTimer = null;
    }, 500);
  },

  deleteNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
    setTimeout(() => get().pushHistory(), 0);
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  loadWorkflow: (nodes, edges) => {
    // 补齐缺失的默认模型。
    // 模板和历史项目里的节点通常没有 provider/model，直接执行会被前置校验
    // 逐个拦下，用户看到的是「6 个节点全部失败」。
    const { getDefaultModel } = useModelStore.getState();
    const normalized = nodes.map((n) => {
      const d = (n.data || {}) as Record<string, unknown>;
      if (d.status === 'running') {
        return { ...n, data: { ...d, status: 'idle', statusDetail: '' } };
      }
      if (d.provider && d.model) return n;
      const type = (n.type || 'text') as NodeType;
      const modelType: ModelType =
        type === 'script' || type === 'ai-process' ? 'text' : (type as ModelType);
      const dm = getDefaultModel(modelType);
      if (!dm) return n;
      return { ...n, data: { ...d, provider: dm.provider, model: dm.model, serviceId: dm.serviceId } };
    });

    // 统一补齐子类型并自动排版。画布内的「快捷模板加载」绕过
    // normalizeTemplateWorkflow，只在这里兜底，保证任何入口都不重叠。
    type MutableNode = {
      id: string; type?: string | null;
      position: { x: number; y: number };
      data?: Record<string, unknown>;
    };
    const mutable = normalized as unknown as MutableNode[];
    const laidOut = layoutWorkflow(fillNodeSubTypes(mutable, edges as unknown as { source: string; target: string }[]), edges as unknown as { source: string; target: string }[]);
    const finalNodes = laidOut as unknown as typeof normalized;

    set({
      nodes: finalNodes,
      edges,
      selectedNodeId: null,
      history: [{ nodes: structuredClone(finalNodes), edges: structuredClone(edges) }],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
    });
  },

  autoLayout: () => {
    const { nodes, edges, pushHistory } = get();
    if (nodes.length === 0) {
      void import('sonner').then(({ toast }) => toast.info('画布还没有节点，请先添加节点再执行'));
      return;
    }
    const laidOut = layoutWorkflow(
      nodes as unknown as { id: string; position: { x: number; y: number } }[],
      edges as unknown as { source: string; target: string }[],
    );
    set({ nodes: laidOut as unknown as typeof nodes });
    pushHistory();
  },

  clearWorkflow: () => {
    // 必须重置历史栈/版本/执行任务，否则从 A 项目切到新建的 B 项目时，
    // A 的 50 条撤销记录会被 Cmd+Z 还原进 B 的画布，造成跨项目数据污染。
    // 这里以「空画布」作为初始快照，保证第一个新增节点也能被撤销。
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
      // 版本历史是用户主动保存的快照，属于长期资产，
      // 不因打开另一个空项目而被清空（改由 projectId 隔离）。
      executionTasks: [],
      isExecuting: false,
    });
  },

  getWorkflowData: () => {
    return { nodes: get().nodes, edges: get().edges };
  },

  // ==== Execution Engine ====
  executionTasks: [],
  isExecuting: false,

  executeWorkflow: async () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;
    // 防止两次执行交错写同一份 executionTasks / nodes
    if (get().isExecuting) {
      toast.info('工作流正在执行中');
      return;
    }

    // 本次执行的中断控制器与代次标记，供所有 AI 请求透传
    executionAbortController = new AbortController();
    const generation = ++executionGeneration;

    const sortedIds = topoSort(nodes, edges);

    // 环检测：Kahn 算法遇到环会静默丢弃环内节点。
    // 若不显式拦截，用户会看到「执行完成」但部分节点从未运行，属于误导。
    if (sortedIds.length !== nodes.length) {
      const cyclic = nodes
        .filter((n) => !sortedIds.includes(n.id))
        .map((n) => ((n.data as Record<string, unknown>)?.label as string) || n.id);
      toast.error(`工作流存在环形依赖，无法执行：${cyclic.join('、')}`);
      return;
    }

    const tasks: ExecutionTask[] = sortedIds.map((nodeId) => ({
      id: `task-${generateId()}`,
      nodeId,
      status: 'pending' as TaskStatus,
      progress: 0,
    }));

    set({ executionTasks: tasks, isExecuting: true });

    // Reset all node statuses
    const updatedNodes = get().nodes.map((n) => ({
      ...n,
      data: { ...n.data, status: 'idle' },
    }));
    set({ nodes: updatedNodes });

    const executionStartTime = Date.now();
    // 记录已失败节点，用于阻断下游
    const failedNodeIds = new Set<string>();

    // Execute sequentially using real executeNode calls
    for (const nodeId of sortedIds) {
      const { isExecuting } = get();
      if (!isExecuting) break; // 用户取消了

      // 上游失败阻断：任一上游失败则跳过本节点并标记
      const upstreamIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
      if (upstreamIds.some((id) => failedNodeIds.has(id))) {
        failedNodeIds.add(nodeId);
        const skipMsg = '上游节点执行失败，已跳过本节点';
        set({
          executionTasks: get().executionTasks.map((t) =>
            t.nodeId === nodeId
              ? { ...t, status: 'failed', error: skipMsg, completedAt: new Date().toISOString() }
              : t
          ),
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, status: 'error', errorMessage: skipMsg } }
              : n
          ),
        });
        continue;
      }

      // 更新任务状态为 running
      set({
        executionTasks: get().executionTasks.map((t) =>
          t.nodeId === nodeId ? { ...t, status: 'running', startedAt: new Date().toISOString() } : t
        ),
      });

      try {
        await get().executeNode(nodeId);

        // 用户取消或新一轮执行已接管：丢弃这个迟到的结果，不写任何终态
        if (generation !== executionGeneration) break;

        // 检查节点状态
        const completedNode = get().nodes.find((n) => n.id === nodeId);
        const nodeStatus = (completedNode?.data as Record<string, unknown>)?.status;

        // 节点被中断（executeNode 把 AbortError 还原成 idle）时不标成功
        if (nodeStatus !== 'completed' && nodeStatus !== 'error') {
          break;
        }

        if (nodeStatus === 'error') {
          const errMsg = (completedNode?.data as Record<string, unknown>)?.errorMessage as string || '节点执行失败';
          failedNodeIds.add(nodeId);
          set({
            executionTasks: get().executionTasks.map((t) =>
              t.nodeId === nodeId
                ? { ...t, status: 'failed', error: errMsg, completedAt: new Date().toISOString() }
                : t
            ),
          });
          // 继续执行下一个节点而非中断整个工作流
        } else {
          set({
            executionTasks: get().executionTasks.map((t) =>
              t.nodeId === nodeId
                ? { ...t, status: 'completed', progress: 100, completedAt: new Date().toISOString() }
                : t
            ),
          });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : '执行失败';
        failedNodeIds.add(nodeId);
        set({
          executionTasks: get().executionTasks.map((t) =>
            t.nodeId === nodeId
              ? { ...t, status: 'failed', error: errMsg, completedAt: new Date().toISOString() }
              : t
          ),
        });
      }
    }

    // 记录工作流执行到 usage store
    try {
      const completedTasks = get().executionTasks;
      const hasAnyFailed = completedTasks.some(t => t.status === 'failed');
      useUsageStore.getState().recordExecution({
        nodeCount: sortedIds.length,
        success: !hasAnyFailed,
        durationMs: Date.now() - executionStartTime,
      });
    } catch { /* 不阻塞主流程 */ }

    // 当前代次才执行收尾，新一轮执行的状态不受影响
    if (generation === executionGeneration) {
      executionAbortController = null;
      set({ isExecuting: false });
    }
  },

  executeNode: async (nodeId: string) => {
  // 取消或新一轮执行接管后，异步返回的产物/错误都不能再写回画布
  const myGeneration = executionGeneration;
  const guardedSet = (partial: Partial<WorkflowStore>) => {
    if (myGeneration !== executionGeneration) return;
    set(partial);
  };
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const data = node.data as Record<string, unknown>;
    const nodeType = node.type || 'text';

    // 设置运行状态
    guardedSet({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status: 'running', errorMessage: '' } } : n
      ),
    });

    try {
      // ========== 自动从上游节点获取数据（全流程衔接的核心） ==========
      const allEdges = get().edges;
      const allNodes = get().nodes;
      const incomingEdges = allEdges.filter(e => e.target === nodeId);
      let upstreamText = '';
      let upstreamImageUrl = '';
      let upstreamScenes: Array<Record<string, unknown>> = [];
      let upstreamAudioUrl = '';
      const upstreamVideoUrls: string[] = [];
      // 当前节点在上游脚本节点所有下游中应分配到的场景索引
      let assignedSceneIndex = 0;

      for (const edge of incomingEdges) {
        const sourceNode = allNodes.find(n => n.id === edge.source);
        if (!sourceNode) continue;
        const srcData = sourceNode.data as Record<string, unknown>;

        // 提取上游文本内容
        if (sourceNode.type === 'text' && srcData.content) {
          upstreamText = upstreamText || (srcData.content as string);
        }
        if (sourceNode.type === 'ai-process' && srcData.outputText) {
          upstreamText = upstreamText || (srcData.outputText as string);
        }
        if (sourceNode.type === 'script') {
          upstreamText = upstreamText || (srcData.sourceText as string) || (srcData.title as string) || '';
          // 提取分镜 scenes 数据 — 全流程关键
          const scenes = (srcData.scenes as Array<Record<string, unknown>>) || [];
          if (scenes.length > 0) {
            upstreamScenes = scenes;

            // ====== 分镜场景智能分配 ======
            // 找到脚本节点的所有【同类型】下游节点，按拓扑排序确定索引
            // 这样 Script → [Image1, Image2, Image3] 会分别分配到 scene[0], scene[1], scene[2]
            const scriptOutEdges = allEdges.filter(e => e.source === sourceNode.id);
            const sameTypeDownstream = scriptOutEdges
              .map(e => allNodes.find(n => n.id === e.target))
              .filter(n => n && n.type === nodeType)
              .sort((a, b) => {
                // 按 Y 坐标排序（画布上从上到下的顺序）作为分配顺序
                const ay = a!.position?.y ?? 0;
                const by = b!.position?.y ?? 0;
                return ay - by;
              });
            const myIndex = sameTypeDownstream.findIndex(n => n!.id === nodeId);
            assignedSceneIndex = myIndex >= 0 ? myIndex : 0;
          }
        }

        // 生成类节点会把「实际使用的提示词」写回 data.prompt。
        // 把它纳入上游文本，模板里 image → video 这类链路才能继承描述，
        // 否则下游视频节点 prompt 为空、直接报「请先输入视频描述」。
        if (sourceNode.type === 'image' || sourceNode.type === 'audio' || sourceNode.type === 'video') {
          const desc = (srcData.prompt as string) || '';
          if (desc) upstreamText = upstreamText || desc;
        }

        // 提取上游图片
        if (sourceNode.type === 'image') {
          upstreamImageUrl = upstreamImageUrl || (srcData.imageUrl as string) || (srcData.uploadedImageUrl as string) || '';
        }
        if (sourceNode.type === 'script') {
          const scenes = (srcData.scenes as Array<Record<string, unknown>>) || [];
          // 使用 assignedSceneIndex 取对应场景的图片，而非始终取第一张
          const targetScene = scenes[assignedSceneIndex] || scenes.find(s => s.generatedImageUrl);
          if (targetScene && targetScene.generatedImageUrl) {
            upstreamImageUrl = upstreamImageUrl || (targetScene.generatedImageUrl as string);
          }
        }

        // 提取上游音频
        if (sourceNode.type === 'audio') {
          upstreamAudioUrl = upstreamAudioUrl || (srcData.audioUrl as string) || (srcData.uploadedAudioUrl as string) || '';
        }

        // 提取上游视频（用于拼接）
        if (sourceNode.type === 'video' && srcData.videoUrl) {
          upstreamVideoUrls.push(srcData.videoUrl as string);
        }
      }

      // provider 是接口协议标识（给请求构造层用），
      // serviceId 指向用户配置的具体服务（取地址与密钥）。
      const provider = (data.provider as string) || '';
      const model = (data.model as string) || '';
      const serviceId = (data.serviceId as string) || '';

      if (!provider || !model) {
        throw new Error('还没有配置模型。请先在「设置 → 模型 & Key」添加服务与模型，再在节点属性中选择。');
      }

      const modelStore = useModelStore.getState();
      const lookup = serviceId || provider;
      const keyConfig = modelStore.getApiKeyForProvider(lookup);
      const apiKey = modelStore.getPlainApiKey(lookup) ?? '';

      // 服务端托管的服务密钥保存在服务端，前端为空是正常的：
      // 请求经 /api/proxy 时由服务端注入鉴权头，这里只校验地址存在。
      const isManaged = Boolean(keyConfig?.managed);
      if (!keyConfig || !keyConfig.baseUrl || (!isManaged && !apiKey)) {
        throw new Error('未找到该模型的完整配置（服务地址与 API Key）。请在「设置 → 模型 & Key」检查。');
      }
      const baseUrl = keyConfig.baseUrl;

      // ================================================================
      // ========== 文本节点 — 根据 textSubType 构建不同的 prompt ==========
      // ================================================================
      if (nodeType === 'text') {
        const content = (data.content as string) || upstreamText || '';
        if (!content.trim()) {
          throw new Error('请先输入文本内容。');
        }
        if (!(data.content as string) && upstreamText) {
          get().updateNodeData(nodeId, { content: upstreamText });
        }

        const textSubType = (data.textSubType as string) || 'copywriting';
        let systemPrompt = '';
        let userPrompt = '';

        if (textSubType === 'copywriting') {
          const brandName = (data.brandName as string) || '';
          const tone = (data.copyTone as string) || 'professional';
          const scene = (data.copyScene as string) || 'social';
          const targetLen = (data.targetLength as number) || 200;
          const toneMap: Record<string, string> = { professional: '专业正式', casual: '轻松活泼', luxury: '高端奢华', youthful: '年轻潮流', warm: '温暖走心', humorous: '幽默诙谐' };
          const sceneMap: Record<string, string> = { social: '社交媒体', 'video-ad': '视频广告', print: '平面海报', ecommerce: '电商详情页', push: '推送/短信', slogan: '品牌Slogan' };
          systemPrompt = `你是顶级品牌广告文案策划师。请根据用户提供的品牌/产品信息和核心卖点，撰写${toneMap[tone] || tone}风格的广告文案。目标投放场景：${sceneMap[scene] || scene}。字数控制在${targetLen}字左右。${brandName ? `品牌/产品名：${brandName}。` : ''}请直接输出文案，不要解释。`;
          userPrompt = content;
        } else if (textSubType === 'rewrite') {
          const mode = (data.rewriteMode as string) || 'continue';
          const style = (data.rewriteStyle as string) || 'neutral';
          const modeMap: Record<string, string> = { continue: '续写', rewrite: '改写', polish: '润色', expand: '扩写', compress: '缩写' };
          const styleMap: Record<string, string> = { neutral: '保持原风格', formal: '正式商务', creative: '创意文学', simple: '简洁口语', academic: '学术严谨' };
          systemPrompt = `你是一个专业的文字编辑。请对用户提供的文本进行"${modeMap[mode] || mode}"处理。写作风格要求：${styleMap[style] || style}。请直接输出结果，不要附加说明。`;
          userPrompt = content;
        } else if (textSubType === 'translate') {
          const sourceLang = (data.sourceLang as string) || 'auto';
          const targetLang = (data.targetLang as string) || 'en';
          const translateStyle = (data.translateStyle as string) || 'natural';
          const langMap: Record<string, string> = { auto: '自动检测', zh: '中文', en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语', ar: '阿拉伯语', pt: '葡萄牙语' };
          const styleMap: Record<string, string> = { natural: '自然流畅', literal: '忠于原文', localized: '本地化', marketing: '营销文案风格' };
          systemPrompt = `你是专业翻译官。请将以下文本从${langMap[sourceLang] || sourceLang}翻译为${langMap[targetLang] || targetLang}。翻译风格：${styleMap[translateStyle] || translateStyle}。请只输出翻译结果，不要解释。`;
          userPrompt = content;
        } else if (textSubType === 'keywords') {
          const extractType = (data.extractType as string) || 'keywords';
          const count = (data.extractCount as number) || 10;
          const typeMap: Record<string, string> = { keywords: '关键词', tags: '标签', summary: '摘要', seo: 'SEO 关键词', hashtags: '话题标签(#)' };
          systemPrompt = `你是文本分析专家。请从以下文本中提取${count}个${typeMap[extractType] || extractType}。${extractType === 'summary' ? '输出一段200字以内的摘要。' : '每个关键词用逗号分隔。'}请直接输出结果。`;
          userPrompt = content;
        } else {
          systemPrompt = getTextExpandSystemPrompt();
          userPrompt = `请扩写以下内容：\n\n${content}`;
        }

        const result = await callAIChat({
                    signal: currentAbortSignal(),
          provider, model, apiKey, baseUrl,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: textSubType === 'translate' ? 0.3 : 0.8,
          maxTokens: 2048,
        });

        if (!result.content) throw new Error('AI 返回了空内容，请重试。');

        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, content: result.content, status: 'completed' } }
              : n
          ),
        });

      // ================================================================
      // ========== 脚本节点 ==========
      // ================================================================
      } else if (nodeType === 'script') {
        const sourceText = (data.sourceText as string) || (data.title as string) || upstreamText || '';
        if (!sourceText.trim()) {
          throw new Error('请先输入剧名或源文本。');
        }
        if (!(data.sourceText as string) && upstreamText) {
          get().updateNodeData(nodeId, { sourceText: upstreamText });
        }

        const result = await callAIChat({
                    signal: currentAbortSignal(),
          provider, model, apiKey, baseUrl,
          messages: [
            { role: 'system', content: getScriptSystemPrompt() },
            { role: 'user', content: `请为以下主题创作分镜脚本：\n\n${sourceText}` },
          ],
          temperature: 0.8,
          maxTokens: 4096,
        });

        let scenes = [];
        try {
          let jsonStr = result.content;
          const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) jsonStr = jsonMatch[0];
          scenes = JSON.parse(jsonStr);
        } catch {
          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, sourceText: result.content, status: 'completed' } }
                : n
            ),
          });
          return;
        }

        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, scenes, status: 'completed' } }
              : n
          ),
        });

      // ================================================================
      // ========== AI 处理节点 ==========
      // ================================================================
      } else if (nodeType === 'ai-process') {
        const processType = (data.processType as string) || 'text-expand';
        const prompt = (data.prompt as string) || '';
        const inputText = (data.inputText as string) || upstreamText || '';

        if (!prompt.trim() && !inputText.trim()) {
          throw new Error('请输入提示词或指令。');
        }
        if (!(data.inputText as string) && upstreamText) {
          get().updateNodeData(nodeId, { inputText: upstreamText });
        }

        const userContent = inputText ? `${prompt}\n\n输入文本：${inputText}` : prompt;

        const result = await callAIChat({
                    signal: currentAbortSignal(),
          provider, model, apiKey, baseUrl,
          messages: [
            { role: 'system', content: `你是一个专业的 AI 视频制作助手。当前执行的处理类型是：${processType}。请按照用户指令处理。` },
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
          maxTokens: 4096,
        });

        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, outputText: result.content, status: 'completed' } }
              : n
          ),
        });

      // ================================================================
      // ========== 图片节点 — 根据 imageSubType 决定行为 ==========
      // ================================================================
      } else if (nodeType === 'image') {
        const imageSubType = (data.imageSubType as string) || 'txt2img';

        if (imageSubType === 'txt2img') {
          // --- 文生图：使用 prompt，支持从上游脚本获取分镜描述 ---
          let prompt = (data.prompt as string) || '';
          // 如果上游有分镜数据且本节点无 prompt，按 assignedSceneIndex 分配对应场景
          if (!prompt && upstreamScenes.length > 0) {
            const sceneIdx = Math.min(assignedSceneIndex, upstreamScenes.length - 1);
            const scene = upstreamScenes[sceneIdx];
            prompt = `${scene.sceneDescription || ''}${scene.mood ? '，' + scene.mood + '氛围' : ''}${scene.lighting ? '，' + scene.lighting : ''}`;
          }
          if (!prompt) prompt = upstreamText || '';
          if (!prompt.trim()) throw new Error('请先输入图片提示词再生成。');

          if (!(data.prompt as string)) {
            get().updateNodeData(nodeId, { prompt });
          }

          // 如果用户选了图片风格，附加到 prompt
          const imageStyle = (data.imageStyle as string) || 'auto';
          const styleMap: Record<string, string> = { photographic: 'photographic, realistic', 'digital-art': 'digital art', anime: 'anime style', 'oil-painting': 'oil painting', watercolor: 'watercolor painting', '3d-render': '3D render', 'pixel-art': 'pixel art', cinematic: 'cinematic, film still' };
          const fullPrompt = imageStyle !== 'auto' && styleMap[imageStyle] ? `${prompt}, ${styleMap[imageStyle]}` : prompt;

          const result = await callImageGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt: fullPrompt,
            negativePrompt: (data.negativePrompt as string) || '',
            width: (data.width as number) || 1024,
            height: (data.height as number) || 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, imageUrl: result.imageUrl, revisedPrompt: result.revisedPrompt, status: 'completed' } }
                : n
            ),
          });

        } else if (imageSubType === 'img2img') {
          // --- 图生图：需要参考图 + 变化描述 ---
          const refImage = (data.uploadedImageUrl as string) || upstreamImageUrl || '';
          const prompt = (data.prompt as string) || '将图片风格进行调整';
          if (!refImage) throw new Error('图生图需要上传参考图片或连接上游图片节点。');

          // 大多数图片模型不支持真正的 img2img，用 LLM 把描述补全后走文生图
          const result = await callImageGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt: `Based on reference image, ${prompt}`,
            negativePrompt: (data.negativePrompt as string) || '',
            width: (data.width as number) || 1024,
            height: (data.height as number) || 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, imageUrl: result.imageUrl, status: 'completed' } }
                : n
            ),
          });

        } else if (imageSubType === 'bg-remove') {
          // --- 背景替换/移除：通过 prompt 描述实现 ---
          const bgMode = (data.bgMode as string) || 'remove';
          const refImage = (data.uploadedImageUrl as string) || upstreamImageUrl || '';
          let prompt = '';
          if (bgMode === 'remove') prompt = 'Remove the background, make it transparent, keep only the main subject';
          else if (bgMode === 'white') prompt = 'Replace the background with a pure white background, keep the main subject unchanged';
          else prompt = (data.prompt as string) || 'Replace the background';

          if (!refImage && !prompt.trim()) throw new Error('请上传需要处理背景的图片或描述新背景。');

          const result = await callImageGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt,
            negativePrompt: '',
            width: (data.width as number) || 1024,
            height: (data.height as number) || 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, imageUrl: result.imageUrl, status: 'completed' } }
                : n
            ),
          });

        } else if (imageSubType === 'upscale') {
          // --- 高清放大：暂无原生 upscale API，通过 prompt + 高分辨率实现 ---
          const refImage = (data.uploadedImageUrl as string) || upstreamImageUrl || '';
          const ratio = (data.upscaleRatio as string) || '2x';
          const prompt = (data.prompt as string) || 'High resolution, ultra detailed, sharp focus';
          if (!refImage) throw new Error('请上传需要放大的图片。');

          const baseSize = ratio === '4x' ? 2048 : 1536;
          const result = await callImageGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt: `${prompt}, high resolution enhancement`,
            negativePrompt: 'blurry, low quality, noise, artifacts',
            width: Math.min(baseSize, 2048),
            height: Math.min(baseSize, 2048),
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, imageUrl: result.imageUrl, status: 'completed' } }
                : n
            ),
          });

        } else {
          // 兜底走默认文生图
          const prompt = (data.prompt as string) || upstreamText || '';
          if (!prompt.trim()) throw new Error('请先输入图片提示词。');

          const result = await callImageGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt,
            negativePrompt: (data.negativePrompt as string) || '',
            width: (data.width as number) || 1024,
            height: (data.height as number) || 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, imageUrl: result.imageUrl, status: 'completed' } }
                : n
            ),
          });
        }

      // ================================================================
      // ========== 视频节点 — 根据 videoSubType 决定行为 ==========
      // ================================================================
      } else if (nodeType === 'video') {
        // 未显式指定子类型时按上游自适应：
        // 有图片/分镜 → 图生视频，否则 → 文生视频。
        const videoSubType = (data.videoSubType as string) ||
          (upstreamImageUrl || upstreamScenes.length > 0 ? 'img2vid' : 'txt2vid');

        if (videoSubType === 'txt2vid') {
          // --- 文生视频 ---
          let prompt = (data.prompt as string) || '';
          // 从上游脚本分镜获取描述，按 assignedSceneIndex 分配
          if (!prompt && upstreamScenes.length > 0) {
            const sceneIdx = Math.min(assignedSceneIndex, upstreamScenes.length - 1);
            const scene = upstreamScenes[sceneIdx];
            prompt = `${scene.sceneDescription || ''}${scene.cameraMovement ? '，镜头' + scene.cameraMovement : ''}`;
          }
          if (!prompt) prompt = upstreamText || '';
          if (!prompt.trim()) throw new Error('请先输入视频描述再生成。');

          if (!(data.prompt as string)) get().updateNodeData(nodeId, { prompt });

          // 附加运镜信息到 prompt
          const cam = (data.cameraMovement as string) || 'auto';
          const camMap: Record<string, string> = { static: 'static shot', 'push-in': 'push in, dolly in', 'pull-out': 'pull out, dolly out', 'pan-left': 'pan left', 'pan-right': 'pan right', 'crane-up': 'crane up', 'crane-down': 'crane down', orbit: 'orbit shot' };
          const fullPrompt = cam !== 'auto' && camMap[cam] ? `${prompt}, camera: ${camMap[cam]}` : prompt;

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, statusDetail: '正在提交任务...' } } : n
            ),
          });

          const result = await callVideoGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt: fullPrompt,
            imageUrl: '',
            duration: (data.duration as number) || 5,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, videoUrl: result.videoUrl, coverUrl: result.coverUrl, status: 'completed', statusDetail: '' } }
                : n
            ),
          });

        } else if (videoSubType === 'img2vid') {
          // --- 首帧生视频 ---
          const imageUrl = (data.referenceImageUrl as string) || upstreamImageUrl || '';
          const prompt = (data.prompt as string) || upstreamText || '画面缓缓运动';
          if (!imageUrl) throw new Error('首帧生视频需要上传首帧图片或连接上游图片节点。');

          if (!(data.referenceImageUrl as string) && upstreamImageUrl) {
            get().updateNodeData(nodeId, { referenceImageUrl: upstreamImageUrl });
          }

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, statusDetail: '正在提交首帧生视频任务...' } } : n
            ),
          });

          const result = await callVideoGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt,
            imageUrl,
            duration: (data.duration as number) || 5,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, videoUrl: result.videoUrl, coverUrl: result.coverUrl, status: 'completed', statusDetail: '' } }
                : n
            ),
          });

        } else if (videoSubType === 'concat') {
          // --- 视频片段拼接：纯前端无法做真正的视频合并，收集 URL 列表并标记 ---
          const clips = (data.videoClips as string[]) || [];
          // 也收集上游视频节点的输出
          const allClips = [...clips, ...upstreamVideoUrls].filter(Boolean);
          if (allClips.length === 0) throw new Error('请添加至少一个视频片段，或连接上游视频节点。');

          // 保存收集到的全部片段
          get().updateNodeData(nodeId, { videoClips: allClips });

          // 纯前端标记为完成，实际拼接在导出面板处理
          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, videoUrl: allClips[0], videoClips: allClips, status: 'completed', statusDetail: `已收集 ${allClips.length} 个视频片段` } }
                : n
            ),
          });

        } else if (videoSubType === 'style-transfer') {
          // --- 风格转绘：通过 prompt 加上风格描述走视频生成 ---
          const targetStyle = (data.targetStyle as string) || 'anime';
          const strength = (data.styleStrength as number) || 0.7;
          const prompt = (data.prompt as string) || '';
          const styleMap: Record<string, string> = { anime: 'anime style', 'oil-painting': 'oil painting style', watercolor: 'watercolor painting', sketch: 'pencil sketch', cyberpunk: 'cyberpunk neon style', ghibli: 'Studio Ghibli style', pixel: 'pixel art style', comic: 'comic book style' };
          const styleDesc = styleMap[targetStyle] || targetStyle;
          const fullPrompt = `Transform the scene into ${styleDesc}${strength > 0.7 ? ', strong style effect' : ''}. ${prompt}`;

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, statusDetail: '正在提交风格转绘任务...' } } : n
            ),
          });

          const result = await callVideoGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt: fullPrompt,
            imageUrl: '',
            duration: (data.duration as number) || 5,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, videoUrl: result.videoUrl, coverUrl: result.coverUrl, status: 'completed', statusDetail: '' } }
                : n
            ),
          });

        } else {
          // 兜底走默认文生视频
          const prompt = (data.prompt as string) || upstreamText || '';
          if (!prompt.trim()) throw new Error('请先输入视频描述再生成。');

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, statusDetail: '正在提交任务...' } } : n
            ),
          });

          const result = await callVideoGeneration({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            prompt,
            imageUrl: (data.referenceImageUrl as string) || '',
            duration: (data.duration as number) || 5,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, videoUrl: result.videoUrl, coverUrl: result.coverUrl, status: 'completed', statusDetail: '' } }
                : n
            ),
          });
        }

      // ================================================================
      // ========== 音频节点 — 根据 audioSubType 决定行为 ==========
      // ================================================================
      } else if (nodeType === 'audio') {
        const audioSubType = (data.audioSubType as string) || 'tts';
        const prompt = (data.prompt as string) || upstreamText || '';

        if (audioSubType === 'tts') {
          if (!prompt.trim()) throw new Error('请先输入要合成的语音文案。');
          if (!(data.prompt as string) && upstreamText) {
            get().updateNodeData(nodeId, { prompt: upstreamText });
          }

          const result = await callTTS({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            text: prompt,
            voice: (data.voice as string) || undefined,
            speed: (data.speed as number) || 1.0,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, audioUrl: result.audioUrl, status: 'completed' } }
                : n
            ),
          });

        } else if (audioSubType === 'bgm') {
          // BGM 生成：TTS API 不支持音乐，用 LLM 生成描述后存入结果说明
          const mood = (data.bgmMood as string) || 'upbeat';
          const duration = (data.bgmDuration as number) || 30;
          const moodMap: Record<string, string> = { upbeat: '欢快明亮', calm: '平静舒缓', dramatic: '紧张戏剧', emotional: '感人深情', epic: '史诗壮阔', mysterious: '神秘悬疑' };

          if (!prompt.trim()) throw new Error('请先描述你想要的背景音乐风格。');

          // 使用 LLM 生成详细的音乐提示词
          const result = await callAIChat({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            messages: [
              { role: 'system', content: '你是一名音乐制作顾问。请根据用户描述生成一段专业的背景音乐创作指引，包括曲风、乐器、节奏BPM、情绪变化。直接输出指引。' },
              { role: 'user', content: `为视频创作一段${duration}秒的${moodMap[mood] || mood}风格背景音乐。用户描述：${prompt}` },
            ],
            temperature: 0.7,
            maxTokens: 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, outputText: result.content, status: 'completed', statusDetail: 'BGM 音乐方案已生成（需要接入音乐生成API后可直接生成音频）' } }
                : n
            ),
          });

        } else if (audioSubType === 'sfx') {
          // SFX 音效：同理用 LLM 生成音效方案
          const category = (data.sfxCategory as string) || 'general';
          if (!prompt.trim()) throw new Error('请先描述需要的音效。');

          const result = await callAIChat({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            messages: [
              { role: 'system', content: '你是专业的拟音师和音效设计师。请根据用户描述，生成音效设计方案：包括具体音效列表、时间点、音量大小、推荐的音效素材库资源。直接输出方案。' },
              { role: 'user', content: `场景类型：${category}。需要的音效：${prompt}` },
            ],
            temperature: 0.7,
            maxTokens: 1024,
          });

          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, outputText: result.content, status: 'completed', statusDetail: '音效方案已生成' } }
                : n
            ),
          });

        } else {
          // 兜底走 TTS
          if (!prompt.trim()) throw new Error('请先输入文案内容。');
          const result = await callTTS({
                      signal: currentAbortSignal(),
            provider, model, apiKey, baseUrl,
            text: prompt,
            voice: (data.voice as string) || undefined,
            speed: (data.speed as number) || 1.0,
          });
          guardedSet({
            nodes: get().nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, audioUrl: result.audioUrl, status: 'completed' } }
                : n
            ),
          });
        }

      } else {
        // 其他未知类型节点 - 标记完成
        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, status: 'completed' } } : n
          ),
        });
      }

      // 统一标记「只产出文字方案 / URL 列表」的节点。
      // 这些子类型没有对应的生成能力（音乐生成、视频合成、分镜网格），
      // 实际结果不是音频或成片。打上标记后节点卡片会显示「方案」，
      // 计划类子类型不标记为可下载素材。
      const subType = (data.imageSubType || data.videoSubType ||
        data.audioSubType || data.processType || data.textSubType) as string | undefined;
      const PLAN_ONLY = new Set([
        'bgm', 'sfx', 'concat',
        'storyboard-grid-9', 'storyboard-grid-25', 'story-extrapolate',
      ]);
      if (subType && PLAN_ONLY.has(subType)) {
        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, outputKind: 'plan' } } : n
          ),
        });
      }
    } catch (error) {
      // 用户主动取消：不标红报错，回到未执行状态
      if (isAbortError(error)) {
        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, status: 'idle', errorMessage: undefined } }
              : n
          ),
        });
        return;
      }
      const errMsg = error instanceof Error ? error.message : '生成失败，请重试';
      const pendingInfo = error as {
        isPendingVideoTask?: boolean; taskId?: string;
        provider?: string; model?: string; submittedAt?: string;
      };
      if (pendingInfo?.isPendingVideoTask && pendingInfo.taskId) {
        guardedSet({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: {
                  ...n.data, status: 'idle', errorMessage: undefined,
                  statusDetail: '任务已提交，可在执行面板查询结果',
                  pendingTask: {
                    taskId: pendingInfo.taskId,
                    provider: pendingInfo.provider,
                    model: pendingInfo.model,
                    submittedAt: pendingInfo.submittedAt,
                  },
                } }
              : n
          ),
        });
        return;
      }
      guardedSet({
        nodes: get().nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, status: 'error', errorMessage: errMsg } }
            : n
        ),
      });
    }
  },

  resumePendingTask: async (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    const task = (node?.data as Record<string, unknown>)?.pendingTask as {
      taskId: string; provider: string; model: string;
    } | undefined;
    if (!task) return;
    const { callVideoGeneration, resumeVideoTask } = await import('@/services/ai-service');
    void callVideoGeneration;
    const { useModelStore } = await import('@/stores/model-store');
    const modelState = useModelStore.getState();
    const service = modelState.getApiKeyForProvider(task.provider);
    if (!service?.baseUrl) throw new Error('该任务所属服务尚未配置，无法查询');
    const result = await resumeVideoTask({
      taskId: task.taskId,
      provider: task.provider,
      model: task.model,
      apiKey: modelState.getPlainApiKey(task.provider) ?? '',
      baseUrl: service.baseUrl,
    });
    set({
      nodes: get().nodes.map((n) => n.id === nodeId
        ? { ...n, data: { ...n.data, videoUrl: result.videoUrl, coverUrl: result.coverUrl,
            status: 'completed', statusDetail: '', pendingTask: undefined } }
        : n),
    });
  },

  cancelExecution: () => {
    // 真正中断进行中的 HTTP 请求。
    // 中断进行中的 HTTP 请求与异步轮询，使结果不写回画布。
    executionAbortController?.abort();
    executionAbortController = null;
    // 使进行中的异步结果失效
    executionGeneration++;

    set({
      isExecuting: false,
      executionTasks: get().executionTasks.map((t) =>
        t.status === 'running' || t.status === 'pending'
          ? { ...t, status: 'failed', error: '用户取消' }
          : t
      ),
      nodes: get().nodes.map((n) =>
        (n.data as Record<string, unknown>).status === 'running'
          ? { ...n, data: { ...n.data, status: 'idle' } }
          : n
      ),
    });
  },

  getNodeExecutionStatus: (nodeId: string) => {
    const task = get().executionTasks.find((t) => t.nodeId === nodeId);
    return task?.status;
  },

  // ==== Version History ====
  versions: [],

  saveVersion: (name: string, projectId?: string) => {
    const { nodes, edges, versions } = get();
    const version = {
      id: generateId(),
      name,
      snapshot: { nodes: structuredClone(nodes), edges: structuredClone(edges) },
      createdAt: new Date().toISOString(),
      projectId,
    };
    set({ versions: [version, ...versions] });
  },

  loadVersion: (versionId: string) => {
    const version = get().versions.find((v) => v.id === versionId);
    if (!version) return;
    set({
      nodes: structuredClone(version.snapshot.nodes),
      edges: structuredClone(version.snapshot.edges),
      selectedNodeId: null,
    });
    get().pushHistory();
  },

  deleteVersion: (versionId: string) => {
    set({ versions: get().versions.filter((v) => v.id !== versionId) });
  },
}),
{
  name: 'videobuddy-workflow',

  storage: createWorkspaceStorage(),
  partialize: (state) => ({ versions: state.versions }),
}
)
);
