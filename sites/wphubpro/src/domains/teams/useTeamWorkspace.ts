import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

const USERS_FN = APPWRITE_FUNCTION_IDS.USERS;

export type TeamSummary = {
  $id: string;
  name: string;
};

export type TeamMemberRow = {
  userId: string;
  email?: string;
  name?: string;
  roles?: string[];
};

export type TeamWorkspaceData = {
  team: TeamSummary | null;
  members: TeamMemberRow[];
  seatsUsed: number;
  seatTotal: number | null;
  isOwner: boolean;
  /** Canonical team owner Auth user id (`platform_db.teams.owner_id` via `users` team-get). */
  ownerUserId?: string | null;
  /** When set by `users` function: `solo` | `team_owner` | `team_member` */
  accountKind?: string | null;
  stripeCustomerIdTeam?: string | null;
  stripeSubscriptionId?: string | null;
};

export type TeamListRow = {
  team: TeamSummary;
  isOwner: boolean;
  seatsUsed: number;
  seatTotal: number | null;
};

export type TeamPendingInviteRow = {
  inviteId: string;
  email: string;
  status: string;
  expiresAt: string;
  invitedAt: string;
  invitedByUserId: string;
};

type TeamGetPayload = {
  success?: boolean;
  team?: TeamSummary | null;
  members?: TeamMemberRow[];
  seatsUsed?: number;
  seatTotal?: number | null;
  isOwner?: boolean;
  ownerUserId?: string | null;
  accountKind?: string | null;
  stripeCustomerIdTeam?: string | null;
  stripeSubscriptionId?: string | null;
};

function normalizeTeamWorkspace(res: TeamGetPayload | null | undefined): TeamWorkspaceData {
  const members = Array.isArray(res?.members) ? res!.members! : [];
  const seatsUsed = typeof res?.seatsUsed === 'number' ? res.seatsUsed : members.length;
  const seatTotal =
    res?.seatTotal === undefined || res?.seatTotal === null ? null : Number(res.seatTotal);
  const rawOwner =
    typeof res?.ownerUserId === 'string' && res.ownerUserId.trim() ? res.ownerUserId.trim() : '';
  return {
    team: res?.team ?? null,
    members,
    seatsUsed,
    seatTotal: Number.isFinite(seatTotal as number) ? (seatTotal as number) : null,
    isOwner: Boolean(res?.isOwner),
    ownerUserId: rawOwner || null,
    accountKind: typeof res?.accountKind === 'string' ? res.accountKind : null,
    stripeCustomerIdTeam:
      typeof res?.stripeCustomerIdTeam === 'string' && res.stripeCustomerIdTeam.startsWith('cus_')
        ? res.stripeCustomerIdTeam
        : null,
    stripeSubscriptionId:
      typeof res?.stripeSubscriptionId === 'string' && res.stripeSubscriptionId.trim()
        ? res.stripeSubscriptionId.trim()
        : null,
  };
}

export function countOccupiedSeats(members: TeamMemberRow[]): number {
  return members.length;
}

async function fetchTeamWorkspace(teamId?: string | null): Promise<TeamWorkspaceData> {
  const body: Record<string, string> = { action: 'team-get' };
  const tid = teamId?.trim();
  if (tid) body.teamId = tid;
  const res = await executeFunction<TeamGetPayload>(USERS_FN, body);
  return normalizeTeamWorkspace(res);
}

async function fetchTeamsList(): Promise<TeamListRow[]> {
  const res = await executeFunction<{ success?: boolean; teams?: TeamListRow[] }>(USERS_FN, {
    action: 'teams-list',
  });
  return Array.isArray(res?.teams) ? res.teams : [];
}

async function fetchTeamPendingInvites(teamId: string): Promise<TeamPendingInviteRow[]> {
  const tid = teamId.trim();
  if (!tid) return [];
  const res = await executeFunction<{ success?: boolean; invites?: TeamPendingInviteRow[] }>(USERS_FN, {
    action: 'team-invites-list',
    teamId: tid,
  });
  return Array.isArray(res?.invites) ? res.invites : [];
}

