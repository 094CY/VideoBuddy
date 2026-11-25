import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

/**
 * 前端身份视图。
 *
 * 账号、密码、会话、权限判定全部在服务端；这个 store 只保存「当前页面是谁」，
 * 不含任何账号表或口令，也不参与租户数据同步。真正的身份以
 * SessionBootstrap 调 /api/auth/me 的结果为准。
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  role: 'admin' | 'member' | null;
  mustChangePassword: boolean;

  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      role: null,
      mustChangePassword: false,

      login: async (account, password) => {
        const { loginWithServer } = await import('@/lib/session');
        await loginWithServer(account, password);
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, token: null, role: null });
        void (async () => {
          const { logoutFromServer } = await import('@/lib/session');
          await logoutFromServer();
          // 清理完成后整页回到登录页，确保下一个账号不会看到残留状态
          window.location.replace('/login');
        })();
      },

      // 角色由服务端下发，不依赖账号标识的形式
      isAdmin: () => get().role === 'admin',

      updateUser: (updates) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...updates } });
      },
    }),
    {
      name: 'videobuddy-auth',
      // 只缓存展示态；绝不能把账号表或口令写进这里
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        role: state.role,
        mustChangePassword: state.mustChangePassword,
      }),
    }
  )
);
