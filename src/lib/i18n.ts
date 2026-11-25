import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'zh' | 'en';

/** 界面文案字典。新增文案时在此登记，未登记时回退中文。 */
const dict: Record<Locale, Record<string, string>> = {
  zh: {
    'nav.newTask': '新任务', 'nav.templates': '模板库', 'nav.assets': '资产库', 'nav.skills': '技能库',
    'nav.history': '任务记录', 'nav.agentTasks': 'Agent任务', 'nav.canvasProjects': '画布项目', 'nav.search': '搜索项目...', 'nav.collapse': '收起侧边栏', 'nav.expand': '展开侧边栏',
    'settings.title': '设置', 'settings.profile': '个人', 'settings.accounts': '账号',
    'settings.models': '模型 & Key', 'settings.team': '团队', 'settings.usage': '用量',
    'settings.data': '数据迁移', 'settings.guide': '使用指南',
    'home.title': '今天想做什么？', 'home.subtitle': '选择输出类型，描述需求，Agent 全程自动完成',
    'home.fromTemplate': '从模板开始', 'home.allTemplates': '全部模板',
    'home.attach': '附加素材', 'home.placeholder': '描述你想制作的内容...',
    'action.save': '保存', 'action.execute': '执行', 'action.export': '导出素材',
    'action.autoLayout': '一键整理', 'action.more': '更多', 'action.cancel': '取消',
    'action.delete': '删除', 'action.confirm': '确认', 'action.retry': '立即重试',
    'login.title': '欢迎使用', 'login.subtitle': '登录以继续你的创作',
    'login.account': '账号', 'login.password': '密码', 'login.submit': '登录',
    'sync.saving': '正在同步…', 'sync.pending': '项待同步', 'sync.unauthorized': '登录已失效，修改暂存于本机',
    'sync.relogin': '重新登录',
  },
  en: {
    'nav.newTask': 'New task', 'nav.templates': 'Templates', 'nav.assets': 'Assets', 'nav.skills': 'Skills',
    'nav.history': 'Tasks', 'nav.agentTasks': 'Agent tasks', 'nav.canvasProjects': 'Canvas projects', 'nav.search': 'Search projects...', 'nav.collapse': 'Collapse sidebar',
    'nav.expand': 'Expand sidebar',
    'settings.title': 'Settings', 'settings.profile': 'Profile', 'settings.accounts': 'Accounts',
    'settings.models': 'Models & Keys', 'settings.team': 'Team', 'settings.usage': 'Usage',
    'settings.data': 'Data transfer', 'settings.guide': 'Guide',
    'home.title': 'What will you create today?',
    'home.subtitle': 'Pick an output type, describe your idea, and let the Agent do the rest',
    'home.fromTemplate': 'Start from a template', 'home.allTemplates': 'All templates',
    'home.attach': 'Attach files', 'home.placeholder': 'Describe what you want to create...',
    'action.save': 'Save', 'action.execute': 'Run', 'action.export': 'Export assets',
    'action.autoLayout': 'Auto layout', 'action.more': 'More', 'action.cancel': 'Cancel',
    'action.delete': 'Delete', 'action.confirm': 'Confirm', 'action.retry': 'Retry now',
    'login.title': 'Welcome', 'login.subtitle': 'Sign in to continue',
    'login.account': 'Account', 'login.password': 'Password', 'login.submit': 'Sign in',
    'sync.saving': 'Syncing…', 'sync.pending': 'changes pending', 'sync.unauthorized': 'Session expired, edits kept locally',
    'sync.relogin': 'Sign in again',
  },
};

interface LocaleStore { locale: Locale; setLocale: (l: Locale) => void }
export const useLocaleStore = create<LocaleStore>()(persist(
  (set) => ({ locale: 'zh', setLocale: (locale) => set({ locale }) }),
  { name: 'videobuddy-locale' },
));

export function t(key: string, locale?: Locale): string {
  const l = locale ?? useLocaleStore.getState().locale;
  return dict[l]?.[key] ?? dict.zh[key] ?? key;
}

/** 组件内使用，语言切换会触发重渲染 */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string) => t(key, locale);
}