export function useTeamsList(enabled: boolean) {
  return useQuery({
    queryKey: ['team', 'list'],
    queryFn: fetchTeamsList,
    enabled,
    retry: false,
  });
}

export function useTeamWorkspace(enabled: boolean, teamId?: string | null) {
  const tid = teamId?.trim() ?? '';
  return useQuery({
    queryKey: ['team', 'workspace', tid],
    queryFn: () => fetchTeamWorkspace(tid || null),
    enabled,
    retry: false,
  });
}

export function useTeamPendingInvites(enabled: boolean, teamId?: string | null) {
  const tid = teamId?.trim() ?? '';
  return useQuery({
    queryKey: ['team', 'pending-invites', tid],
    queryFn: () => fetchTeamPendingInvites(tid),
    enabled: enabled && Boolean(tid),
    retry: false,
  });
}

function invalidateTeamQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['team', 'workspace'] });
  void qc.invalidateQueries({ queryKey: ['team', 'list'] });
  void qc.invalidateQueries({ queryKey: ['team', 'pending-invites'] });
  void qc.invalidateQueries({ queryKey: ['my-account-doc'] });
}

export function useTeamCreateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Team name is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-create',
        name: trimmed,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export async function teamInviteClaimAuthed(params: { inviteId: string; token: string }) {
  return executeFunction<{ success?: boolean; teamId?: string; active_team_id?: string | null; message?: string; alreadyMember?: boolean }>(USERS_FN, {
    action: 'team-invite-claim',
    inviteId: params.inviteId,
    token: params.token,
  });
}

export async function teamInviteDeclineAuthed(params: { inviteId: string; token: string }) {
  return executeFunction<{ success?: boolean; message?: string; alreadyHandled?: boolean }>(USERS_FN, {
    action: 'team-invite-decline',
    inviteId: params.inviteId,
    token: params.token,
  });
}

export function useTeamInviteClaimMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamInviteClaimAuthed,
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamInviteMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async (params: { email: string; inviteUrl?: string }) => {
      const trimmed = params.email.trim().toLowerCase();
      if (!trimmed) throw new Error('Email is required.');
      await executeFunction<{ success?: boolean; pending?: boolean; message?: string }>(USERS_FN, {
        action: 'team-invite',
        email: trimmed,
        inviteBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        ...(tid ? { teamId: tid } : {}),
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamInviteResendMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const id = inviteId.trim();
      if (!tid) throw new Error('Team id is required.');
      if (!id) throw new Error('Invite id is required.');
      return executeFunction<{
        success?: boolean;
        emailDispatched?: boolean;
        message?: string;
      }>(USERS_FN, {
        action: 'team-invite-resend',
        teamId: tid,
        inviteId: id,
        inviteBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamInviteRevokeMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const id = inviteId.trim();
      if (!tid) throw new Error('Team id is required.');
      if (!id) throw new Error('Invite id is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-invite-revoke',
        teamId: tid,
        inviteId: id,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamRemoveMemberMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async (userId: string) => {
      const id = userId.trim();
      if (!id) throw new Error('Member id is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-remove-member',
        userId: id,
        ...(tid ? { teamId: tid } : {}),
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamLeaveMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async () => {
      if (!tid) throw new Error('Team id is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-leave',
        teamId: tid,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamHandoverMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async (newOwnerUserId: string) => {
      const id = newOwnerUserId.trim();
      if (!tid) throw new Error('Team id is required.');
      if (!id) throw new Error('New owner is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-handover',
        teamId: tid,
        newOwnerUserId: id,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}

export function useTeamDeleteMutation(teamId?: string | null) {
  const qc = useQueryClient();
  const tid = teamId?.trim();
  return useMutation({
    mutationFn: async () => {
      if (!tid) throw new Error('Team id is required.');
      await executeFunction<{ success?: boolean }>(USERS_FN, {
        action: 'team-delete',
        teamId: tid,
      });
    },
    onSuccess: () => invalidateTeamQueries(qc),
  });
}
