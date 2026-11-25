import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useModelStore } from '@/stores/model-store';

/** 登录后从服务端拉取管理员发布的共享模型配置（不含密钥） */
export function ManagedConfigLoader() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (!isAuthenticated) return;
    void useModelStore.getState().loadManagedConfig().then((ok) => {
      if (!ok) toast.error('团队共享模型配置读取失败，请检查网络连接');
    });
  }, [isAuthenticated]);
  return null;
}
