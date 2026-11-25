import { useEffect, useState } from 'react';
import { useModelStore } from '@/stores/model-store';
import { useSettingsPanelStore } from '@/stores/settings-panel-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { X, Cpu, ListPlus, Play } from 'lucide-react';

const DISMISS_KEY = 'videobuddy-wizard-dismissed';

/** 首次登录且尚未配置任何模型服务时，给出可操作的三步引导 */
export function FirstRunWizard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const services = useModelStore((s) => s.services);
  const defaultModels = useModelStore((s) => s.defaultModels);
  const localModelsCache = useModelStore((s) => s.localModelsCache);
  const openSettings = useSettingsPanelStore((s) => s.openSettings);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); }
    catch { setDismissed(false); }
  }, []);

  const hasDefaultModel = Object.values(defaultModels).some(Boolean);
  const hasLocalModel = localModelsCache.some(
    (entry) => entry.models.length > 0 && Date.now() - entry.lastChecked < 5 * 60 * 1000,
  );
  if (!isAuthenticated || dismissed || services.length > 0 || hasDefaultModel || hasLocalModel) return null;

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* 忽略 */ }
  };

  const steps = [
    { icon: Cpu, title: '添加模型服务', desc: '填写接口协议、HTTPS 地址与密钥' },
    { icon: ListPlus, title: '登记模型并设为默认', desc: '按接口文档填写模型 ID 与能力类型' },
    { icon: Play, title: '从模板开始', desc: '在首页选一个模板，创建项目后执行' },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] w-[min(560px,92vw)] rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium">开始使用 VideoBuddy</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            生成类节点需要先接入模型服务，按以下三步完成配置
          </p>
        </div>
        <button onClick={close} aria-label="关闭引导" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {steps.map((step, i) => (
          <div key={step.title} className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <step.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium">{i + 1}. {step.title}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">{step.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={close}>稍后配置</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => { openSettings('models'); close(); }}>
          去配置模型服务
        </Button>
      </div>
    </div>
  );
}
