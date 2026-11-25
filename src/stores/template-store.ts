import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkflowTemplate, WorkflowData } from '@/types';
import { generateId } from '@/lib/utils';
import { useModelStore } from '@/stores/model-store';
import { getCurrentUserId } from '@/lib/current-user';
import { fillNodeSubTypes, layoutWorkflow } from '@/lib/workflow-layout';

/**
 * 模板节点规范化。
 *
 * 内置模板的数据里没有 provider/model/videoSubType，靠执行引擎运行时兜底
 * 很脆弱：一旦从备份导入、外部构造数据或换入口，就会因缺模型被前置校验拦下，
 * 视频节点还会因没有提示词而失败。使用模板时统一在这里补齐。
 */
export function normalizeTemplateWorkflow(wf: WorkflowData): WorkflowData {
  const { getDefaultModel } = useModelStore.getState();
  const nodes = wf.nodes.map((n) => {
    const d = (n.data || {}) as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (!d.provider || !d.model) {
      const type = (n.type || 'text') as string;
      const modelType = (type === 'script' || type === 'ai-process' ? 'text' : type) as
        | 'text' | 'image' | 'video' | 'audio';
      const dm = getDefaultModel(modelType);
      if (dm) {
        patch.provider = dm.provider;
        patch.model = dm.model;
        patch.serviceId = dm.serviceId;
      }
    }
    return Object.keys(patch).length > 0 ? { ...n, data: { ...d, ...patch } } : n;
  });

  type MutableNode = {
    id: string; type?: string | null;
    position: { x: number; y: number };
    data?: Record<string, unknown>;
  };
  const mutable = nodes as unknown as MutableNode[];
  // 补齐子类型，让属性面板显示真实模式；再按依赖分层排版，消除模板坐标重叠
  const normalized = layoutWorkflow(fillNodeSubTypes(mutable, wf.edges), wf.edges);
  return { ...wf, nodes: normalized as unknown as WorkflowData['nodes'] };
}

interface TemplateStore {
  templates: WorkflowTemplate[];
  addTemplate: (name: string, description: string, category: string, workflowData: WorkflowData, isPublic?: boolean) => WorkflowTemplate;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => WorkflowTemplate | undefined;
  getTemplatesByCategory: (category: string) => WorkflowTemplate[];
  getOfficialTemplates: () => WorkflowTemplate[];
  getPersonalTemplates: () => WorkflowTemplate[];
  incrementUseCount: (id: string) => void;
}

/**
 * 连接规则（workspace-store onConnect）：
 *   text       → text, script, ai-process, image, video, audio
 *   script     → image, video, audio, ai-process
 *   ai-process → text, image, video, audio, ai-process, script
 *   image      → image, video, ai-process
 *   video      → video, ai-process
 *   audio      → video, ai-process
 *
 * 所有模板的 edges 必须严格遵循上述规则。
 */

