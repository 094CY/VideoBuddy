import { createWorkspaceStorage } from '@/lib/workspace-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import type { Team, TeamMember, TeamRole, User } from '@/types';

interface TeamInvite {
  id: string;
  teamId: string;
  account: string;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'expired';
  inviteLink: string;
  createdAt: string;
  expiresAt: string;
}

interface TeamStore {
  teams: Team[];
  members: Record<string, TeamMember[]>; // teamId -> members
  invites: TeamInvite[];
  currentTeamId: string | null;

  // Team CRUD
  createTeam: (name: string, ownerId: string, ownerUser: User) => Team;
  updateTeam: (teamId: string, updates: Partial<Team>) => void;
  deleteTeam: (teamId: string) => void;
  setCurrentTeam: (teamId: string | null) => void;

  // Member management
  addMember: (teamId: string, user: User, role: TeamRole) => void;
  removeMember: (teamId: string, userId: string) => void;
  updateMemberRole: (teamId: string, userId: string, role: TeamRole) => void;
  getMembers: (teamId: string) => TeamMember[];

  // Invite management
  createInvite: (teamId: string, account: string, role: TeamRole) => TeamInvite;
  cancelInvite: (inviteId: string) => void;
  acceptInvite: (inviteId: string, user: User) => void;
  getInvitesByTeam: (teamId: string) => TeamInvite[];
  getInviteByLink: (link: string) => TeamInvite | undefined;

  // Queries
  getTeamsByUser: (userId: string) => Team[];
  getUserRole: (teamId: string, userId: string) => TeamRole | null;
  hasPermission: (teamId: string, userId: string, requiredRole: TeamRole) => boolean;
}

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  'owner': 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

export const useTeamStore = create<TeamStore>()(
  persist(
    (set, get) => ({
      teams: [],
      members: {},
      invites: [],
      currentTeamId: null,

      createTeam: (name, ownerId, ownerUser) => {
        const team: Team = {
          id: generateId(),
          name,
          ownerId,
          createdAt: new Date().toISOString(),
        };
        const ownerMember: TeamMember = {
          id: generateId(),
          teamId: team.id,
          userId: ownerId,
          user: ownerUser,
          role: 'owner',
          joinedAt: new Date().toISOString(),
        };
        set((state) => ({
          teams: [...state.teams, team],
          members: { ...state.members, [team.id]: [ownerMember] },
          currentTeamId: team.id,
        }));
        return team;
      },

      updateTeam: (teamId, updates) => {
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, ...updates } : t
          ),
        }));
      },

      deleteTeam: (teamId) => {
        set((state) => {
          const newMembers = { ...state.members };
          delete newMembers[teamId];
          return {
            teams: state.teams.filter((t) => t.id !== teamId),
            members: newMembers,
            invites: state.invites.filter((i) => i.teamId !== teamId),
            currentTeamId: state.currentTeamId === teamId ? null : state.currentTeamId,
          };
        });
      },

      setCurrentTeam: (teamId) => {
        set({ currentTeamId: teamId });
      },

      addMember: (teamId, user, role) => {
        const member: TeamMember = {
          id: generateId(),
          teamId,
          userId: user.id,
          user,
          role,
          joinedAt: new Date().toISOString(),
        };
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: [...(state.members[teamId] || []), member],
          },
        }));
      },

      removeMember: (teamId, userId) => {
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: (state.members[teamId] || []).filter((m) => m.userId !== userId),
          },
        }));
      },

      updateMemberRole: (teamId, userId, role) => {
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: (state.members[teamId] || []).map((m) =>
              m.userId === userId ? { ...m, role } : m
            ),
          },
        }));
      },

      getMembers: (teamId) => {
        return get().members[teamId] || [];
      },

      createInvite: (teamId, account, role) => {
        const invite: TeamInvite = {
          id: generateId(),
          teamId,
          account,
          role,
          status: 'pending',
          inviteLink: `invite-${generateId().slice(0, 8)}`,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        set((state) => ({
          invites: [...state.invites, invite],
        }));
        return invite;
      },

      cancelInvite: (inviteId) => {
        set((state) => ({
          invites: state.invites.filter((i) => i.id !== inviteId),
        }));
      },

      acceptInvite: (inviteId, user) => {
        const invite = get().invites.find((i) => i.id === inviteId);
        if (!invite || invite.status !== 'pending') return;

        get().addMember(invite.teamId, user, invite.role);
        set((state) => ({
          invites: state.invites.map((i) =>
            i.id === inviteId ? { ...i, status: 'accepted' } : i
          ),
        }));
      },

      getInvitesByTeam: (teamId) => {
        return get().invites.filter((i) => i.teamId === teamId);
      },

      getInviteByLink: (link) => {
        return get().invites.find((i) => i.inviteLink === link && i.status === 'pending');
      },

      getTeamsByUser: (userId) => {
        const { teams, members } = get();
        return teams.filter((t) =>
          (members[t.id] || []).some((m) => m.userId === userId)
        );
      },

      getUserRole: (teamId, userId) => {
        const member = (get().members[teamId] || []).find((m) => m.userId === userId);
        return member?.role || null;
      },

      hasPermission: (teamId, userId, requiredRole) => {
        const userRole = get().getUserRole(teamId, userId);
        if (!userRole) return false;
        return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
      },
    }),
    {
      name: 'videobuddy-teams',

      storage: createWorkspaceStorage(),
    }
  )
);
