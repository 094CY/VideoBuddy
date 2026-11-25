import { EntityCard } from '@/components/ui/entity-card';
/**
 * 技能库页面
 * 技能数据来自 skill-store，「立即使用」跳转 Dashboard 对话框
 * 点击卡片弹出居中弹窗展示详情（非侧抽屉）
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Zap, Film, ImageIcon, Type, Music, Layers,
  Mic, ToggleLeft, ToggleRight, X,
  AlertCircle, ArrowRight, Sparkles, Download,
  MessageSquareText, CheckCircle2,
  Star, Palette, Clapperboard,
} from 'lucide-react';
import { SearchField } from '@/components/ui/search-field';
import { toast } from 'sonner';
import { useSkillStore, type SkillCategory, type SkillDef } from '@/stores/skill-store';

// ─── 技能分类 ───
const CATEGORIES: { id: SkillCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all',      label: '全部',   icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'video',    label: '视频',   icon: <Film className="w-3.5 h-3.5" /> },
  { id: 'image',    label: '图片',   icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'text',     label: '文案',   icon: <Type className="w-3.5 h-3.5" /> },
  { id: 'audio',    label: '音频',   icon: <Music className="w-3.5 h-3.5" /> },
  { id: 'workflow', label: '工作流', icon: <Zap className="w-3.5 h-3.5" /> },
];

/** 图标映射 */
const ICON_MAP: Record<string, React.ReactNode> = {
  Film: <Film className="w-5 h-5 text-white" />,
  Layers: <Layers className="w-5 h-5 text-white" />,
  Zap: <Zap className="w-5 h-5 text-white" />,
  Type: <Type className="w-5 h-5 text-white" />,
  MessageSquareText: <MessageSquareText className="w-5 h-5 text-white" />,
  Mic: <Mic className="w-5 h-5 text-white" />,
  Sparkles: <Sparkles className="w-5 h-5 text-white" />,
  Star: <Star className="w-5 h-5 text-white" />,
  Palette: <Palette className="w-5 h-5 text-white" />,
  Clapperboard: <Clapperboard className="w-5 h-5 text-white" />,
};

