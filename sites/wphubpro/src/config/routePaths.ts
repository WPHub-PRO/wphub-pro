export const ROUTE_PATHS = {
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/dashboard',
  /** WordPress bridge redirect after connect (query: site_url, user_login, connect_token | api_key). */
  CONNECT_SUCCESS: '/connect/success',
  PROFILE: '/profile',
  /** Team workspace: list, create, detail (invites, seats, billing). */
  TEAMS: '/teams',
  /** Create a new team (plan + Stripe checkout). */
  TEAM_NEW: '/teams/new',
  teamPath: (teamId: string) => `/teams/${encodeURIComponent(teamId)}`,
  /** Team workspace: Stripe subscription, invoices, payment methods (owners). */
  teamBillingPath: (teamId: string) => `/teams/${encodeURIComponent(teamId)}/billing`,
  teamSettingsPath: (teamId: string) => `/teams/${encodeURIComponent(teamId)}/settings`,
  SITES: '/sites',
  /** Path pattern: `/sites/:siteId` — use `siteDetailPath(id)` for links. */
  siteDetailPath: (siteId: string) => `/sites/${encodeURIComponent(siteId)}`,
  /** Installed plugin on a site (`plugin` = e.g. `akismet/akismet.php`). */
  sitePluginDetailPath: (siteId: string, plugin: string) =>
    `/sites/${encodeURIComponent(siteId)}/plugins/${encodeURIComponent(plugin)}`,
  /** Installed theme on a site (`stylesheet` = theme directory slug). */
  siteThemeDetailPath: (siteId: string, stylesheet: string) =>
    `/sites/${encodeURIComponent(siteId)}/themes/${encodeURIComponent(stylesheet)}`,
  LIBRARY: '/library',
  /** Logical library item (plugin slug or theme slug). */
  libraryItemDetailPath: (kind: 'plugin' | 'theme', slug: string) =>
    `/library/items/${kind}/${encodeURIComponent(slug)}`,
  /** Admin area default route (full admin UI to be implemented later). */
  ADMIN_DASHBOARD: '/admin',
  ADMIN_USERS: '/admin/users',
  /** Path pattern: `/admin/users/:userId` */
  adminUserPath: (userId: string) => `/admin/users/${encodeURIComponent(userId)}`,
  /** Admin: platform `teams` rows + Appwrite team names */
  ADMIN_TEAMS: '/admin/teams',
  adminTeamPath: (teamId: string) => `/admin/teams/${encodeURIComponent(teamId)}`,
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_FINANCE: '/admin/finance',
  ADMIN_FINANCE_DASHBOARD: '/admin/finance/dashboard',
  ADMIN_FINANCE_SUBSCRIPTIONS: '/admin/finance/subscriptions',
  ADMIN_FINANCE_PLANS: '/admin/finance/plans',
  /** Invoices & failed payment intents (Stripe). */
  ADMIN_FINANCE_INVOICES: '/admin/finance/invoices',
  /** @deprecated Use ADMIN_FINANCE_INVOICES — kept for external links; same URL as invoices. */
  ADMIN_FINANCE_BILLING: '/admin/finance/invoices',
  adminFinanceInvoicePath: (invoiceId: string) =>
    `/admin/finance/invoices/${encodeURIComponent(invoiceId)}`,
  adminFinanceSubscriptionPath: (subscriptionId: string) =>
    `/admin/finance/subscriptions/${encodeURIComponent(subscriptionId)}`,
  adminFinancePlanPath: (productId: string) =>
    `/admin/finance/plans/${encodeURIComponent(productId)}`,
  /** Member support hub */
  SUPPORT: '/support',
  SUPPORT_NEW: '/support/new',
  supportTicketPath: (ticketId: string) => `/support/${encodeURIComponent(ticketId)}`,
  /** Admin: all support tickets */
  ADMIN_SUPPORT: '/admin/support',
  /** User knowledge base (help center) */
  DOCS: '/docs',
  docsArticlePath: (slug: string) => `/docs/a/${encodeURIComponent(slug)}`,
  /** Admin: edit knowledge base articles (mock + localStorage in dev) */
  ADMIN_DOCS: '/admin/docs',
  /** Admin: communication (broadcast, targeted messages) */
  ADMIN_COMMUNICATION: '/admin/communication',
  ADMIN_COMMUNICATION_PLATFORM_EVENTS: '/admin/communication/platform-events',
  /** @deprecated Use ADMIN_COMMUNICATION_PLATFORM_EVENTS */
  ADMIN_COMMUNICATION_NOTIFICATION_TEMPLATES: '/admin/communication/notification-templates',
  /** Admin: transactional / system email delivery and templates */
  ADMIN_COMMUNICATION_SYSTEM_EMAILS: '/admin/communication/system-emails',
  /** User: in-app notification inbox */
  NOTIFICATIONS: '/notifications',
  /** Workspace IMAP/SMTP inbox (list + sidebar). */
  INBOX: '/inbox',
  INBOX_COMPOSE: '/inbox/compose',
  inboxMessagePath: (messageUid: string) => `/inbox/${encodeURIComponent(messageUid)}`,
  /** Signed team invite review (`?i=` invite id, `&t=` token). */
  INVITE_TEAM: '/invite/team',
  /** Register after opening a team invite link (`?i=` `&t=`). */
  REGISTER_INVITE: '/register/invite',
} as const;
