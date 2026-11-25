import { create } from 'zustand';

export type SettingsSection =
  | 'profile' | 'accounts' | 'models' | 'team' | 'usage' | 'data' | 'guide';

interface SettingsPanelState {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
}

/**
 * 设置弹窗的全局开关。
 *
 * 弹窗挂在应用根层，任何页面都可原位打开，关闭后回到原页面。
 */
export const useSettingsPanelStore = create<SettingsPanelState>((set) => ({
  open: false,
  section: 'profile',
  openSettings: (section = 'profile') => set({ open: true, section }),
  closeSettings: () => set({ open: false }),
}));
