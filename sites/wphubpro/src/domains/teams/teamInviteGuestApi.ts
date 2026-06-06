import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

const USERS_FN = APPWRITE_FUNCTION_IDS.USERS;

export type TeamInvitePreviewResponse = {
  success?: boolean;
  teamId?: string;
  teamName?: string;
  email?: string;
  inviteId?: string;
  message?: string;
};

export async function teamInvitePreviewGuest(params: { inviteId: string; token: string }) {
  return executeFunction<TeamInvitePreviewResponse>(
    USERS_FN,
    { action: 'team-invite-preview', inviteId: params.inviteId, token: params.token },
    { guestExecution: true },
  );
}

export async function teamInviteDeclineGuest(params: { inviteId: string; token: string }) {
  return executeFunction<{ success?: boolean; message?: string }>(
    USERS_FN,
    { action: 'team-invite-decline', inviteId: params.inviteId, token: params.token },
    { guestExecution: true },
  );
}
