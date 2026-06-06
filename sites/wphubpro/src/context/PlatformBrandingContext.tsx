import logoDarkFallback from '@/assets/images/logo-black.png';
import logoLightFallback from '@/assets/images/logo.png';
import iconFallback from '@/assets/images/logo-sm.png';
import {
  fetchPublicPlatformBranding,
  publicPlatformBrandingQueryKey,
  type PublicPlatformBrandingPayload,
} from '@/domains/platform/publicBrandingApi';
import { appDescription, appName } from '@/helpers';
import type { ChildrenType } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

export type ResolvedPlatformBranding = PublicPlatformBrandingPayload & {
  /** Wordmark for light chrome (topbar / sidebar `.logo-light`). */
  logoLightSrc: string;
  /** Wordmark for dark chrome (`.logo-dark`). */
  logoDarkSrc: string;
  /** Square mark for light chrome (collapsed sidebar / compact). */
  iconLightSrc: string;
  /** Square mark for dark chrome. */
  iconDarkSrc: string;
  /** Shown in `<title>` suffix and breadcrumb root when no page title. */
  displaySiteName: string;
  /** Meta description fallback uses slogan when set. */
  metaDescription: string;
};

const emptyPayload: PublicPlatformBrandingPayload = {
  platformTitle: '',
  platformSlogan: '',
  logoUrlLight: '',
  logoUrlDark: '',
  iconUrlLight: '',
  iconUrlDark: '',
};

function resolveBranding(data: PublicPlatformBrandingPayload): ResolvedPlatformBranding {
  const displaySiteName = data.platformTitle || appName;
  const metaDescription = data.platformSlogan || appDescription;
  return {
    ...data,
    logoLightSrc: data.logoUrlLight || logoLightFallback,
    logoDarkSrc: data.logoUrlDark || logoDarkFallback,
    iconLightSrc: data.iconUrlLight || iconFallback,
    iconDarkSrc: data.iconUrlDark || iconFallback,
    displaySiteName,
    metaDescription,
  };
}

const PlatformBrandingContext = createContext<ResolvedPlatformBranding>(resolveBranding(emptyPayload));

function applyFaviconLinks(iconLight: string, iconDark: string) {
  const existing = document.querySelectorAll('link[data-wphub-platform-icon="1"]');
  existing.forEach((el) => el.remove());

  const head = document.head;
  const append = (href: string, media: string | null) => {
    if (!href) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    link.setAttribute('data-wphub-platform-icon', '1');
    if (media) link.setAttribute('media', media);
    head.appendChild(link);
  };

  const light = iconLight.trim();
  const dark = iconDark.trim();
  if (light && dark) {
    append(light, '(prefers-color-scheme: light)');
    append(dark, '(prefers-color-scheme: dark)');
    return;
  }
  if (light) append(light, null);
  else if (dark) append(dark, null);
}

export const PlatformBrandingProvider = ({ children }: ChildrenType) => {
  const q = useQuery({
    queryKey: publicPlatformBrandingQueryKey,
    queryFn: fetchPublicPlatformBranding,
    staleTime: 60_000,
    retry: false,
  });

  const value = useMemo(() => resolveBranding(q.data ?? emptyPayload), [q.data]);

  useEffect(() => {
    applyFaviconLinks(value.iconUrlLight, value.iconUrlDark);
  }, [value.iconUrlLight, value.iconUrlDark]);

  return <PlatformBrandingContext.Provider value={value}>{children}</PlatformBrandingContext.Provider>;
};

export function usePlatformBranding(): ResolvedPlatformBranding {
  return useContext(PlatformBrandingContext);
}

/** Optional subtitle next to the brand in layouts (empty when unset). */
export function PlatformBrandingSubtitle(): ReactNode {
  const { platformSlogan } = usePlatformBranding();
  if (!platformSlogan.trim()) return null;
  return <span className="text-muted fw-normal ms-2 fs-sm d-none d-md-inline">{platformSlogan}</span>;
}
