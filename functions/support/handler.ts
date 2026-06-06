// Version: 1.3.0
/**
 * support — ticket actions for users and admins.
 * Actions: list | adminlist | get | create | addmessage | updatestatus | setfollow | listagents | delete.
 */
import {
  hasAppwriteServerEnv,
  createServerClients,
  parsePayload,
  ok,
  fail,
  callerUserIdFromReq,
  userIsAdmin,
} from '@code045/wphubpro-shared';

import { handleListTickets } from './handlers/listTickets.ts';
import { handleCreateTicket } from './handlers/createTicket.ts';
import { handleGetTicket } from './handlers/getTicket.ts';
import { handleAddTicketMessage } from './handlers/addTicketMessage.ts';
import { handleUpdateTicketStatus } from './handlers/updateTicketStatus.ts';
import { handleSetTicketFollow } from './handlers/setTicketFollow.ts';
import { handleListAgents } from './handlers/listAgents.ts';
import { handleDeleteTickets } from './handlers/deleteTickets.ts';

function normalizeAction(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

const ALIASES = {
  list: 'ticket_list',
  adminlist: 'ticket_admin_list',
  get: 'ticket_get',
  create: 'ticket_create',
  addmessage: 'ticket_add_message',
  updatestatus: 'ticket_update_status',
  setfollow: 'ticket_set_follow',
  listagents: 'ticket_list_agents',
  delete: 'ticket_delete',
  deletetickets: 'ticket_delete',
};

export default async ({ req, res, log, error }) => {
  const logInfo = typeof log === 'function' ? log : (...args) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args) => console.error(...args);

  if (!hasAppwriteServerEnv(req)) {
    logError('[support] Missing Appwrite server env (endpoint, project, API key).');
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload = {};
  try {
    payload = parsePayload(req);
  } catch {
    return fail(res, 'Invalid JSON body.', 400);
  }
  req._parsedPayload = payload;

  const rawAction = normalizeAction(req.query?.action || req.query?.Action || payload.action || '');
  const action = ALIASES[rawAction] || rawAction;
  logInfo(`[support] action=${action}`);

  const actorUserId = callerUserIdFromReq(req);
  if (!actorUserId) return fail(res, 'Unauthorized: could not resolve caller user', 401);

  let databases;
  let users;
  let teams;
  try {
    ({ databases, users, teams } = await createServerClients({ req }));
  } catch (e) {
    logError(`[support] credentials: ${e.message}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  let isAdmin = false;
  try {
    isAdmin = await userIsAdmin(users, teams, actorUserId, logInfo);
  } catch (e) {
    logError(`[support] admin check failed: ${e.message}`);
  }

  const ctx = {
    req,
    res,
    log: logInfo,
    error: logError,
    payload,
    databases,
    users,
    teams,
    actorUserId,
    isAdmin,
  };

  try {
    switch (action) {
      case 'ticket_list':
        return handleListTickets({ ...ctx, adminView: false });
      case 'ticket_admin_list':
        return handleListTickets({ ...ctx, adminView: true });
      case 'ticket_create':
        return handleCreateTicket(ctx);
      case 'ticket_get':
        return handleGetTicket(ctx);
      case 'ticket_add_message':
        return handleAddTicketMessage(ctx);
      case 'ticket_update_status':
        return handleUpdateTicketStatus(ctx);
      case 'ticket_set_follow':
        return handleSetTicketFollow(ctx);
      case 'ticket_list_agents':
        return handleListAgents(ctx);
      case 'ticket_delete':
        return handleDeleteTickets(ctx);
      case '':
        return ok(res, {
          success: true,
          message: 'Support function online. Provide an action for ticket operations.',
          actions: [
            'ticket_list',
            'ticket_admin_list',
            'ticket_create',
            'ticket_get',
            'ticket_add_message',
            'ticket_update_status',
            'ticket_set_follow',
            'ticket_list_agents',
            'ticket_delete',
          ],
        });
      default:
        return fail(
          res,
          'Invalid or missing action. Expected ticket_list, ticket_admin_list, ticket_create, ticket_get, ticket_add_message, ticket_update_status, ticket_set_follow, ticket_list_agents, ticket_delete.',
          400,
        );
    }
  } catch (e) {
    logError(`[support] unhandled: ${e.message}`);
    return fail(res, e.message || 'Internal error', 500);
  }
};
