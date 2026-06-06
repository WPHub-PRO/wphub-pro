// Version: 1.2.0
/**
 * messaging — in-app inbox + platform events + system email templates / delivery.
 * Notifications: notification_list | notification_mark_read |
 *   platform_events_list | platform_events_upsert | notification_send_from_template
 * Email (admin): email_shell_get | email_shell_upsert | email_templates_list | ...
 */
import * as crypto from 'node:crypto';

import {
  hasAppwriteServerEnv,
  createServerClients,
  parsePayload,
  ok,
  fail,
  callerUserIdFromReq,
  userIsAdmin,
} from '@code045/wphubpro-shared';

import { handleList } from './handlers/list.ts';
import { handleMarkRead } from './handlers/markRead.ts';
import platformEventsHandlers from './handlers/platformEventsHandlers.ts';
import notificationTemplateHandlers from './handlers/notificationTemplateHandlers.ts';
import emailHandlers from './handlers/emailHandlers.ts';

function normalizeAction(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

const ALIASES = {
  list: 'notification_list',
  markread: 'notification_mark_read',
  mark_read: 'notification_mark_read',
};

function internalMessagingSecretFromReq(req) {
  const h = req && req.headers ? req.headers : {};
  const v =
    h['x-wphub-internal-messaging-secret'] ||
    h['X-Wphub-Internal-Messaging-Secret'] ||
    h['X-WPHUB-INTERNAL-MESSAGING-SECRET'];
  return String(v || '').trim();
}

function internalMessagingSecretMatches(req) {
  const expected = String(process.env.WPHUB_INTERNAL_MESSAGING_SECRET || '').trim();
  if (!expected) return false;
  const got = internalMessagingSecretFromReq(req);
  if (!got) return false;
  const ah = crypto.createHash('sha256').update(got, 'utf8').digest();
  const bh = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(ah, bh);
}

export default async ({ req, res, log, error }) => {
  const logInfo = typeof log === 'function' ? log : (...args) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args) => console.error(...args);

  if (!hasAppwriteServerEnv(req)) {
    logError('[messaging] Missing Appwrite server env.');
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
  logInfo(`[messaging] action=${action}`);

  const internalTemplateSend =
    action === 'notification_send_from_template' && internalMessagingSecretMatches(req);

  let actorUserId = callerUserIdFromReq(req);
  if (!internalTemplateSend && !actorUserId) {
    return fail(res, 'Unauthorized: could not resolve caller user', 401);
  }

  let databases;
  let users;
  let teams;
  try {
    ({ databases, users, teams } = await createServerClients({ req }));
  } catch (e) {
    logError(`[messaging] credentials: ${e.message}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  let isAdmin = false;
  if (actorUserId) {
    try {
      isAdmin = await userIsAdmin(users, teams, actorUserId, logInfo);
    } catch (e) {
      logError(`[messaging] admin check failed: ${e.message}`);
    }
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
    actorUserId: actorUserId || '',
    isAdmin,
    internalTemplateSend,
  };

  try {
    switch (action) {
      case 'notification_list':
        return handleList(ctx);
      case 'notification_mark_read':
        return handleMarkRead(ctx);
      case 'platform_events_list':
        return platformEventsHandlers.handlePlatformEventsList(ctx);
      case 'platform_events_upsert':
        return platformEventsHandlers.handlePlatformEventsUpsert(ctx);
      case 'notification_templates_list':
        return platformEventsHandlers.handlePlatformEventsList(ctx);
      case 'notification_templates_upsert':
        return platformEventsHandlers.handlePlatformEventsUpsert(ctx);
      case 'notification_send_from_template':
        return notificationTemplateHandlers.handleNotificationSendFromTemplate(ctx);
      case 'email_shell_get':
        return emailHandlers.handleEmailShellGet(ctx);
      case 'email_shell_upsert':
        return emailHandlers.handleEmailShellUpsert(ctx);
      case 'email_templates_list':
        return emailHandlers.handleEmailTemplatesList(ctx);
      case 'email_template_upsert':
        return emailHandlers.handleEmailTemplateUpsert(ctx);
      case 'email_preview':
        return emailHandlers.handleEmailPreview(ctx);
      case 'email_delivery_get':
        return emailHandlers.handleEmailDeliveryGet(ctx);
      case 'email_delivery_upsert':
        return emailHandlers.handleEmailDeliveryUpsert(ctx);
      case 'email_test_send':
        return emailHandlers.handleEmailTestSend(ctx);
      case '':
        return ok(res, {
          success: true,
          message: 'Messaging function online.',
          actions: [
            'notification_list',
            'notification_mark_read',
            'platform_events_list',
            'platform_events_upsert',
            'notification_send_from_template',
            'email_shell_get',
            'email_shell_upsert',
            'email_templates_list',
            'email_template_upsert',
            'email_preview',
            'email_delivery_get',
            'email_delivery_upsert',
            'email_test_send',
          ],
        });
      default:
        return fail(res, 'Invalid action.', 400);
    }
  } catch (e) {
    logError(`[messaging] unhandled: ${e.message}`);
    return fail(res, e.message || 'Internal error', 500);
  }
};
