import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, ProjectStatus } from '@/types';
import { generateId } from '@/lib/utils';
import { getCurrentUserId } from '@/lib/current-user';

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  isLoading: boolean;

  // CRUD
  createProject: (name: string, description?: string) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => Project;
  setCurrentProject: (id: string | null) => void;
  getProject: (id: string) => Project | undefined;
  /** 登录时将无归属的历史项目归到当前账号，只执行一次 */
  claimProjectsForUser: (userId: string, knownUserIds: string[]) => void;
  updateProjectStatus: (id: string, status: ProjectStatus) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      isLoading: false,

      createProject: (name, description) => {
        const newProject: Project = {
          id: generateId(),
          name,
          description,
          // 项目归属到当前登录用户
          ownerId: getCurrentUserId(),
          status: 'draft',
          tags: [],
          workflowData: { nodes: [], edges: [] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          projects: [newProject, ...state.projects],
        }));
        return newProject;
      },

      claimProjectsForUser: (userId, knownUserIds) => {
    const known = new Set(knownUserIds);
    let changed = false;
    const next = get().projects.map((p) => {
      if (known.has(p.ownerId)) return p;
      changed = true;
      return { ...p, ownerId: userId };
    });
    if (changed) set({ projects: next });
  },

  updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));
      },

      duplicateProject: (id) => {
        const original = get().projects.find((p) => p.id === id);
        if (!original) throw new Error('Project not found');
        const dup: Project = {
          ...original,
          id: generateId(),
          name: original.name + ' (副本)',
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          projects: [dup, ...state.projects],
        }));
        return dup;
      },

      setCurrentProject: (id) => {
        set({ currentProjectId: id });
      },

      getProject: (id) => {
        return get().projects.find((p) => p.id === id);
      },

      updateProjectStatus: (id, status) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },
    }),
    {
      name: 'videobuddy-projects',

      storage: createWorkspaceStorage(),
    }
  )
);
