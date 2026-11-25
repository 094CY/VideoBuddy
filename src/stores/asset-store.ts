import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Asset } from '@/types';
import { generateId } from '@/lib/utils';

/** 将 File 转为 data URL 以便持久化存储 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 读取文本文件内容 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

interface AssetStore {
  assets: Asset[];
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'>) => Asset;
  deleteAsset: (id: string) => void;
  getAssetsByType: (type: Asset['type']) => Asset[];
  getAssetsByProject: (projectId: string) => Asset[];
  getAssetById: (id: string) => Asset | undefined;
}

export const useAssetStore = create<AssetStore>()(
  persist(
    (set, get) => ({
      assets: [],

      addAsset: (assetData) => {
        const asset: Asset = {
          ...assetData,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ assets: [asset, ...state.assets] }));
        return asset;
      },

      deleteAsset: (id) => {
        set((state) => ({ assets: state.assets.filter((a) => a.id !== id) }));
      },

      getAssetsByType: (type) => {
        return get().assets.filter((a) => a.type === type);
      },

      getAssetsByProject: (projectId) => {
        return get().assets.filter((a) => a.projectId === projectId);
      },

      getAssetById: (id) => {
        return get().assets.find((a) => a.id === id);
      },
    }),
    {
    name: 'videobuddy-assets',
    storage: createWorkspaceStorage(),
  }
  )
);
