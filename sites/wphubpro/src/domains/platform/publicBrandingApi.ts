import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type PublicPlatformBrandingPayload = {
  platformTitle: string;
  platformSlogan: string;
  logoUrlLight: string;
  logoUrlDark: string;
  iconUrlLight: string;
  iconUrlDark: string;
};

export const publicPlatformBrandingQueryKey = ['public', 'platform-branding'] as const;

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function fetchPublicPlatformBranding(): Promise<PublicPlatformBrandingPayload> {
  const res = await executeFunction<Partial<PublicPlatformBrandingPayload>>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'public_branding' },
    { guestExecution: true },
  );
  return {
    platformTitle: trimStr(res?.platformTitle),
    platformSlogan: trimStr(res?.platformSlogan),
    logoUrlLight: trimStr(res?.logoUrlLight),
    logoUrlDark: trimStr(res?.logoUrlDark),
    iconUrlLight: trimStr(res?.iconUrlLight),
    iconUrlDark: trimStr(res?.iconUrlDark),
  };
}
