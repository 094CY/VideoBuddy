/** 布局所需的最小节点结构 */
export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
}

export interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * 按依赖关系自动分层排版，保证节点不重叠。
 *
 * 节点宽度不同（普通 224px、脚本 320px）；按层级分列，列距 360、行距 210，
 * 对两类节点都留出余量。
 */
const COLUMN_GAP = 360;
const ROW_GAP = 210;
const START_X = 60;
const START_Y = 80;

/**
 * 给生成类节点补齐子类型。
 *
 * 模板数据里只有 type，没有 imageSubType / audioSubType / videoSubType，
 * 全靠执行引擎的隐式默认值。把这些值显式写进节点，属性面板才能正确显示
 * 当前模式，用户也才知道自己在改什么。
 */
export function fillNodeSubTypes<
  T extends { id: string; type?: string | null; data?: Record<string, unknown> },
>(nodes: T[], edges: LayoutEdge[]): T[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => {
    const d = (n.data || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (n.type === 'image' && !d.imageSubType) patch.imageSubType = 'txt2img';
    if (n.type === 'audio' && !d.audioSubType) patch.audioSubType = 'tts';
    if (n.type === 'video' && !d.videoSubType) {
      const hasImageUpstream = edges.some((e) => {
        if (e.target !== n.id) return false;
        const src = nodeById.get(e.source);
        return src?.type === 'image' || src?.type === 'script';
      });
      patch.videoSubType = hasImageUpstream ? 'img2vid' : 'txt2vid';
    }

    return Object.keys(patch).length > 0
      ? { ...n, data: { ...d, ...patch } }
      : n;
  });
}

export function layoutWorkflow<T extends LayoutNode>(nodes: T[], edges: LayoutEdge[]): T[] {
  if (nodes.length === 0) return nodes;

  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
    const list = outgoing.get(e.source) || [];
    list.push(e.target);
    outgoing.set(e.source, list);
  }

  // 拓扑分层：节点所在列 = 所有上游列的最大值 + 1
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => (indegree.get(n.id) || 0) === 0).map((n) => n.id);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of outgoing.get(id) || []) {
      layer.set(next, Math.max(layer.get(next) || 0, (layer.get(id) || 0) + 1));
      queue.push(next);
    }
  }

  const columns = new Map<number, string[]>();
  for (const n of nodes) {
    const col = layer.get(n.id) ?? 0;
    const list = columns.get(col) || [];
    list.push(n.id);
    columns.set(col, list);
  }

  const position = new Map<string, { x: number; y: number }>();
  for (const [col, ids] of columns) {
    ids.forEach((id, row) => {
      position.set(id, { x: START_X + col * COLUMN_GAP, y: START_Y + row * ROW_GAP });
    });
  }

  return nodes.map((n) => ({ ...n, position: position.get(n.id) || n.position }));
}
