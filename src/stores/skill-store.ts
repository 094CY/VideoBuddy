/**
 * 技能 Store — 全局技能状态管理
 * 供技能库页面、Dashboard 对话框、画布等多处使用
 */
import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── 技能分类 ───
export type SkillCategory = 'all' | 'video' | 'image' | 'text' | 'audio' | 'workflow';

// ─── 技能定义（不含 React 组件，纯数据） ───
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  longDesc: string;
  category: Exclude<SkillCategory, 'all'>;
  iconBg: string;
  iconName: string;        // lucide 图标名，渲染时映射
  installed: boolean;
  enabled: boolean;
  uses: number;
  featured?: boolean;
  tags: string[];
  inputPlaceholder: string;
  /** 映射到 Dashboard 的 outputType */
  outputType: 'video' | 'image' | 'text' | 'audio';
  /** 执行步骤标签列表 */
  stepLabels: string[];
}

// ─── 内置技能数据 ───
export const BUILT_IN_SKILLS: SkillDef[] = [
  {
    id: 'skill-video-expert',
    name: '视频专家',
    description: '切换到视频链路：按分场景脚本生成画面与视频片段',
    longDesc: '切换到视频生成链路：先由 AI 产出分场景脚本，再依据脚本生成画面与视频片段。下面的要点会作为提示词注入，约束脚本的组织方式。产出的是脚本文字与素材文件，不是成片。',
    category: 'video',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    iconName: 'Film',
    installed: true, enabled: true, uses: 0,
    tags: ['全链路', '脚本', '分镜'],
    inputPlaceholder: '例如：为一款智能健康手环制作60秒品牌宣传片，目标用户：25-35岁都市白领',
    outputType: 'video',
    stepLabels: ['明确主题与受众', '按场景组织脚本', '描述画面与镜头', '给出旁白文案'],
  },
  {
    id: 'skill-clip-assembly',
    name: '分镜成片',
    description: '把主题拆成分镜脚本，逐段生成画面与视频片段',
    longDesc: '切换到视频生成链路，按分镜组织 AI 输出并生成视频片段。平台不读取已有视频素材、也不做片段合并，成片需本地剪辑工具完成。',
    category: 'video',
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    iconName: 'Layers',
    installed: true, enabled: true, uses: 0,
    tags: ['素材整合', '剪辑方案', '执行导向'],
    inputPlaceholder: '例如：我有产品开箱视频3段、客户评价采访2段，帮我规划合成一个2分钟的产品展示视频',
    outputType: 'video',
    stepLabels: ['拆分场景', '描述每段画面', '标注镜头与节奏', '整理配音文案'],
  },
  {
    id: 'skill-short-video',
    name: '短视频快手',
    description: '按短视频节奏组织脚本：开场钩子、主体、CTA、发布建议',
    longDesc: '切换到视频生成链路，并用短视频结构约束 AI 输出的脚本，便于后续生成画面与片段。运营建议以文字形式给出，不负责发布或数据优化。',
    category: 'video',
    iconBg: 'bg-gradient-to-br from-pink-500 to-rose-600',
    iconName: 'Zap',
    installed: true, enabled: true, uses: 0,
    tags: ['抖音', '小红书', '增长'],
    inputPlaceholder: '例如：我的品牌是一家有机咖啡，想做系列短视频，核心卖点是云南高山庄园直采',
    outputType: 'video',
    stepLabels: ['设计开场钩子（前3秒）', '主体内容规划', '结尾CTA设计', '平台运营策略'],
  },
  {
    id: 'skill-brand-visual',
    name: '品牌视觉全案',
    description: '按品牌定位生成视觉方向描述与主视觉画面',
    longDesc: '切换到图片生成链路：AI 先整理品牌定位与视觉方向，再把描述用于生成一张主视觉图。配色与字体以文字建议形式给出，不生成设计规范文件。',
    category: 'image',
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    iconName: 'Star',
    installed: true, enabled: true, uses: 0,
    tags: ['品牌建设', '视觉规范', '一站式'],
    inputPlaceholder: '例如：为AI图像工具SaaS公司建立年轻、专业、有科技感的品牌形象',
    outputType: 'image',
    stepLabels: ['品牌定位', '视觉方向与配色建议', '主视觉画面描述', '核心文案'],
  },
  {
    id: 'skill-copywriting-pro',
    name: '广告文案大师',
    description: '消费者洞察→创意概念→多平台文案→A/B测试方案，完整创意体系',
    longDesc: '切换到文本生成链路，提示词要求 AI 按下面的要点输出完整文案草稿。只产出文字，不生成图片或视频。',
    category: 'text',
    iconBg: 'bg-gradient-to-br from-green-500 to-emerald-600',
    iconName: 'Type',
    installed: true, enabled: true, uses: 0,
    tags: ['广告文案', '多平台', 'A/B测试'],
    inputPlaceholder: '例如：为防晒气垫BB霜写全套广告文案，目标用户：18-28岁大学生和职场新人',
    outputType: 'text',
    stepLabels: ['受众洞察', '创意概念', '多平台文案', '备选版本'],
  },
  {
    id: 'skill-script-writer',
    name: '脚本写作专家',
    description: '专业叙事结构+完整脚本+节奏润色，影视级脚本创作流程',
    longDesc: '切换到文本生成链路，用叙事结构约束 AI 输出的脚本。只产出文字。',
    category: 'text',
    iconBg: 'bg-gradient-to-br from-blue-400 to-sky-500',
    iconName: 'MessageSquareText',
    installed: true, enabled: true, uses: 0,
    tags: ['叙事结构', '脚本', '润色'],
    inputPlaceholder: '例如：为公益机构写5分钟纪录片脚本，主题是城市流浪猫救助',
    outputType: 'text',
    stepLabels: ['规划叙事结构', '撰写完整脚本', '润色与节奏优化'],
  },
  {
    id: 'skill-voice-clone',
    name: '配音文案专家',
    description: '生成适合 TTS 的口语化配音文案',
    longDesc: '切换到语音合成链路：AI 先产出配音文案，再用配置好的语音模型合成音频。文案会带情绪与停顿标注，不生成服务商参数文件。',
    category: 'audio',
    iconBg: 'bg-gradient-to-br from-purple-500 to-violet-600',
    iconName: 'Mic',
    installed: true, enabled: true, uses: 0,
    tags: ['TTS', '情绪标注', '专业配音'],
    inputPlaceholder: '例如：为儿童教育App产品宣传视频配音，30秒，温暖亲切的女声',
    outputType: 'audio',
    stepLabels: ['明确使用场景与音色', '口语化配音文案', '情绪与停顿标注'],
  },
  {
    id: 'skill-brand-campaign',
    name: '品牌营销全案',
    description: '营销战略→创意大纲→全渠道物料→执行时间线，整合营销全流程',
    longDesc: '切换到文本生成链路，提示词要求 AI 按下面的要点输出营销方案草稿。只产出文字，不排期、不投放。',
    category: 'workflow',
    iconBg: 'bg-gradient-to-br from-amber-400 to-yellow-500',
    iconName: 'Sparkles',
    installed: true, enabled: true, uses: 0,
    tags: ['整合营销', '全渠道', '执行方案'],
    inputPlaceholder: '例如：智能台灯下月京东首发，售价598元，预算30万，制定完整营销方案',
    outputType: 'text',
    stepLabels: ['营销目标', '创意大纲', '渠道物料建议', '执行时间线'],
  },
];

