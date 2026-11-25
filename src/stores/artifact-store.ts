import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { generateId } from '@/lib/utils';

export interface ArtifactItem {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text';
  name: string;
  content?: string;
  fileUrl?: string;
  sourceProject?: string;
  createdAt: string;
}

interface ArtifactStore {
  items: ArtifactItem[];
  add: (input: Omit<ArtifactItem, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
}

/**
 * 独立保存的产物（Agent 生成、手动添加）。
 * 画布节点产物由 assets 页面从项目实时汇总，此处只保存 Agent 产物。
 */
export const useArtifactStore = create<ArtifactStore>()(
  persist(
    (set) => ({
      items: [],
      add: (input) => set((state) => {
        const duplicate = state.items.some((a) =>
          (input.fileUrl && a.fileUrl === input.fileUrl)
          || (input.content && a.content === input.content && a.sourceProject === input.sourceProject));
        if (duplicate) return state;
        return {
          items: [
            { ...input, id: generateId(), createdAt: new Date().toISOString() },
            ...state.items,
          ],
        };
      }),
      remove: (id) => set((state) => ({ items: state.items.filter((a) => a.id !== id) })),
    }),
    {
      name: 'videobuddy-artifacts',
      storage: createWorkspaceStorage<Pick<ArtifactStore, 'items'>>(),
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => {
        const items = (persisted as Pick<ArtifactStore, 'items'>)?.items || [];
        const perTask: Record<string, number> = {};
        const kept = items.filter((a) => {
          const key = `${a.sourceProject || ''}|${a.type}`;
          perTask[key] = (perTask[key] || 0) + 1;
          return perTask[key] <= 3;
        });
        return { ...current, items: kept };
      },
    }
  )
);
