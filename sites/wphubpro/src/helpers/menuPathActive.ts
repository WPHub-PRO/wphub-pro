import { ROUTE_PATHS } from '@/config/routePaths';
import type { MenuItemType } from '@/types/layout';

/**
 * Whether the current pathname should mark a menu `url` as active.
 * @param urlMatch `exact` = only `pathname === url`; `prefix` = also nested paths (default).
 */
export function menuPathActive(
  url: string | undefined,
  pathname: string,
  urlMatch: MenuItemType['urlMatch'] = 'prefix',
): boolean {
  if (!url) return false;
  if (pathname === url) return true;
  if (urlMatch === 'exact') return false;
  if (url === ROUTE_PATHS.ADMIN_DASHBOARD) return false;
  if (url === ROUTE_PATHS.DOCS) return pathname.startsWith(`${ROUTE_PATHS.DOCS}/`) || pathname === ROUTE_PATHS.DOCS;
  return pathname.startsWith(`${url}/`);
}
