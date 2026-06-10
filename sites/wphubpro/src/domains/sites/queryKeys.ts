export type SitePagespeedStrategy = 'desktop' | 'mobile';

export const sitePagespeedQueryKey = (siteId: string, strategy: SitePagespeedStrategy) =>
  ['site-pagespeed', siteId, strategy] as const;

export const siteAppIconPreviewQueryKey = (siteId: string) => ['site-app-icon-preview', siteId] as const;

export const uptimeMonitorQueryKey = (siteId: string) => ['uptime-monitor', siteId] as const;

export const dashboardUptimeIncidentsQueryKey = (wsKey: string) =>
  ['dashboard-uptime-incidents', wsKey] as const;

export const dashboardUptimeBarsQueryKey = (wsKey: string) =>
  ['dashboard-uptime-bars-incidents', wsKey] as const;
