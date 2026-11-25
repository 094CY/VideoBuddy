import { confirmAction } from '@/components/shared/confirm-store';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTemplateStore } from '@/stores/template-store';
import { launchTemplate } from '@/lib/template-launch';
import { useAuthStore } from '@/stores/auth-store';
import { SearchField } from '@/components/ui/search-field';
import { EntityCard } from '@/components/ui/entity-card';
import {
  Sparkles,
  Type,
  ImageIcon,
  Video,
  Music,
  FileText,
  Crown,
  UserCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const categories = [
  { id: 'all', label: '全部' },
  { id: 'official', label: '官方精选' },
  { id: 'personal', label: '我的模板' },
  { id: '短视频', label: '短视频' },
  { id: '广告营销', label: '广告营销' },
  { id: '短剧', label: '短剧' },
  { id: '自媒体', label: '自媒体' },
  { id: '音频', label: '音频' },
];

const nodeTypeIcons: Record<string, React.ReactNode> = {
  text: <Type className="w-2.5 h-2.5" />,
  image: <ImageIcon className="w-2.5 h-2.5" />,
  video: <Video className="w-2.5 h-2.5" />,
  audio: <Music className="w-2.5 h-2.5" />,
  script: <FileText className="w-2.5 h-2.5" />,
  'ai-process': <Sparkles className="w-2.5 h-2.5" />,
};

export function TemplatesPage() {
  const navigate = useNavigate();
  const { getTemplatesByCategory, deleteTemplate } = useTemplateStore();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const filteredTemplates = getTemplatesByCategory(activeCategory).filter(
    (t) =>
      // 官方模板人人可见；个人模板只对创建者可见
      (t.isPublic || !t.creatorId || t.creatorId === currentUserId) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleUseTemplate = (templateId: string) => {
    const result = launchTemplate(templateId);
    if (!result) { toast.error('模板不存在或已被删除'); return; }
    if (result.missingModels) {
      toast.warning('项目已创建。尚未设置默认模型，请先在「设置 → 模型 & Key」添加模型并设为默认，否则节点无法执行');
    } else {
      toast.success('已从模板创建项目');
    }
    navigate(`/canvas/${result.projectId}`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-12">

          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
            </div>
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="搜索模板..."
              size="sm"
              className="w-56 flex-shrink-0"
            />
          </div>

          {/* 模板网格 */}
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Sparkles className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-[13px]">
                {activeCategory === 'personal' ? '暂无个人模板' : '暂无该分类的模板'}
              </p>
              {activeCategory === 'personal' && (
                <p className="text-[11px] mt-1 text-muted-foreground">在项目中将工作流保存为模板</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map((template) => (
                <EntityCard
                  key={template.id}
                  eyebrow={template.isPublic
                    ? <><Crown className="w-3 h-3" /> 官方精选</>
                    : <><UserCircle className="w-3 h-3" /> 个人模板</>}
                  tags={template.workflowData.nodes.map((node, i) => ({
                    key: i,
                    icon: nodeTypeIcons[node.type],
                    label: (node.data as unknown as Record<string, unknown>).label as string,
                  }))}
                  title={template.name}
                  description={template.description}
                  meta={<>{template.category} · {template.useCount > 0 ? `已用 ${template.useCount} 次` : '模板'}</>}
                  action={<>
                    <span className="text-[11px] text-muted-foreground">{template.workflowData.nodes.length} 节点</span>
                    {!template.isPublic && (
                      <button
                        aria-label="删除模板"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-destructive transition"
                        onClick={async () => {
                          const ok = await confirmAction({ title: `删除模板「${template.name}」？`, description: '删除后不可恢复。', confirmText: '删除', destructive: true });
                          if (!ok) return;
                          deleteTemplate(template.id);
                          toast.success('模板已删除');
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </>}
                  onClick={() => handleUseTemplate(template.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
