import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey } from '../lib/settingsStore.ts';

const DEFAULTS = {
  skin: 'modern',
  theme: 'light',
  topBarColor: 'dark',
  menuColor: 'dark',
  sidenavSize: 'default',
  sidenavUser: false,
  layoutPosition: 'fixed',
  layoutWidth: 'fluid',
};

const SKINS = new Set([
  'default',
  'material',
  'modern',
  'saas',
  'flat',
  'minimal',
  'galaxy',
  'retro',
  'neon',
  'pixel',
]);
const THEMES = new Set(['light', 'dark', 'system']);
const TOP = new Set(['light', 'dark', 'gray', 'gradient']);
const MENU = new Set(['light', 'dark', 'gray', 'gradient', 'image']);
const SIZE = new Set(['default', 'compact', 'condensed', 'on-hover', 'on-hover-active', 'offcanvas']);
const POS = new Set(['fixed', 'scrollable']);
const WIDTH = new Set(['fluid', 'boxed']);

function pick(v, allowed, fallback) {
  return typeof v === 'string' && allowed.has(v) ? v : fallback;
}

function pickBool(v, fallback) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

export default async function handlePublicHubLayout({ res, error, databases }) {
  try {
    const row = await getSettingValueByKey(databases, 'platform_hub_layout');
    const out = {
      skin: pick(row.skin, SKINS, DEFAULTS.skin),
      theme: pick(row.theme, THEMES, DEFAULTS.theme),
      topBarColor: pick(row.topBarColor, TOP, DEFAULTS.topBarColor),
      menuColor: pick(row.menuColor, MENU, DEFAULTS.menuColor),
      sidenavSize: pick(row.sidenavSize, SIZE, DEFAULTS.sidenavSize),
      sidenavUser: pickBool(row.sidenavUser, DEFAULTS.sidenavUser),
      layoutPosition: pick(row.layoutPosition, POS, DEFAULTS.layoutPosition),
      layoutWidth: pick(row.layoutWidth, WIDTH, DEFAULTS.layoutWidth),
    };
    return ok(res, out);
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
