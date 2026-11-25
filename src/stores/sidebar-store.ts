import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SidebarPanel = 'dashboard' | 'templates' | 'assets' | 'skills';

interface SidebarState {
  activePanel: SidebarPanel;
  collapsed: boolean;
  historyOpen: boolean;
  agentOpen: boolean;
  canvasOpen: boolean;
  toggleHistory: () => void;
  toggleAgent: () => void;
  toggleCanvas: () => void;
  setActivePanel: (panel: SidebarPanel) => void;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      activePanel: 'dashboard',
      collapsed: false,
      historyOpen: true,
      agentOpen: true,
      canvasOpen: true,
      toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
      toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
      toggleCanvas: () => set((s) => ({ canvasOpen: !s.canvasOpen })),
      setActivePanel: (panel) => set({ activePanel: panel }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    { name: 'videobuddy-sidebar', partialize: (s) => ({ historyOpen: s.historyOpen, agentOpen: s.agentOpen, canvasOpen: s.canvasOpen }) },
  ),
);
