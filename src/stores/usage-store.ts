import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---- 单条 API 调用记录 ----
export interface ApiCallRecord {
  id: string;
  /** ISO 时间戳 */
  timestamp: string;
  /** 调用类型：chat / image / video / tts */
  callType: 'chat' | 'image' | 'video' | 'tts';
  /** 供应商 ID，如 openai / zhipu / kling */
  provider: string;
  /** 供应商显示名称 */
  providerName: string;
  /** 模型 ID */
  model: string;
  /** 模型显示名称 */
  modelName: string;
  /** Token 消耗（文本类有值，图片/视频/TTS 为 0） */
  tokensUsed: number;
  /** 预估费用 USD */
  /** 是否成功 */
  success: boolean;
  /** 关联的节点 ID（可选） */
  nodeId?: string;
  /** 关联的项目 ID（可选） */
  projectId?: string;
}

// ---- 单次工作流执行记录 ----
export interface WorkflowExecutionRecord {
  id: string;
  timestamp: string;
  /** 项目 ID */
  projectId?: string;
  /** 参与的节点数 */
  nodeCount: number;
  /** 是否成功完成 */
  success: boolean;
  /** 总耗时毫秒 */
  durationMs: number;
}

// ---- 统计摘要（按需计算） ----
export interface UsageSummary {
  totalProjects: number;
  totalNodes: number;
  totalExecutions: number;
  totalApiCalls: number;
}

export interface MonthlyUsage {
  month: string;       // "YYYY-MM"
  apiCalls: number;
  executions: number;
  tokensUsed: number;
}

export interface ModelUsageAggregate {
  model: string;       // 显示名称
  provider: string;    // 供应商显示名称
  calls: number;
  tokens: number;
}

/**
 * 用量只记录真实发生的调用次数与 Token 数。
 * 平台不内置任何价格表：编造的单价会让「费用」看起来像账单，属于误导。
 */

// ---- 辅助：生成唯一 ID ----
let _counter = 0;
function usageId(): string {
  _counter++;
  return `u-${Date.now()}-${_counter}`;
}

// ---- Store 接口 ----
interface UsageStore {
  apiCallRecords: ApiCallRecord[];
  executionRecords: WorkflowExecutionRecord[];

  /** 记录一次 API 调用 */
  recordApiCall: (params: {
    callType: 'chat' | 'image' | 'video' | 'tts';
    provider: string;
    providerName: string;
    model: string;
    modelName: string;
    tokensUsed: number;
    success: boolean;
    nodeId?: string;
    projectId?: string;
  }) => void;

  /** 记录一次工作流执行 */
  recordExecution: (params: {
    projectId?: string;
    nodeCount: number;
    success: boolean;
    durationMs: number;
  }) => void;

  /** 获取按月汇总数据（最近 N 个月） */
  getMonthlyUsage: (months?: number) => MonthlyUsage[];

  /** 获取按模型汇总数据 */
  getModelUsage: () => ModelUsageAggregate[];

  /** 获取总费用 */

  /** 清空所有记录 */
  clearAllRecords: () => void;
}

export const useUsageStore = create<UsageStore>()(
  persist(
    (set, get) => ({
      apiCallRecords: [],
      executionRecords: [],

      recordApiCall: (params) => {
        const record: ApiCallRecord = {
          id: usageId(),
          timestamp: new Date().toISOString(),
          callType: params.callType,
          provider: params.provider,
          providerName: params.providerName,
          model: params.model,
          modelName: params.modelName,
          tokensUsed: params.tokensUsed,
          success: params.success,
          nodeId: params.nodeId,
          projectId: params.projectId,
        };
        set((state) => ({
          apiCallRecords: [...state.apiCallRecords, record],
        }));
      },

      recordExecution: (params) => {
        const record: WorkflowExecutionRecord = {
          id: usageId(),
          timestamp: new Date().toISOString(),
          projectId: params.projectId,
          nodeCount: params.nodeCount,
          success: params.success,
          durationMs: params.durationMs,
        };
        set((state) => ({
          executionRecords: [...state.executionRecords, record],
        }));
      },

      getMonthlyUsage: (months = 6) => {
        const { apiCallRecords, executionRecords } = get();
        const now = new Date();
        const buckets: Record<string, MonthlyUsage> = {};

        // 初始化最近 N 个月的桶
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets[key] = { month: key, apiCalls: 0, executions: 0, tokensUsed: 0 };
        }

        // 聚合 API 调用
        for (const r of apiCallRecords) {
          const d = new Date(r.timestamp);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (buckets[key]) {
            buckets[key].apiCalls++;
            buckets[key].tokensUsed += r.tokensUsed;
          }
        }

        // 聚合执行次数
        for (const r of executionRecords) {
          const d = new Date(r.timestamp);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (buckets[key]) {
            buckets[key].executions++;
          }
        }

        return Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month));
      },

      getModelUsage: () => {
        const { apiCallRecords } = get();
        const map = new Map<string, ModelUsageAggregate>();

        for (const r of apiCallRecords) {
          const key = `${r.provider}:${r.model}`;
          if (!map.has(key)) {
            map.set(key, {
              model: r.modelName || r.model,
              provider: r.providerName || r.provider,
              calls: 0,
              tokens: 0,
            });
          }
          const agg = map.get(key)!;
          agg.calls++;
          agg.tokens += r.tokensUsed;
        }

        return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
      },



      clearAllRecords: () => {
        set({ apiCallRecords: [], executionRecords: [] });
      },
    }),
    {
      name: 'videobuddy-usage',

      storage: createWorkspaceStorage(),
    }
  )
);
