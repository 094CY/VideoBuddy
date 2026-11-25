import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import type { Comment } from '@/types';

interface CommentStore {
  comments: Record<string, Comment[]>; // projectId -> comments

  // Comments
  addComment: (params: {
    projectId: string;
    userId: string;
    userName: string;
    content: string;
    positionX?: number;
    positionY?: number;
    nodeId?: string;
  }) => Comment;
  updateComment: (projectId: string, commentId: string, content: string) => void;
  deleteComment: (projectId: string, commentId: string) => void;
  resolveComment: (projectId: string, commentId: string) => void;
  unresolveComment: (projectId: string, commentId: string) => void;
  getComments: (projectId: string) => Comment[];
  getUnresolvedCount: (projectId: string) => number;

}

export const useCommentStore = create<CommentStore>()(
  persist(
    (set, get) => ({
      comments: {},

      addComment: (params) => {
        const comment: Comment = {
          id: generateId(),
          projectId: params.projectId,
          userId: params.userId,
          userName: params.userName,
          content: params.content,
          positionX: params.positionX,
          positionY: params.positionY,
          nodeId: params.nodeId,
          isResolved: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          comments: {
            ...state.comments,
            [params.projectId]: [...(state.comments[params.projectId] || []), comment],
          },
        }));
        return comment;
      },

      updateComment: (projectId, commentId, content) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [projectId]: (state.comments[projectId] || []).map((c) =>
              c.id === commentId ? { ...c, content } : c
            ),
          },
        }));
      },

      deleteComment: (projectId, commentId) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [projectId]: (state.comments[projectId] || []).filter((c) => c.id !== commentId),
          },
        }));
      },

      resolveComment: (projectId, commentId) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [projectId]: (state.comments[projectId] || []).map((c) =>
              c.id === commentId ? { ...c, isResolved: true } : c
            ),
          },
        }));
      },

      unresolveComment: (projectId, commentId) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [projectId]: (state.comments[projectId] || []).map((c) =>
              c.id === commentId ? { ...c, isResolved: false } : c
            ),
          },
        }));
      },

      getComments: (projectId) => {
        return get().comments[projectId] || [];
      },

      getUnresolvedCount: (projectId) => {
        return (get().comments[projectId] || []).filter((c) => !c.isResolved).length;
      },

    }),
    {
      name: 'videobuddy-comments',

      storage: createWorkspaceStorage(),
    }
  )
);
