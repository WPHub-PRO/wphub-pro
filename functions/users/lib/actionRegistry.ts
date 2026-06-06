import handleList from '../handlers/users/list.ts';
import type { UsersHandlerFn, UsersHandlerKey } from './types.ts';
import handleUpdate from '../handlers/users/update.ts';
import handleLoginAs from '../handlers/users/login-as.ts';
import handleEnsureAccount from '../handlers/users/ensureAccount.ts';
import handleTeamCreate from '../handlers/teams/teamCreate.ts';
import handleTeamInvite from '../handlers/teams/teamInvite.ts';
import handleTeamInvitePreview from '../handlers/teams/teamInvitePreview.ts';
import handleTeamInviteDecline from '../handlers/teams/teamInviteDecline.ts';
import handleTeamInviteClaim from '../handlers/teams/teamInviteClaim.ts';
import handleTeamInvitesList from '../handlers/teams/teamInvitesList.ts';
import handleTeamInviteResend from '../handlers/teams/teamInviteResend.ts';
import handleTeamInviteRevoke from '../handlers/teams/teamInviteRevoke.ts';
import handleTeamRemoveMember from '../handlers/teams/teamRemoveMember.ts';
import handleTeamLeave from '../handlers/teams/teamLeave.ts';
import handleTeamHandover from '../handlers/teams/teamHandover.ts';
import handleTeamDelete from '../handlers/teams/teamDelete.ts';
import handleTeamGet from '../handlers/teams/teamGet.ts';
import handleTeamsList from '../handlers/teams/teamsList.ts';
import handleSetActiveTeam from '../handlers/teams/setActiveTeam.ts';
import handleAdminTeamsList from '../handlers/teams/adminTeamsList.ts';
import handleAdminTeamGet from '../handlers/teams/adminTeamGet.ts';
import handleAdminTeamPatch from '../handlers/teams/adminTeamPatch.ts';
import handleGet from '../handlers/users/get.ts';
import handleDelete from '../handlers/users/delete.ts';

/** @type {Record<string, string>} */
const ACTION_ALIASES = {
  list: 'list',
  'list-users': 'list',
  get: 'get',
  'get-user': 'get',
  update: 'update',
  'update-user': 'update',
  delete: 'delete',
  'delete-user': 'delete',
  'login-as': 'login-as',
  loginas: 'login-as',
  impersonate: 'login-as',
  ensureaccount: 'ensure-account',
  'ensure-account': 'ensure-account',
  teamcreate: 'team-create',
  'team-create': 'team-create',
  teaminvite: 'team-invite',
  'team-invite': 'team-invite',
  teaminvitepreview: 'team-invite-preview',
  'team-invite-preview': 'team-invite-preview',
  teaminvitedecline: 'team-invite-decline',
  'team-invite-decline': 'team-invite-decline',
  teaminviteclaim: 'team-invite-claim',
  'team-invite-claim': 'team-invite-claim',
  teaminviteslist: 'team-invites-list',
  'team-invites-list': 'team-invites-list',
  teaminviteresend: 'team-invite-resend',
  'team-invite-resend': 'team-invite-resend',
  teaminviterevoke: 'team-invite-revoke',
  'team-invite-revoke': 'team-invite-revoke',
  teamremovemember: 'team-remove-member',
  'team-remove-member': 'team-remove-member',
  teamleave: 'team-leave',
  'team-leave': 'team-leave',
  teamhandover: 'team-handover',
  'team-handover': 'team-handover',
  teamdelete: 'team-delete',
  'team-delete': 'team-delete',
  teamget: 'team-get',
  'team-get': 'team-get',
  setactiveteam: 'set-active-team',
  'set-active-team': 'set-active-team',
  adminteamslist: 'admin-teams-list',
  'admin-teams-list': 'admin-teams-list',
  adminteamget: 'admin-team-get',
  'admin-team-get': 'admin-team-get',
  adminteampatch: 'admin-team-patch',
  'admin-team-patch': 'admin-team-patch',
};

/** @type {Set<string>} */
const TEAM_ACTIONS = new Set([
  'team-create',
  'team-invite',
  'team-invites-list',
  'team-invite-resend',
  'team-invite-revoke',
  'team-remove-member',
  'team-leave',
  'team-handover',
  'team-delete',
  'team-get',
  'teams-list',
]);

/** @type {Set<string>} */
const ADMIN_ACTIONS = new Set([
  'list',
  'get',
  'update',
  'delete',
  'login-as',
  'admin-teams-list',
  'admin-team-get',
  'admin-team-patch',
]);

export const HANDLERS: Partial<Record<UsersHandlerKey, UsersHandlerFn>> & Record<string, UsersHandlerFn> = {
  'team-invite-preview': handleTeamInvitePreview,
  'team-invite-decline': handleTeamInviteDecline,
  'team-create': handleTeamCreate,
  'team-invite': handleTeamInvite,
  'team-invites-list': handleTeamInvitesList,
  'team-invite-resend': handleTeamInviteResend,
  'team-invite-revoke': handleTeamInviteRevoke,
  'team-remove-member': handleTeamRemoveMember,
  'team-leave': handleTeamLeave,
  'team-handover': handleTeamHandover,
  'team-delete': handleTeamDelete,
  'team-get': handleTeamGet,
  'teams-list': handleTeamsList,
  'team-invite-claim': handleTeamInviteClaim,
  'ensure-account': handleEnsureAccount,
  'admin-teams-list': handleAdminTeamsList,
  'admin-team-get': handleAdminTeamGet,
  'admin-team-patch': handleAdminTeamPatch,
  list: handleList,
  get: handleGet,
  update: handleUpdate,
  delete: handleDelete,
  'login-as': handleLoginAs,
  'set-active-team': handleSetActiveTeam,
};

export function normalizeAction(raw: unknown): string {
  const key = (raw || '').toString().toLowerCase();
  return ACTION_ALIASES[key] || key;
}

export { ACTION_ALIASES, TEAM_ACTIONS, ADMIN_ACTIONS };
