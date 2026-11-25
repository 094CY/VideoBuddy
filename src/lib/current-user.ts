import { useAuthStore } from '@/stores/auth-store';

/** 当前登录用户 ID。未登录时返回匿名标识。 */
export function getCurrentUserId(): string {
  return useAuthStore.getState().user?.id || 'anonymous';
}


