import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export const SUPPORT_FN = APPWRITE_FUNCTION_IDS.SUPPORT;

export const TICKET_ACTIONS = {
  LIST: 'ticket_list',
  ADMIN_LIST: 'ticket_admin_list',
  GET: 'ticket_get',
  CREATE: 'ticket_create',
  ADD_MESSAGE: 'ticket_add_message',
  UPDATE_STATUS: 'ticket_update_status',
  SET_FOLLOW: 'ticket_set_follow',
  DELETE: 'ticket_delete',
  LIST_AGENTS: 'ticket_list_agents',
} as const;

export function supportFunction<T>(
  action: string,
  body: Record<string, unknown> = {},
  options?: { omitImpersonationHeaders?: boolean },
) {
  return executeFunction<T>(SUPPORT_FN, { action, ...body }, options);
}
