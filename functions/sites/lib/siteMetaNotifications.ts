import {
  sendUserNotificationFromTemplate,
  getPlatformSettingJson,
  compareSemver,
  activeSemverFromBridgePluginJson,
  BRIDGE_SETTINGS_KEY,
} from '@code045/wphubpro-shared';
import type { Databases, Teams, Users } from '@code045/wphubpro-shared';

function parseJsonArray(s: unknown): unknown[] {
  try {
    const v = typeof s === 'string' ? JSON.parse(s) : s;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function itemNeedsUpdate(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  if (o.update === true || o.needs_update === true) return true;
  const nv = o.new_version ?? o.newVersion;
  const cv = o.version ?? o.Version;
  if (typeof nv === 'string' && nv && typeof cv === 'string' && nv !== cv) return true;
  return false;
}

export function pluginsNeedingUpdate(metaStr: unknown): unknown[] {
  return parseJsonArray(metaStr).filter(itemNeedsUpdate);
}

function parseWpMeta(wpMetaStr: unknown): Record<string, unknown> {
  try {
    const v = typeof wpMetaStr === 'string' ? JSON.parse(wpMetaStr) : wpMetaStr;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function notifySiteOwnerTemplate(
  databases: Databases,
  users: Users | undefined,
  siteDoc: Record<string, unknown>,
  eventKey: string,
  payload: Record<string, unknown>,
  teams?: Teams | null,
): Promise<void> {
  const uid = String(siteDoc.user_id || '').trim();
  if (!uid) return;
  const teamIdRaw = siteDoc.team_id != null ? String(siteDoc.team_id).trim() : '';
  await sendUserNotificationFromTemplate(databases, {
    eventKey,
    recipientUserId: uid,
    users,
    teams: teams ?? null,
    teamId: teamIdRaw || null,
    payload: {
      site_name: String(siteDoc.site_name || siteDoc.siteName || 'Site').slice(0, 255),
      site_url: String(siteDoc.site_url || siteDoc.siteUrl || '').slice(0, 512),
      site_id: String(siteDoc.$id || ''),
      team_id: teamIdRaw || undefined,
      ...payload,
    },
  });
}

export async function notifyAfterSiteMetaSync(
  databases: Databases,
  users: Users | undefined,
  siteDoc: Record<string, unknown>,
  updates: Record<string, unknown>,
  teams?: Teams | null,
): Promise<void> {
  try {
    const siteName = String(siteDoc.site_name || '').slice(0, 255);
    if (updates.plugins_meta !== undefined) {
      const need = pluginsNeedingUpdate(
        typeof updates.plugins_meta === 'string'
          ? updates.plugins_meta
          : JSON.stringify(updates.plugins_meta),
      );
      if (need.length > 0) {
        const first = (need[0] || {}) as Record<string, unknown>;
        await notifySiteOwnerTemplate(
          databases,
          users,
          siteDoc,
          'plugin_update_available',
          {
            count: String(need.length),
            item_name: String(first.name || first.Name || first.slug || 'Plugin').slice(0, 200),
            detail: `${need.length} plugin update(s) available on ${siteName}.`,
          },
          teams,
        );
      }
    }
    if (updates.themes_meta !== undefined) {
      const arr = parseJsonArray(
        typeof updates.themes_meta === 'string' ? updates.themes_meta : JSON.stringify(updates.themes_meta),
      );
      const need = arr.filter(itemNeedsUpdate);
      if (need.length > 0) {
        const first = (need[0] || {}) as Record<string, unknown>;
        await notifySiteOwnerTemplate(
          databases,
          users,
          siteDoc,
          'theme_update_available',
          {
            count: String(need.length),
            item_name: String(first.name || first.stylesheet || 'Theme').slice(0, 200),
            detail: `${need.length} theme update(s) available on ${siteName}.`,
          },
          teams,
        );
      }
    }
    if (updates.wp_meta !== undefined) {
      const raw =
        typeof updates.wp_meta === 'string' ? updates.wp_meta : JSON.stringify(updates.wp_meta ?? {});
      const wp = parseWpMeta(raw);
      const installed = String(wp.bridge_version || wp.bridgeVersion || '').trim();
      if (installed) {
        let latest = '';
        try {
          const parsed = await getPlatformSettingJson(databases, BRIDGE_SETTINGS_KEY);
          latest = activeSemverFromBridgePluginJson(parsed) || '';
        } catch {
          latest = '';
        }
        if (latest && compareSemver(latest, installed) > 0) {
          await notifySiteOwnerTemplate(
            databases,
            users,
            siteDoc,
            'bridge_plugin_update_available',
            {
              installed_version: installed,
              latest_version: latest,
              detail: `Bridge ${installed} → ${latest} available.`,
            },
            teams,
          );
        }
      }
    }
  } catch {
    /* best-effort */
  }
}