// ─── Store ───
interface SkillStore {
  skills: SkillDef[];
  /** 当前选中的技能（从技能库「立即使用」传入 Dashboard） */
  activeSkillId: string | null;
  setActiveSkill: (id: string | null) => void;
  toggleInstall: (id: string) => void;
  toggleEnable: (id: string) => void;
  getEnabledSkills: () => SkillDef[];
  getSkillById: (id: string) => SkillDef | undefined;
  incrementUses: (id: string) => void;
}

export const useSkillStore = create<SkillStore>()(
persist(
(set, get) => ({
  skills: BUILT_IN_SKILLS,
  activeSkillId: null,

  setActiveSkill: (id) => set({ activeSkillId: id }),

  toggleInstall: (id) => set(state => ({
    skills: state.skills.map(s => {
      if (s.id !== id) return s;
      const installed = !s.installed;
      return { ...s, installed, enabled: installed };
    }),
  })),

  toggleEnable: (id) => set(state => ({
    skills: state.skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s),
  })),

  getEnabledSkills: () => get().skills.filter(s => s.installed && s.enabled),

  getSkillById: (id) => get().skills.find(s => s.id === id),

  incrementUses: (id) => set(state => ({
    skills: state.skills.map(s => s.id === id ? { ...s, uses: s.uses + 1 } : s),
  })),
}),
{
  name: 'videobuddy-skills',

  storage: createWorkspaceStorage(),
  // 只持久化用户的安装/启用状态；技能定义本身以代码为准，
  // 这样后续新增内置技能不会被旧缓存挡住。
  partialize: (state) => ({
    // 技能选择也持久化：从技能库跳到首页后刷新，不应丢失预选
    activeSkillId: state.activeSkillId,
    skills: state.skills.map(({ id, installed, enabled, uses }) => ({ id, installed, enabled, uses })),
  }),
  merge: (persisted, current) => {
    const saved = persisted as {
      activeSkillId?: string | null;
      skills?: { id: string; installed: boolean; enabled: boolean; uses?: number }[];
    } | undefined;
    if (!saved?.skills) return current;
    const savedMap = new Map(saved.skills.map((s) => [s.id, s]));
    return {
      ...current,
      activeSkillId: saved.activeSkillId ?? null,
      skills: current.skills.map((s) => {
        const hit = savedMap.get(s.id);
        return hit ? { ...s, installed: hit.installed, enabled: hit.enabled, uses: hit.uses ?? 0 } : s;
      }),
    };
  },
}
)
);


/**
 * 把技能的方法论拼成系统提示词。
 * 技能不是装饰：这段内容会注入 Agent 的每一次文本调用，
 * 让输出确实按该技能的要点组织。
 */
export function buildSkillDirective(skillId: string | null | undefined): string {
  if (!skillId) return '';
  const skill = useSkillStore.getState().getSkillById(skillId);
  if (!skill) return '';
  const points = skill.stepLabels.map((label, i) => `${i + 1}. ${label}`).join('\n');
  return [
    `【当前技能：${skill.name}】`,
    skill.longDesc,
    '请严格按以下要点组织本次输出：',
    points,
  ].join('\n');
}
