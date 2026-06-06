/** Public API — re-exports from `src/` domain modules. */
export { Account, Client, Databases, Functions, ID, Permission, Query, Role, Storage, Teams, Users } from 'node-appwrite';
export * from './src/core/config.ts';
export * from './src/core/readEnv.ts';
export * from './src/core/env.ts';
export * from './src/core/strings.ts';
export * from './src/core/mailSecretsEnvelope.ts';
export * from './src/http/payload.ts';
export * from './src/http/http.ts';
export * from './src/http/runtime.ts';
export * from './src/appwrite/client.ts';
export * from './src/appwrite/auth.ts';
export { WPHUB_APPWRITE_IDS, platformTeamsTableId } from './src/appwrite/ids.ts';
export * from './src/bridge/bridgeActiveRelease.ts';
export * from './src/bridge/bridgeAuth.ts';
export * from './src/queries/notifications.ts';
export * from './src/queries/platformSettings.ts';
export * from './src/queries/sites.ts';
export * from './src/queries/tickets.ts';
export * from './src/queries/library.ts';
export * from './src/workspace/workspaceTeam.ts';
export * from './src/workspace/workspaceAuth.ts';
export {
  sessionCanAccessSiteDocument,
  sessionCanMutateSiteDocument,
  resolveResourceOwnerUserId,
} from './src/workspace/workspaceContext.ts';
export * from './src/platform/platformSettingsJson.ts';
export * from './src/email/emailBlocks.ts';
export * from './src/email/systemEmail.ts';
export * from './src/email/transactionalEmail.ts';
export * from './src/notifications/recipientsUserIds.ts';
export * from './src/notifications/userNotifications.ts';
export * from './src/notifications/notificationFromTemplate.ts';
export * from './src/platform/emitPlatformEvent.ts';
export {
  loadPlatformEvent,
  platformEventsColl,
  platformEventsDatabaseId,
} from './src/platform/loadPlatformEvent.ts';
export * from './src/notifications/teamNotificationRecipients.ts';
export * from './src/notifications/notificationPrefs.ts';
