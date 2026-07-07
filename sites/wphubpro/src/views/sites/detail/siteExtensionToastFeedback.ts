import type { PluginsBulkAction, ThemesBulkAction } from '@/domains/sites/extensionBulkFromSite';
import {
  resolvePluginAvailableUpdateVersion,
  resolveThemeAvailableUpdateVersion,
} from '@/domains/sites/installedLibraryUpdate';
import { isBridgePluginFile } from '@/domains/sites/pluginUpdateFromSite';
import type { SitePluginUpdateChoice } from '@/domains/sites/pluginUpdateFromSite';
import type { SiteThemeUpdateChoice } from '@/domains/sites/themeUpdateFromSite';
import type { LibraryItem, WordPressPlugin, WordPressTheme } from '@/types';

type ToastCopy = { title: string; message: string };

function itemLabel(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

function pluginLabel(plugin: Pick<WordPressPlugin, 'name' | 'plugin'>): string {
  return itemLabel(plugin.name, plugin.plugin);
}

function themeLabel(theme: Pick<WordPressTheme, 'name' | 'stylesheet'>): string {
  return itemLabel(theme.name, theme.stylesheet);
}

export function formatVersionForToast(version: string | null | undefined): string | undefined {
  const trimmed = version?.trim();
  if (!trimmed || trimmed === '—' || trimmed.toLowerCase() === 'latest') return undefined;
  return trimmed.replace(/^v/i, '');
}

function versionPhrase(version: string | undefined): string {
  const v = formatVersionForToast(version);
  return v ? ` v${v}` : '';
}

function withDetail(label: string, detail: string | undefined, ok: boolean): string {
  const trimmed = detail?.trim();
  if (!trimmed) return ok ? `${label} on this site.` : label;
  return ok ? `${label} — ${trimmed}` : `${label}: ${trimmed}`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function resolvePluginUpdateTargetVersion(
  plugin: WordPressPlugin,
  choice: SitePluginUpdateChoice,
  libraryItems: LibraryItem[],
  platformBridgeVersion: string | null | undefined,
): string | undefined {
  if (isBridgePluginFile(plugin.plugin)) {
    return formatVersionForToast(platformBridgeVersion);
  }
  if (choice.kind === 'library') {
    const pinned = formatVersionForToast(choice.item.versionKey ?? choice.item.version);
    if (pinned) return pinned;
  }
  return formatVersionForToast(resolvePluginAvailableUpdateVersion(plugin, libraryItems));
}

export function resolveThemeUpdateTargetVersion(
  theme: WordPressTheme,
  choice: SiteThemeUpdateChoice,
  libraryItems: LibraryItem[],
): string | undefined {
  if (choice.kind === 'library') {
    const pinned = formatVersionForToast(choice.item.versionKey ?? choice.item.version);
    if (pinned) return pinned;
  }
  return formatVersionForToast(resolveThemeAvailableUpdateVersion(theme, libraryItems));
}

export function resolveInstallTargetVersion(
  item: LibraryItem | null | undefined,
  itemKind: 'plugin' | 'theme',
  wpInfo?: { version?: string } | null,
  wpThemeInfo?: { version?: string } | null,
): string | undefined {
  if (!item) return undefined;
  if (item.source === 'official' && item.version === 'latest') {
    const latest = itemKind === 'theme' ? wpThemeInfo?.version : wpInfo?.version;
    return formatVersionForToast(latest);
  }
  return formatVersionForToast(item.versionKey ?? item.version);
}

export function pluginActionToast(
  action: 'update' | 'activate' | 'deactivate' | 'remove',
  plugin: Pick<WordPressPlugin, 'name' | 'plugin'>,
  ok: boolean,
  detail?: string,
  version?: string,
): ToastCopy {
  const label = pluginLabel(plugin);
  const titles = {
    update: ok ? 'Plugin updated' : 'Plugin update failed',
    activate: ok ? 'Plugin activated' : 'Could not activate plugin',
    deactivate: ok ? 'Plugin deactivated' : 'Could not deactivate plugin',
    remove: ok ? 'Plugin removed' : 'Could not remove plugin',
  } as const;
  const versionText = versionPhrase(version);
  const successMessages = {
    update: versionText
      ? `${label} updated to${versionText}.`
      : withDetail(`${label} updated`, detail, true),
    activate: `${label} is now active.`,
    deactivate: `${label} is now inactive.`,
    remove: `${label} was uninstalled.`,
  } as const;
  return {
    title: titles[action],
    message: ok ? successMessages[action] : withDetail(label, detail, false),
  };
}

export function themeActionToast(
  action: 'update' | 'activate' | 'remove',
  theme: Pick<WordPressTheme, 'name' | 'stylesheet'>,
  ok: boolean,
  detail?: string,
  version?: string,
): ToastCopy {
  const label = themeLabel(theme);
  const titles = {
    update: ok ? 'Theme updated' : 'Theme update failed',
    activate: ok ? 'Theme activated' : 'Could not activate theme',
    remove: ok ? 'Theme removed' : 'Could not remove theme',
  } as const;
  const versionText = versionPhrase(version);
  const successMessages = {
    update: versionText
      ? `${label} updated to${versionText}.`
      : withDetail(`${label} updated`, detail, true),
    activate: `${label} is now the active theme.`,
    remove: `${label} was removed from this site.`,
  } as const;
  return {
    title: titles[action],
    message: ok ? successMessages[action] : withDetail(label, detail, false),
  };
}

const PLUGIN_BULK_LABELS: Record<PluginsBulkAction, { ok: string; fail: string; verb: string }> = {
  activate: { ok: 'Plugins activated', fail: 'Bulk activate failed', verb: 'activated' },
  deactivate: { ok: 'Plugins deactivated', fail: 'Bulk deactivate failed', verb: 'deactivated' },
  update: { ok: 'Plugins updated', fail: 'Bulk update failed', verb: 'updated' },
  delete: { ok: 'Plugins removed', fail: 'Bulk remove failed', verb: 'removed' },
};

export function pluginsBulkToast(
  action: PluginsBulkAction,
  count: number,
  ok: boolean,
  partial: boolean,
  detail?: string,
): ToastCopy {
  const labels = PLUGIN_BULK_LABELS[action];
  const title = !ok ? labels.fail : partial ? `${labels.ok} (partial)` : labels.ok;
  const countText = countLabel(count, 'plugin', 'plugins');
  const message = ok
    ? partial && detail?.trim()
      ? detail.trim()
      : `${countText} ${labels.verb} on this site.`
    : detail?.trim() || `Could not ${labels.verb} the selected plugins.`;
  return { title, message };
}

const THEME_BULK_LABELS: Record<ThemesBulkAction, { ok: string; fail: string; verb: string }> = {
  activate: { ok: 'Themes activated', fail: 'Bulk activate failed', verb: 'activated' },
  update: { ok: 'Themes updated', fail: 'Bulk update failed', verb: 'updated' },
  delete: { ok: 'Themes removed', fail: 'Bulk remove failed', verb: 'removed' },
};

export function themesBulkToast(
  action: ThemesBulkAction,
  count: number,
  ok: boolean,
  partial: boolean,
  detail?: string,
): ToastCopy {
  const labels = THEME_BULK_LABELS[action];
  const title = !ok ? labels.fail : partial ? `${labels.ok} (partial)` : labels.ok;
  const countText = countLabel(count, 'theme', 'themes');
  const message = ok
    ? partial && detail?.trim()
      ? detail.trim()
      : `${countText} ${labels.verb} on this site.`
    : detail?.trim() || `Could not ${labels.verb} the selected themes.`;
  return { title, message };
}

export function noExtensionUpdatesToast(kind: 'plugin' | 'theme'): ToastCopy {
  const label = kind === 'plugin' ? 'plugins' : 'themes';
  return {
    title: 'No updates available',
    message: `Selected ${label} are already up to date.`,
  };
}

export function updateAllExtensionsToast(
  kind: 'plugin' | 'theme',
  count: number,
  ok: boolean,
  partial: boolean,
  detail?: string,
): ToastCopy {
  const label = kind === 'plugin' ? 'plugins' : 'themes';
  const title = !ok
    ? `Update all ${label} failed`
    : partial
      ? `All ${label} updated (partial)`
      : `All ${label} updated`;
  const countText = countLabel(count, kind, `${label}`);
  const message = ok
    ? partial && detail?.trim()
      ? detail.trim()
      : `${countText} updated on this site.`
    : detail?.trim() || `Could not update ${label} on this site.`;
  return { title, message };
}

export function extensionInstallToast(
  kind: 'plugin' | 'theme',
  name: string,
  ok: boolean,
  detail?: string,
  version?: string,
): ToastCopy {
  const label = itemLabel(name, kind);
  const titles = {
    plugin: ok ? 'Plugin installed' : 'Plugin install failed',
    theme: ok ? 'Theme installed' : 'Theme install failed',
  } as const;
  const versionText = versionPhrase(version);
  return {
    title: titles[kind],
    message: ok
      ? versionText
        ? `${label}${versionText} installed on this site.`
        : `${label} was added to this site.`
      : withDetail(label, detail, false),
  };
}

export function extensionInstallBlockedToast(kind: 'plugin' | 'theme', detail: string): ToastCopy {
  return {
    title: `Cannot install ${kind}`,
    message: detail.trim() || `This ${kind} cannot be installed from the Hub.`,
  };
}
