import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles, Zap, Layers, MessageSquare, Play, Wand2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';

function AppLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const containerSizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
  return (
    <div className={`${containerSizes[size]} rounded-xl overflow-hidden ring-1 ring-border`}>
      <img
        src="/logo-fish.png"
        alt="VideoBuddy"
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

export { AppLogo };

export function LoginPage() {
  const tr = useT();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim() || !password.trim()) {
      toast.error('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      await login(account.trim(), password);
      window.location.replace('/dashboard');
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen flex relative overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/5 pointer-events-none" />

      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center">
        <div className="relative z-10 max-w-lg px-10">
          <div className="flex items-center gap-4 mb-6">
            <AppLogo size="lg" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">VideoBuddy</h1>
              <p className="text-base text-foreground/75 font-medium mt-0.5">AI 驱动的视频创作工作流</p>
            </div>
          </div>

          <p className="text-lg text-foreground/75 mb-12 leading-relaxed max-w-sm">
            从创意到成片，一站式智能视频生产平台
          </p>

          <div className="space-y-4">
            <FeatureCard
              icon={<Wand2 className="w-5 h-5" />}
              title="全流程 AI 创作"
              desc="文案 → 分镜 → 视频，AI 贯穿每个环节"
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="多模型引擎"
              desc="接入主流模型即可使用，新模型可自行添加"
            />
            <FeatureCard
              icon={<Layers className="w-5 h-5" />}
              title="画布式编排"
              desc="节点化工作流，可视化拖拽创作"
            />
          </div>

          <div className="mt-12 flex items-center gap-6 text-xs text-foreground/75">
            <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> 一键出片</span>
            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI 加持</span>
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> 灵活编排</span>
          </div>
        </div>
      </div>

      <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-[45vh] min-h-[200px] max-h-[420px] bg-border/40" />

      <div className="flex-1 flex items-center justify-center p-8 relative">
        <Card className="w-full max-w-md border-border bg-card shadow-lg relative z-10">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="text-center mb-8">
              <div className="lg:hidden flex items-center justify-center gap-2.5 mb-4">
                <AppLogo size="sm" />
                <div className="text-left">
                  <span className="text-xl font-bold block leading-none text-foreground">VideoBuddy</span>
                  <span className="text-[10px] text-foreground/75">AI 视频创作工作流</span>
                </div>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{tr('login.title')}</h2>
              <p className="text-sm text-foreground/75 mt-1.5">{tr('login.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="account" className="text-sm font-medium text-foreground">{tr('login.account')}</Label>
                <Input
                  id="account"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="h-10"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">{tr('login.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 mt-2 bg-primary text-primary-foreground transition-colors"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {tr('login.submit')}
              </Button>
            </form>

            <div className="mt-8 p-4 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">需要账号？</p>
                  <p className="text-xs text-foreground/75 mt-1">请联系管理员创建账号。</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="absolute bottom-5 left-0 right-0 text-center z-20">
        <p className="text-xs text-foreground/75">
          &copy; {new Date().getFullYear()} VideoBuddy
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/40 border border-border/60">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-foreground/75 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
