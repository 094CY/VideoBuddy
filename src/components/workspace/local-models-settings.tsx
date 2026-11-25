import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import {
  detectAllLocalBackends,
  type LocalBackendResult,
} from '@/lib/local-models';
import { useModelStore } from '@/stores/model-store';

/**
 * 本地模型管理。
 * 云端服务、团队共享服务与本地模型集中在「模型 & Key」一个分区内。
 */
export function LocalModelsSettings() {
  const [results, setResults] = useState<LocalBackendResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const setDefaultModel = useModelStore((s) => s.setDefaultModel);
  const defaultModels = useModelStore((s) => s.defaultModels);

  const detect = useCallback(async () => {
    setChecking(true);
    try {
      setResults(await detectAllLocalBackends());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void detect(); }, [detect]);

  const onlineCount = results.filter((r) => r.status === 'online').length;
  const modelCount = results.reduce((sum, r) => sum + r.models.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-muted-foreground flex-1">探测本机运行的模型框架，开发模式下通过本地代理访问。</p>
        <Button size="sm" variant="ghost" className="h-7 text-[11px] flex-shrink-0 gap-1"
          onClick={() => void detect()} disabled={checking}>
          {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          重新探测
        </Button>
      </div>

      {checking && results.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">正在探测本地模型服务…</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {onlineCount} 个后端在线 · 共 {modelCount} 个模型
          </p>
          <div className="space-y-2">
            {results.map((r) => {
              const isDefault = defaultModels[r.type]?.provider === r.id;
              const open = expanded === r.id;
              return (
                <div key={r.id} className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        r.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                      }`} />
                      <span className="text-xs font-medium truncate">{r.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {r.status === 'online' ? `${r.models.length} 个模型` : '未连接'}
                      </span>
                      {isDefault && r.status === 'online' && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">· 默认</span>
                      )}
                    </div>
                    {r.status === 'online' && r.models.length > 0 && (
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] flex-shrink-0"
                        onClick={() => setExpanded(open ? null : r.id)}>
                        {open ? '收起' : '查看模型'}
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {r.baseUrl} · {r.port ? `端口 ${r.port}` : '命令行调用'} · {r.type === 'text' ? '文本' : '图像'}
                    {r.error ? ` · ${r.error}` : ''}
                  </p>

                  {open && (
                    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                      {r.models.map((model) => (
                        <div key={model} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] truncate">{model}</span>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] flex-shrink-0"
                            onClick={() => {
                              setDefaultModel(r.type, r.id, model);
                              toast.success(`已设为默认：${model}`);
                            }}>
                            设为默认
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {onlineCount === 0 && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              未检测到本地模型服务。启动对应框架后点「重新探测」；生产部署请使用上方团队共享服务或自建云端服务。
            </p>
          )}
        </>
      )}
    </section>
  );
}
