import type {
  LayoutPositionType,
  LayoutSkinType,
  LayoutThemeType,
  LayoutWidthType,
  SideNavType,
  TopBarType,
} from '@/types/layout';

/** Skins compiled in `src/assets/scss/app.scss` (`config/_theme-*.scss` + `data-skin` selectors). */
export const PLATFORM_HUB_SKIN_OPTIONS: { value: LayoutSkinType; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'material', label: 'Material' },
  { value: 'modern', label: 'Modern' },
  { value: 'saas', label: 'SaaS' },
  { value: 'flat', label: 'Flat' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'galaxy', label: 'Galaxy' },
  { value: 'retro', label: 'Retro' },
  { value: 'neon', label: 'Neon' },
  { value: 'pixel', label: 'Pixel' },
];

export const PLATFORM_BS_THEME_OPTIONS: { value: LayoutThemeType; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const PLATFORM_TOPBAR_COLOR_OPTIONS: { value: TopBarType['color']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'gray', label: 'Gray' },
  { value: 'gradient', label: 'Gradient' },
];

export const PLATFORM_MENU_COLOR_OPTIONS: { value: SideNavType['color']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'gray', label: 'Gray' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image' },
];

export const PLATFORM_SIDENAV_SIZE_OPTIONS: { value: SideNavType['size']; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'compact', label: 'Compact' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'on-hover', label: 'On hover' },
  { value: 'on-hover-active', label: 'On hover (active)' },
  { value: 'offcanvas', label: 'Offcanvas' },
];

export const PLATFORM_LAYOUT_POSITION_OPTIONS: { value: LayoutPositionType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'scrollable', label: 'Scrollable' },
];

export const PLATFORM_LAYOUT_WIDTH_OPTIONS: { value: LayoutWidthType; label: string }[] = [
  { value: 'fluid', label: 'Fluid' },
  { value: 'boxed', label: 'Boxed' },
];
