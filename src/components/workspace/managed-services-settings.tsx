import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { SERVICE_PRESETS, getServicePreset, type ServicePreset } from '@/config/model-catalog';
import { useModelStore } from '@/stores/model-store';
import { useAuthStore } from '@/stores/auth-store';
import { Trash2, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';

interface PublicService {
  id: string; name: string; protocol: string; baseUrl: string;
  presetId: string; hasKey: boolean; keyMasked: string;
}
interface PublicModel { id: string; serviceId: string; modelId: string; name: string; type: string }
interface PublicConfig {
  services: PublicService[];
  models: PublicModel[];
  defaults: Record<string, { serviceId: string; modelId: string } | null>;
}

/**
 * 服务端托管的模型服务：管理员配置一次，所有成员共用，密钥不落浏览器。
 * 选预设后只需填 API Key 与模型 ID，地址与协议自动带入。
 */
export function ManagedServicesSettings() {
  const isAdmin = useAuthStore((s) => s.role === 'admin');
  const loadManagedConfig = useModelStore((s) => s.loadManagedConfig);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [presetId, setPresetId] = useState(SERVICE_PRESETS[0].id);
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [modelType, setModelType] = useState('text');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [baseUrlOverride, setBaseUrlOverride] = useState('');

  const preset: ServicePreset | undefined = getServicePreset(presetId);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/services', { credentials: 'include' });
      if (!res.ok) {
        toast.error('团队共享服务读取失败，请检查网络连接');
        return;
      }
      setConfig(await res.json());
    } catch {
      toast.error('团队共享服务读取失败，请检查网络连接');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setBaseUrlOverride(preset?.baseUrl || '');
    setModelId(preset?.modelExamples[0]?.id || '');
    if (preset?.modelExamples[0]) setModelType(preset.modelExamples[0].type);
  }, [presetId]);

  const pushConfig = async (next: {
    services: Array<Record<string, unknown>>;
    models: PublicModel[];
    defaults: PublicConfig['defaults'];
  }) => {
    const res = await fetch('/api/services', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ config: next }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    setConfig(data.config);
    await loadManagedConfig();
  };

  const handleAdd = async () => {
    if (!isAdmin) return;
    if (!apiKey.trim()) { toast.error('请填写 API Key'); return; }
    if (!modelId.trim()) { toast.error('请填写模型 ID'); return; }
    if (!baseUrlOverride.trim()) { toast.error('请填写服务地址'); return; }
    setBusy(true);
    try {
      const id = `svc-${Date.now().toString(36)}`;
      const services = [
        ...(config?.services || []).map((s) => ({ ...s })),
        {
          id, name: preset?.name || '自定义服务', presetId,
          protocol: preset?.protocol || 'openai',
          baseUrl: baseUrlOverride.trim().replace(/\/+$/, ''),
          apiKey: apiKey.trim(),
        },
      ];
      const models = [
        ...(config?.models || []),
        { id: `model-${Date.now().toString(36)}`, serviceId: id, modelId: modelId.trim(), name: modelId.trim(), type: modelType },
      ];
      const defaults = { ...(config?.defaults || {}), [modelType]: { serviceId: id, modelId: modelId.trim() } };
      await pushConfig({ services, models, defaults });
      setApiKey('');
      setTestResult(null);
      toast.success('已保存到服务端，所有成员可直接使用');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally { setBusy(false); }
  };

  const handleTest = async () => {
    if (!config?.services.length) { toast.error('请先保存一个服务'); return; }
    const target = config.services[config.services.length - 1];
    const model = config.models.find((m) => m.serviceId === target.id);
    if (!model) { toast.error('该服务下没有模型 ID'); return; }
    setBusy(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/services/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ serviceId: target.id, type: model.type, modelId: model.modelId }),
      });
      const data = await res.json();
      const ok = Boolean(data.ok);
      setTestResult({ ok, text: `${data.status} · ${data.latencyMs}ms · ${data.detail || ''}` });
      if (!ok) toast.error('连接失败，请检查地址、密钥与模型 ID');
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : '请求失败' });
    } finally { setBusy(false); }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    try {
      await pushConfig({
        services: (config?.services || []).filter((s) => s.id !== id).map((s) => ({ ...s })),
        models: (config?.models || []).filter((m) => m.serviceId !== id),
        defaults: Object.fromEntries(
          Object.entries(config?.defaults || {}).filter(([, v]) => v?.serviceId !== id),
        ),
      });
      toast.success('服务已移除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        管理员配置一次，全部成员直接调用；密钥由服务端保管。{!isAdmin && '仅管理员可修改。'}
      </p>

      {config?.services.length ? (
        <div className="space-y-1.5">
          {config.services.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-background border border-border/60">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{s.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {s.baseUrl} · {s.keyMasked || '未设置密钥'} ·{' '}
                  {config.models.filter((m) => m.serviceId === s.id).map((m) => m.modelId).join(', ')}
                </p>
              </div>
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400"
                  onClick={() => void handleRemove(s.id)} aria-label="移除服务">
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">尚未配置共享服务</p>
      )}

      {isAdmin && (
        <div className="space-y-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">接入预设</Label>
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">能力类型</Label>
              <Select value={modelType} onValueChange={setModelType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['text', 'image', 'video', 'audio'].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {preset?.docUrl && (
            <a href={preset.docUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              接口文档 <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <Input className="h-8 text-xs" placeholder="服务地址（预设已自动填写，可修改）"
            value={baseUrlOverride} onChange={(e) => setBaseUrlOverride(e.target.value)} />
          <Input className="h-8 text-xs" type="password" placeholder="API Key"
            value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <Input className="h-8 text-xs" placeholder="模型 ID（按服务商文档填写，可修改）"
            value={modelId} onChange={(e) => setModelId(e.target.value)}
            list="preset-model-examples" />
          <datalist id="preset-model-examples">
            {preset?.modelExamples.map((m) => <option key={m.id} value={m.id} />)}
          </datalist>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-[11px]" onClick={() => void handleAdd()} disabled={busy}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} 保存到服务端
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]"
              onClick={() => void handleTest()} disabled={busy || !config?.services.length}>
              测试连接
            </Button>
            {testResult && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                {testResult.ok
                  ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                  : <XCircle className="w-3 h-3 text-red-400" />}
                {testResult.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