const PRESET_TEMPLATES: WorkflowTemplate[] = [
  // ===== 官方精选模板 =====

  // 1. 短视频快速出片 ✅ 通过校验
  {
    id: 'tpl-1',
    name: '短视频快速出片',
    description: '文案 → AI扩写 → 分镜脚本 → 分镜图 + 视频 + 配音，一站式短视频制作工作流。适合抖音、快手等平台创作者。',
    category: '短视频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '创意文案', content: '一款面向都市白领的智能健康手环，主打全天候健康监测、轻薄机身与 7 天续航', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 100 }, data: { label: '文案扩写', processType: 'text-expand', prompt: '将创意扩展为完整的短视频脚本', status: 'idle' } },
        { id: 'n3', type: 'script', position: { x: 550, y: 150 }, data: { label: '分镜脚本', title: '', scenes: [], status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 800, y: 80 }, data: { label: '分镜图', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'audio', position: { x: 550, y: 320 }, data: { label: '旁白配音', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'video', position: { x: 800, y: 250 }, data: { label: '视频生成', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → script ✅
        { id: 'e3', source: 'n3', target: 'n4' },  // script → image ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // script → audio ✅
        { id: 'e5', source: 'n4', target: 'n6' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 2. 广告素材批量生成
  {
    id: 'tpl-2',
    name: '广告素材批量生成',
    description: '产品文案 → AI生成多风格广告图 + 广告配音 → 广告视频。适合电商、品牌方批量生产投放素材。',
    category: '广告营销',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '产品卖点', content: '便携冷萃咖啡壶，3 分钟出杯、可随身携带、易清洗；目标用户是 25-35 岁通勤上班族', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 100 }, data: { label: '广告文案生成', processType: 'text-expand', prompt: '根据产品卖点撰写广告文案，包含主标题、副标题和行动号召', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 550, y: 50 }, data: { label: '商务风广告图', prompt: '商务质感产品广告图，简洁大气', width: 1080, height: 1080, status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 550, y: 200 }, data: { label: '潮流风广告图', prompt: '潮流数码艺术风格产品广告图', width: 1080, height: 1080, status: 'idle' } },
        { id: 'n5', type: 'audio', position: { x: 300, y: 300 }, data: { label: '广告配音', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'video', position: { x: 800, y: 150 }, data: { label: '广告视频', prompt: '', duration: 15, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → image ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → image ✅
        { id: 'e4', source: 'n2', target: 'n5' },  // ai-process → audio ✅
        { id: 'e5', source: 'n3', target: 'n6' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 3. 短剧分镜制作
  {
    id: 'tpl-3',
    name: '短剧分镜制作',
    description: '剧本大纲 → AI 生成剧本 → 分镜脚本 → 分镜图 → 视频生成。配音与视频分别导出，平台不做音轨混流。',
    category: '短剧',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 100 }, data: { label: '剧本大纲', content: '都市短剧：一位加班到深夜的产品经理在便利店偶遇多年未见的高中同桌，两人在 10 分钟里重新理解各自的选择。场景：深夜便利店、雨后的街角', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 100 }, data: { label: '剧本生成', processType: 'script-generate', prompt: '基于大纲生成完整微短剧剧本，包含角色对话和场景描写', status: 'idle' } },
        { id: 'n3', type: 'script', position: { x: 550, y: 100 }, data: { label: '分镜脚本', title: '', scenes: [], status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 800, y: 50 }, data: { label: '分镜图', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'audio', position: { x: 550, y: 280 }, data: { label: '角色配音', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'video', position: { x: 800, y: 220 }, data: { label: '视频生成', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → script ✅
        { id: 'e3', source: 'n3', target: 'n4' },  // script → image ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // script → audio ✅
        { id: 'e5', source: 'n4', target: 'n6' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 4. 自媒体封面设计 ✅ 通过校验
  {
    id: 'tpl-4',
    name: '自媒体封面设计',
    description: '主题文案 → 多尺寸封面图。一次输入，同时生成适配微信公众号、抖音、小红书等多平台的封面图片。',
    category: '自媒体',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '标题文案', content: '个人成长类公众号封面，主题：如何把早起坚持 100 天，风格清新克制', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 150 }, data: { label: '文案优化', processType: 'text-expand', prompt: '优化标题，使其更吸引眼球，同时生成适合不同平台的图片描述', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 550, y: 50 }, data: { label: '横版封面 16:9', prompt: '', width: 1280, height: 720, status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 550, y: 200 }, data: { label: '竖版封面 9:16', prompt: '', width: 720, height: 1280, status: 'idle' } },
        { id: 'n5', type: 'image', position: { x: 550, y: 350 }, data: { label: '方形封面 1:1', prompt: '', width: 1080, height: 1080, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → image ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → image ✅
        { id: 'e4', source: 'n2', target: 'n5' },  // ai-process → image ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 5. 有声书/播客可视化 ✅ 通过校验
  {
    id: 'tpl-5',
    name: '有声书/播客可视化',
    description: '文稿 → 语音合成 + 配图生成 → 视频生成。配音与视频分别导出，平台不做音轨混流。',
    category: '音频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '文稿内容', content: '一期 30 分钟的播客，聊城市夜跑文化：为什么越来越多人在深夜出门跑步，以及跑者社群如何形成', status: 'idle' } },
        { id: 'n2', type: 'audio', position: { x: 300, y: 80 }, data: { label: '语音合成', prompt: '', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 300, y: 250 }, data: { label: '配图生成', prompt: '', status: 'idle' } },
        { id: 'n4', type: 'video', position: { x: 550, y: 150 }, data: { label: '视频生成', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → audio ✅
        { id: 'e2', source: 'n1', target: 'n3' },  // text → image ✅
        { id: 'e4', source: 'n3', target: 'n4' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 6. 产品宣传片制作 ✅ 通过校验
  {
    id: 'tpl-6',
    name: '产品宣传片制作',
    description: '产品介绍 → AI脚本 → 分镜 → 渲染图 + 配音 → 高质量宣传视频。适合企业产品发布、展会等场景。',
    category: '广告营销',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 100 }, data: { label: '产品介绍', content: '请描述你的产品核心卖点和目标受众...', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 50 }, data: { label: '脚本生成', processType: 'script-generate', prompt: '生成一段60秒的产品宣传视频脚本', status: 'idle' } },
        { id: 'n3', type: 'script', position: { x: 550, y: 100 }, data: { label: '分镜脚本', title: '', scenes: [], status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 800, y: 50 }, data: { label: '产品渲染图', prompt: '', width: 1920, height: 1080, status: 'idle' } },
        { id: 'n5', type: 'audio', position: { x: 550, y: 280 }, data: { label: '旁白配音', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'video', position: { x: 800, y: 200 }, data: { label: '宣传视频', prompt: '', duration: 60, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → script ✅
        { id: 'e3', source: 'n3', target: 'n4' },  // script → image ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // script → audio ✅
        { id: 'e5', source: 'n4', target: 'n6' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 7. 知识科普短视频 ✅ 通过校验
  {
    id: 'tpl-7',
    name: '知识科普短视频',
    description: '知识点 → AI通俗化讲解 → 配图 + 配音 → 科普视频。适合教育类自媒体和知识付费场景。',
    category: '短视频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '知识点', content: '为什么天空在傍晚是橙红色：瑞利散射、太阳高度角与大气路径长度的关系', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 80 }, data: { label: '通俗化改写', processType: 'text-expand', prompt: '将知识点改写为大众容易理解的口语化讲解', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 550, y: 50 }, data: { label: '科普配图', prompt: '', status: 'idle' } },
        { id: 'n4', type: 'audio', position: { x: 550, y: 220 }, data: { label: '讲解配音', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'video', position: { x: 800, y: 130 }, data: { label: '科普视频', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → image ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → audio ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 8. 电商种草视频 ✅ 通过校验
  {
    id: 'tpl-8',
    name: '电商种草视频',
    description: '商品卖点 → 种草文案 → 产品图 + 口播配音 → 种草短视频。适合小红书种草笔记、抖音带货视频。',
    category: '广告营销',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 100 }, data: { label: '商品卖点', content: '一款可折叠的桌面补光灯，三档色温、USB-C 充电、夹式设计，适合居家办公与直播', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 100 }, data: { label: '种草文案', processType: 'text-expand', prompt: '写一段吸引人的种草文案，突出使用场景和效果', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 550, y: 50 }, data: { label: '产品展示图', prompt: '', status: 'idle' } },
        { id: 'n4', type: 'audio', position: { x: 550, y: 200 }, data: { label: '口播配音', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'video', position: { x: 800, y: 120 }, data: { label: '种草视频', prompt: '', duration: 30, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → image ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → audio ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 9. 剧情推演创作
  {
    id: 'tpl-9',
    name: '剧情推演创作',
    description: '故事种子 → 双线剧情推演 → 各自分镜 → 各自视频预览。适合互动叙事、多结局短剧创作。',
    category: '短剧',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '故事种子', content: '近未来海岛小镇，一名修理旧机器人的少女收到一封来自 20 年前、署名是自己母亲的维修委托', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 50 }, data: { label: '剧情线A·治愈', processType: 'custom-prompt', prompt: '基于故事种子发展温暖治愈向的剧情，包含完整的起承转合', status: 'idle' } },
        { id: 'n3', type: 'ai-process', position: { x: 300, y: 250 }, data: { label: '剧情线B·悬疑', processType: 'custom-prompt', prompt: '基于故事种子发展悬疑反转向的剧情，制造意想不到的结局', status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 550, y: 50 }, data: { label: '线A场景图', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'image', position: { x: 550, y: 250 }, data: { label: '线B场景图', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'video', position: { x: 800, y: 50 }, data: { label: '线A视频', prompt: '', status: 'idle' } },
        { id: 'n7', type: 'video', position: { x: 800, y: 250 }, data: { label: '线B视频', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n1', target: 'n3' },  // text → ai-process ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → image ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // ai-process → image ✅
        { id: 'e5', source: 'n4', target: 'n6' },  // image → video ✅
        { id: 'e6', source: 'n5', target: 'n7' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 10. 多语言配音视频
  {
    id: 'tpl-10',
    name: '多语言配音视频',
    description: '中文脚本 → 翻译英文/日文 → 三语配音 + 独立视频。配音与视频分别导出，平台不做音轨混流。',
    category: '音频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 150 }, data: { label: '中文脚本', content: '一段 60 秒的智能家居中控屏产品介绍：15.6 寸触控屏、全屋设备联动、语音控制、离家自动布防', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 50 }, data: { label: '翻译英文', processType: 'custom-prompt', prompt: '将以下中文脚本翻译为地道的英文', status: 'idle' } },
        { id: 'n3', type: 'ai-process', position: { x: 300, y: 250 }, data: { label: '翻译日文', processType: 'custom-prompt', prompt: '将以下中文脚本翻译为地道的日文', status: 'idle' } },
        { id: 'n4', type: 'audio', position: { x: 550, y: 50 }, data: { label: '英文配音', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'audio', position: { x: 550, y: 150 }, data: { label: '中文配音', prompt: '', status: 'idle' } },
        { id: 'n6', type: 'audio', position: { x: 550, y: 250 }, data: { label: '日文配音', prompt: '', status: 'idle' } },
        { id: 'n7', type: 'image', position: { x: 300, y: 400 }, data: { label: '视频封面', prompt: '', status: 'idle' } },
        { id: 'n8', type: 'video', position: { x: 800, y: 150 }, data: { label: '成片视频', prompt: '根据画面与旁白生成一段视频', duration: 60, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n1', target: 'n3' },  // text → ai-process ✅
        { id: 'e3', source: 'n1', target: 'n5' },  // text → audio ✅
        { id: 'e4', source: 'n2', target: 'n4' },  // ai-process → audio ✅
        { id: 'e5', source: 'n3', target: 'n6' },  // ai-process → audio ✅
        { id: 'e6', source: 'n1', target: 'n7' },  // text → image ✅
        { id: 'e7', source: 'n7', target: 'n8' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // ===== 新增模板 =====

  // 11. AI 图片风格转绘
  {
    id: 'tpl-11',
    name: '图片驱动的动画视频',
    description: '输入画面描述生成图片 → AI 提炼画面内容 → 生成动画视频片段。图生图不传原图，按文字描述重绘。',
    category: '自媒体',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'image', position: { x: 50, y: 150 }, data: { label: '原始图片', prompt: '上传或生成原始图片', status: 'idle' } },
        { id: 'n2', type: 'image', position: { x: 350, y: 50 }, data: { label: '动漫风格', prompt: '将图片转为精美的日系动漫风格', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 350, y: 180 }, data: { label: '油画风格', prompt: '将图片转为古典油画风格', status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 350, y: 310 }, data: { label: '水彩风格', prompt: '将图片转为清新水彩画风格', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // image → image ✅
        { id: 'e2', source: 'n1', target: 'n3' },  // image → image ✅
        { id: 'e3', source: 'n1', target: 'n4' },  // image → image ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 12. Vlog 剪辑助手
  {
    id: 'tpl-12',
    name: 'Vlog 旁白配音生成',
    description: '输入 Vlog 主题 → AI 生成旁白文案 → 语音合成 + 背景封面 → 视频片段。配音与视频分别导出。',
    category: '短视频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 120 }, data: { label: 'Vlog 主题', content: '周末探店：在老城区找一家开了三十年的手工面馆，记录从清晨备料到第一碗面出锅的过程', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 120 }, data: { label: '旁白文案', processType: 'text-expand', prompt: '为 Vlog 写一段轻松自然的旁白文案，有真实感和代入感', status: 'idle' } },
        { id: 'n3', type: 'audio', position: { x: 550, y: 50 }, data: { label: '旁白配音', prompt: '', status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 550, y: 220 }, data: { label: 'Vlog 封面', prompt: '', width: 1920, height: 1080, status: 'idle' } },
        { id: 'n5', type: 'video', position: { x: 800, y: 120 }, data: { label: 'Vlog 视频', prompt: '', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → audio ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → image ✅
        { id: 'e5', source: 'n4', target: 'n5' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 13. 新闻快讯视频
  {
    id: 'tpl-13',
    name: '新闻快讯视频',
    description: '新闻稿 → AI 精简摘要 → 配图 + 播报配音 → 快讯视频。适合自媒体做热点新闻速报、资讯类内容。',
    category: '短视频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 130 }, data: { label: '新闻原稿', content: '粘贴或输入新闻稿件内容...', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 130 }, data: { label: '精简摘要', processType: 'custom-prompt', prompt: '将新闻稿精简为60秒以内的播报稿，保留核心信息，语言简洁有力', status: 'idle' } },
        { id: 'n3', type: 'image', position: { x: 550, y: 50 }, data: { label: '新闻配图', prompt: '', width: 1920, height: 1080, status: 'idle' } },
        { id: 'n4', type: 'audio', position: { x: 550, y: 230 }, data: { label: '新闻播报', prompt: '', status: 'idle' } },
        { id: 'n5', type: 'video', position: { x: 800, y: 130 }, data: { label: '快讯视频', prompt: '', duration: 30, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → image ✅
        { id: 'e3', source: 'n2', target: 'n4' },  // ai-process → audio ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 14. 图生视频（首帧驱动）
  {
    id: 'tpl-14',
    name: '图片转视频动画',
    description: '上传一张图片 → AI 描述画面 → 首帧生成视频动画。适合将静态插画、照片变成动态视频。',
    category: '短视频',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'image', position: { x: 50, y: 130 }, data: { label: '原始图片', prompt: '雨后的老城区石板路，傍晚暖光，一位撑伞的行人背影，电影感构图', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 60 }, data: { label: 'AI 画面描述', processType: 'custom-prompt', prompt: '请描述这张图片的画面内容，包括主体、环境、光照和氛围，用于视频生成', status: 'idle' } },
        { id: 'n3', type: 'video', position: { x: 550, y: 60 }, data: { label: '动画视频', prompt: '根据图片内容生成动画视频', duration: 5, status: 'idle' } },
        { id: 'n4', type: 'video', position: { x: 300, y: 220 }, data: { label: '慢镜视频', prompt: '缓慢推进镜头，画面细节逐渐展现', duration: 5, status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // image → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → video ✅
        { id: 'e3', source: 'n1', target: 'n4' },  // image → video ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },

  // 15. 故事绘本制作
  {
    id: 'tpl-15',
    name: '故事绘本制作',
    description: '故事主题 → AI 生成完整故事 → 分镜脚本 → 逐场景配图。适合儿童绘本、连环画、图文故事创作。',
    category: '自媒体',
    thumbnailUrl: '',
    workflowData: {
      nodes: [
        { id: 'n1', type: 'text', position: { x: 50, y: 130 }, data: { label: '故事主题', content: '绘本故事：小兔子沿着月光河寻找会唱歌的蓝色石头，途中遇见三位性格不同的朋友', status: 'idle' } },
        { id: 'n2', type: 'ai-process', position: { x: 300, y: 130 }, data: { label: '故事生成', processType: 'script-generate', prompt: '生成一个适合绘本的完整故事，分为5-8个场景，每个场景有画面描述和旁白文字', status: 'idle' } },
        { id: 'n3', type: 'script', position: { x: 550, y: 130 }, data: { label: '绘本分镜', title: '', scenes: [], status: 'idle' } },
        { id: 'n4', type: 'image', position: { x: 800, y: 50 }, data: { label: '绘本插图1', prompt: '清新水彩风格绘本插图', status: 'idle' } },
        { id: 'n5', type: 'image', position: { x: 800, y: 200 }, data: { label: '绘本插图2', prompt: '清新水彩风格绘本插图', status: 'idle' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },  // text → ai-process ✅
        { id: 'e2', source: 'n2', target: 'n3' },  // ai-process → script ✅
        { id: 'e3', source: 'n3', target: 'n4' },  // script → image ✅
        { id: 'e4', source: 'n3', target: 'n5' },  // script → image ✅
      ],
    },
    isPublic: true,
    useCount: 0,
    createdAt: '', // 内置模板，无创建时间语义
  },
];

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      templates: PRESET_TEMPLATES,

      addTemplate: (name, description, category, workflowData, isPublic = false) => {
        const template: WorkflowTemplate = {
          id: generateId(),
          name,
          description,
          category,
          workflowData,
          isPublic,
          creatorId: getCurrentUserId(),
          useCount: 0,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ templates: [template, ...state.templates] }));
        return template;
      },

      deleteTemplate: (id) => {
        // 不允许删除官方模板
        const t = get().templates.find((t) => t.id === id);
        if (t?.id.startsWith('tpl-')) return;
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
      },

      getTemplate: (id) => {
        return get().templates.find((t) => t.id === id);
      },

      getTemplatesByCategory: (category) => {
        if (category === 'all') return get().templates;
        if (category === 'official') return get().templates.filter((t) => t.isPublic);
        if (category === 'personal') return get().templates.filter((t) => !t.isPublic);
        return get().templates.filter((t) => t.category === category);
      },

      getOfficialTemplates: () => {
        return get().templates.filter((t) => t.isPublic);
      },

      getPersonalTemplates: () => {
        return get().templates.filter((t) => !t.isPublic);
      },

      incrementUseCount: (id) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, useCount: t.useCount + 1 } : t
          ),
        }));
      },
    }),
    {
    name: 'videobuddy-templates',
    storage: createWorkspaceStorage(),
    // 官方模板始终以代码里的 PRESET_TEMPLATES 为准。
    // 官方模板以代码定义为准；个人模板与使用次数单独持久化。
    partialize: (state) => ({
      personal: state.templates.filter((t) => !t.isPublic),
      counts: Object.fromEntries(
        state.templates.filter((t) => t.isPublic).map((t) => [t.id, t.useCount])
      ),
    }),
    merge: (persisted, current) => {
      const saved = persisted as {
        personal?: WorkflowTemplate[];
        counts?: Record<string, number>;
        /** 兼容以完整 templates 数组持久化的历史格式，保留个人模板 */
        templates?: WorkflowTemplate[];
      } | undefined;
      if (!saved) return current;

      const legacy = saved.templates || [];
      const legacyCounts = Object.fromEntries(
        legacy.filter((t) => t.isPublic).map((t) => [t.id, t.useCount])
      );
      const personal = saved.personal ?? legacy.filter((t) => !t.isPublic);
      const counts = { ...legacyCounts, ...(saved.counts || {}) };

      const official = PRESET_TEMPLATES.map((t) => ({
        ...t,
        useCount: counts[t.id] ?? 0,
      }));
      return {
        ...current,
        templates: [...official, ...personal],
      };
    },
  }
  )
);
