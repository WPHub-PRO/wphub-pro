import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import type {
  LayoutPositionType,
  LayoutSkinType,
  LayoutThemeType,
  LayoutWidthType,
  SideNavType,
  TopBarType,
} from '@/types/layout';

export type PublicHubLayoutPayload = {
  skin: LayoutSkinType;
  theme: LayoutThemeType;
  topBarColor: TopBarType['color'];
  menuColor: SideNavType['color'];
  sidenavSize: SideNavType['size'];
  sidenavUser: boolean;
  layoutPosition: LayoutPositionType;
  layoutWidth: LayoutWidthType;
};

export const publicHubLayoutQueryKey = ['public', 'platform-hub-layout'] as const;

const DEFAULTS: PublicHubLayoutPayload = {
  skin: 'modern',
  theme: 'light',
  topBarColor: 'light',
  menuColor: 'light',
  sidenavSize: 'default',
  sidenavUser: false,
  layoutPosition: 'fixed',
  layoutWidth: 'fluid',
};

const SKINS = new Set<LayoutSkinType>([
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
const THEMES = new Set<LayoutThemeType>(['light', 'dark', 'system']);
const TOP = new Set<TopBarType['color']>(['light', 'dark', 'gray', 'gradient']);
const MENU = new Set<SideNavType['color']>(['light', 'dark', 'gray', 'gradient', 'image']);
const SIZE = new Set<SideNavType['size']>([
  'default',
  'compact',
  'condensed',
  'on-hover',
  'on-hover-active',
  'offcanvas',
]);
const POS = new Set<LayoutPositionType>(['fixed', 'scrollable']);
const WIDTH = new Set<LayoutWidthType>(['fluid', 'boxed']);

function pickSkin(v: unknown): LayoutSkinType {
  return typeof v === 'string' && SKINS.has(v as LayoutSkinType) ? (v as LayoutSkinType) : DEFAULTS.skin;
}

function pickTheme(v: unknown): LayoutThemeType {
  return typeof v === 'string' && THEMES.has(v as LayoutThemeType) ? (v as LayoutThemeType) : DEFAULTS.theme;
}

function pickTop(v: unknown): TopBarType['color'] {
  return typeof v === 'string' && TOP.has(v as TopBarType['color']) ? (v as TopBarType['color']) : DEFAULTS.topBarColor;
}

function pickMenu(v: unknown): SideNavType['color'] {
  return typeof v === 'string' && MENU.has(v as SideNavType['color'])
    ? (v as SideNavType['color'])
    : DEFAULTS.menuColor;
}

function pickSize(v: unknown): SideNavType['size'] {
  return typeof v === 'string' && SIZE.has(v as SideNavType['size'])
    ? (v as SideNavType['size'])
    : DEFAULTS.sidenavSize;
}

function pickBool(v: unknown, d: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return d;
}

function pickPos(v: unknown): LayoutPositionType {
  return typeof v === 'string' && POS.has(v as LayoutPositionType)
    ? (v as LayoutPositionType)
    : DEFAULTS.layoutPosition;
}

function pickWidth(v: unknown): LayoutWidthType {
  return typeof v === 'string' && WIDTH.has(v as LayoutWidthType)
    ? (v as LayoutWidthType)
    : DEFAULTS.layoutWidth;
}

export function normalizePublicHubLayout(raw: Partial<PublicHubLayoutPayload> | null | undefined): PublicHubLayoutPayload {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  return {
    skin: pickSkin(raw.skin),
    theme: pickTheme(raw.theme),
    topBarColor: pickTop(raw.topBarColor),
    menuColor: pickMenu(raw.menuColor),
    sidenavSize: pickSize(raw.sidenavSize),
    sidenavUser: pickBool(raw.sidenavUser, DEFAULTS.sidenavUser),
    layoutPosition: pickPos(raw.layoutPosition),
    layoutWidth: pickWidth(raw.layoutWidth),
  };
}

export async function fetchPublicHubLayout(): Promise<PublicHubLayoutPayload> {
  const res = await executeFunction<Partial<PublicHubLayoutPayload>>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'public_hub_layout' },
    { guestExecution: true },
  );
  return normalizePublicHubLayout(res ?? undefined);
}
