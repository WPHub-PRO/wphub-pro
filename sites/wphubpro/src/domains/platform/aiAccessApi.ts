import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type CreateAiAccessLinkResult = {
  success?: boolean;
  url?: string;
  expiresAt?: string;
  ttlMinutes?: number;
  label?: string;
  message?: string;
};

export type RedeemAiAccessLinkResult = {
  success?: boolean;
  userId?: string;
  secret?: string;
  sessionTokenExpiresInSec?: number;
  message?: string;
};

export async function createAiAccessLink(opts: {
  ttlMinutes?: number;
  label?: string;
}): Promise<CreateAiAccessLinkResult> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return executeFunction<CreateAiAccessLinkResult>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    {
      action: 'create_ai_access_link',
      origin,
      ttlMinutes: opts.ttlMinutes,
      ...(opts.label?.trim() ? { label: opts.label.trim() } : {}),
    },
    { omitImpersonationHeaders: true },
  );
}

export async function redeemAiAccessLinkGuest(token: string): Promise<RedeemAiAccessLinkResult> {
  return executeFunction<RedeemAiAccessLinkResult>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'redeem_ai_access_link', token },
    { guestExecution: true },
  );
}
