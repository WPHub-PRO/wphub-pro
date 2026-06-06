import { WPHUB_APPWRITE_IDS } from '@code045/wphubpro-shared';

const DEFAULT_ID = 'team_invites';

/**
 * @returns {string}
 */
export default function teamInvitesColl() {
  const v = WPHUB_APPWRITE_IDS.platformTables && WPHUB_APPWRITE_IDS.platformTables.teamInvites;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return DEFAULT_ID;
};