// ─── 技能卡片 ───
function SkillCard({ skill, onToggleInstall, onToggleEnable, onRun, onOpenDetail }: {
  skill: SkillDef;
  onToggleInstall: (id: string) => void;
  onToggleEnable: (id: string) => void;
  onRun: (skill: SkillDef) => void;
  onOpenDetail: (skill: SkillDef) => void;
}) {
  return (
    <EntityCard
      title={<span className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg ${skill.iconBg} flex items-center justify-center flex-shrink-0`}>
          {ICON_MAP[skill.iconName] || <Zap className="w-4 h-4 text-white" />}
        </span>
        <span className="truncate">{skill.name}</span>
      </span>}
      description={skill.description}
      tags={skill.tags.slice(0, 3).map(tag => ({ key: tag, label: tag }))}
      meta={skill.uses > 0 ? `已用 ${skill.uses} 次` : '内置'}
      action={skill.installed ? (
        <>
          {skill.enabled && (
            <button
              onClick={() => onRun(skill)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium bg-muted text-foreground hover:bg-accent transition"
            >
              <ArrowRight className="w-3 h-3" /> 使用
            </button>
          )}
          <button
            aria-label={skill.enabled ? '停用技能' : '启用技能'}
            onClick={() => onToggleEnable(skill.id)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition"
          >
            {skill.enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          </button>
        </>
      ) : (
        <button
          onClick={() => onToggleInstall(skill.id)}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium bg-muted text-foreground hover:bg-accent transition"
        >
          <Plus className="w-3 h-3" /> 安装
        </button>
      )}
      onClick={() => onOpenDetail(skill)}
    />
  );
}


// ─── 技能详情弹窗（居中 Modal） ───
function SkillDetailModal({ skill, onClose, onToggleInstall, onToggleEnable, onRun }: {
  skill: SkillDef;
  onClose: () => void;
  onToggleInstall: (id: string) => void;
  onToggleEnable: (id: string) => void;
  onRun: (skill: SkillDef) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[14px] font-semibold text-muted-foreground">技能详情</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl ${skill.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              {ICON_MAP[skill.iconName] || <Zap className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1">
              <h2 className="text-[16px] font-semibold text-muted-foreground">{skill.name}</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">内置技能 · {skill.category}{skill.uses > 0 ? ` · 已用 ${skill.uses} 次` : ''}</p>
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground leading-relaxed">{skill.longDesc}</p>

          {/* 执行步骤 */}
          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-2">输出要点</p>
            <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
              使用此技能创建任务后，以下要点会作为提示词注入 AI 调用，影响实际生成结果；技能同时决定输出类型（文字 / 图片 / 视频 / 语音）。
            </p>
            <div className="space-y-1.5">
              {skill.stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-medium text-muted-foreground">{i + 1}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {skill.tags.map(tag => (
              <span key={tag} className="px-2 py-1 rounded-full text-[11px] bg-muted text-muted-foreground">{tag}</span>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-2">
          {skill.installed && skill.enabled ? (
            <button
              onClick={() => { onRun(skill); onClose(); }}
              className="px-5 py-1.5 rounded-lg text-[12px] font-medium bg-violet-600 text-white hover:bg-violet-700 transition"
            >
              立即使用
            </button>
          ) : skill.installed ? (
            <button
              onClick={() => onToggleEnable(skill.id)}
              className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-muted text-muted-foreground hover:bg-accent transition"
            >
              {skill.enabled ? '禁用' : '启用'}
            </button>
          ) : (
            <button
              onClick={() => { onToggleInstall(skill.id); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-muted text-muted-foreground hover:bg-accent transition"
            >
              <Download className="w-3.5 h-3.5" /> 安装
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ───
export function SkillsPage() {
  const navigate = useNavigate();
  const { skills, toggleInstall, toggleEnable, setActiveSkill } = useSkillStore();
  const [category, setCategory] = useState<SkillCategory>('all');
  const [search, setSearch] = useState('');
  const [activeDetail, setActiveDetail] = useState<SkillDef | null>(null);

  const filtered = useMemo(() => {
    return skills.filter(s => {
      const matchCat = category === 'all' || s.category === category;
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
                          s.description.toLowerCase().includes(search.toLowerCase()) ||
                          s.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [skills, category, search]);

  const installed = filtered.filter(s => s.installed);
  const notInstalled = filtered.filter(s => !s.installed);

  const handleToggleInstall = (id: string) => {
    const skill = skills.find(s => s.id === id);
    if (!skill) return;
    // 提示语义要基于操作后的状态：skill 是切换前的快照，
    // 提示文案基于操作后的状态。
    const willInstall = !skill.installed;
    toggleInstall(id);
    toast.success(willInstall ? `已安装「${skill.name}」` : `已卸载「${skill.name}」`);
  };

  const handleToggleEnable = (id: string) => {
    const skill = skills.find(s => s.id === id);
    if (!skill) return;
    const willEnable = !skill.enabled;
    toggleEnable(id);
    toast.success(willEnable ? `已启用「${skill.name}」` : `已禁用「${skill.name}」`);
  };

  /** 立即使用 → 跳转 Dashboard 对话框 */
  const handleRun = (skill: SkillDef) => {
    setActiveSkill(skill.id);
    setActiveDetail(null);
    navigate('/');
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-12">

          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    category === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cat.icon}{cat.label}
                </button>
              ))}
            </div>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="搜索技能..."
              size="sm"
              className="w-48"
            />
          </div>

          {installed.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <p className="text-[12px] font-medium text-muted-foreground">已安装</p>
                <span className="text-[11px] text-muted-foreground">{installed.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {installed.map(skill => (
                  <SkillCard key={skill.id} skill={skill} onToggleInstall={handleToggleInstall} onToggleEnable={handleToggleEnable} onRun={handleRun} onOpenDetail={setActiveDetail} />
                ))}
              </div>
            </section>
          )}

          {notInstalled.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[12px] font-medium text-muted-foreground">未安装</p>
                <span className="text-[11px] text-muted-foreground">{notInstalled.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {notInstalled.map(skill => (
                  <SkillCard key={skill.id} skill={skill} onToggleInstall={handleToggleInstall} onToggleEnable={handleToggleEnable} onRun={handleRun} onOpenDetail={setActiveDetail} />
                ))}
              </div>
            </section>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Zap className="w-10 h-10 mb-3" />
              <p className="text-[13px]">未找到匹配技能</p>
            </div>
          )}
        </div>
      </div>

      {/* 详情弹窗（居中 Modal，替换原侧抽屉） */}
      {activeDetail && (
        <SkillDetailModal
          skill={activeDetail}
          onClose={() => setActiveDetail(null)}
          onToggleInstall={handleToggleInstall}
          onToggleEnable={handleToggleEnable}
          onRun={handleRun}
        />
      )}
    </div>
  );
}
