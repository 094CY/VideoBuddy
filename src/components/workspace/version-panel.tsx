import { confirmAction } from '@/components/shared/confirm-store';
import { useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Clock, RotateCcw, Trash2, Plus, History } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

interface VersionPanelProps {
  projectId: string;
  onClose: () => void;
}

export function VersionPanel({ projectId, onClose }: VersionPanelProps) {
  const { versions, saveVersion, loadVersion, deleteVersion } = useWorkflowStore();
  const [showSave, setShowSave] = useState(false);
  const [versionName, setVersionName] = useState('');

  // 只展示本项目快照；没有 projectId 的历史记录视为当前项目的遗留数据
  const projectVersions = versions.filter(
    (v) => !v.projectId || v.projectId === projectId
  );

  const handleSave = () => {
    if (!versionName.trim()) {
      toast.error('请输入版本名称');
      return;
    }
    saveVersion(versionName, projectId);
    setVersionName('');
    setShowSave(false);
    toast.success('版本已保存');
  };

  const handleLoad = (versionId: string) => {
    loadVersion(versionId);
    toast.success('已回退到该版本');
  };

  return (
    <div className="absolute top-4 right-4 z-30 w-72 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">版本历史</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Save new version */}
      <div className="px-4 py-3 border-b border-border/30">
        {showSave ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="版本名称，如 V1.0-初稿"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="h-8 text-xs flex-1"
              autoFocus
            />
            <Button size="sm" className="h-8 text-xs bg-white text-black hover:bg-white/90" onClick={handleSave}>
              保存
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
            onClick={() => setShowSave(true)}
          >
            <Plus className="w-3 h-3 mr-1" /> 保存当前版本
          </Button>
        )}
      </div>

      {/* Version list */}
      <div className="max-h-72 overflow-y-auto p-2">
        {projectVersions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            暂无版本记录<br />
            <span className="text-[10px]">点击上方按钮保存当前版本</span>
          </p>
        ) : (
          projectVersions.map((version) => (
            <div
              key={version.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition group"
            >
              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{version.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(version.createdAt)} · {version.snapshot.nodes.length} 节点
                </p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="回退到此版本"
                  onClick={() => handleLoad(version.id)}
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-400"
                  title="删除版本"
                  onClick={async () => { const ok = await confirmAction({ title: '删除此版本？', description: '删除后无法恢复该快照。', confirmText: '删除', destructive: true }); if (ok) deleteVersion(version.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
