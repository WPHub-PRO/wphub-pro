import type { SideNavType } from '@/types/layout';

/**
 * Narrow icon rail — use compact chrome (single admin toggle, bridge download icon only).
 * Wide / “expanded” sidebar uses full admin labels + underline on active, and full bridge panel.
 */
export function isSidebarCollapsedForChrome(size: SideNavType['size']): boolean {
  return size === 'condensed' || size === 'on-hover';
}

/** Workspace switcher moves to the app topbar (next to the menu toggle) when the icon rail is active or the menu is off-canvas. */
export function isWorkspaceSwitcherInTopBar(size: SideNavType['size']): boolean {
  return isSidebarCollapsedForChrome(size) || size === 'offcanvas';
}
