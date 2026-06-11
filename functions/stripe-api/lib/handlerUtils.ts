import { ok, fail } from '@code045/wphubpro-shared';
import type { StripeApiAppwriteRes, StripeApiCtx } from './types.ts';

export function statusFromError(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'statusCode' in e) {
    const sc = (e as { statusCode: unknown }).statusCode;
    if (typeof sc === 'number' && sc >= 400) return sc;
  }
  return undefined;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function runHandlerData(
  ctx: StripeApiCtx,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  try {
    const data = await fn();
    return ok(ctx.res, data);
  } catch (e) {
    const sc = statusFromError(e) ?? 500;
    return fail(ctx.res, errorMessage(e), sc);
  }
}

export function requireParam(params: Record<string, string>, key: string, res: StripeApiAppwriteRes) {
  const v = String(params[key] ?? '').trim();
  if (!v) {
    fail(res, `${key} is required`, 400);
    return null;
  }
  return decodeURIComponent(v);
}
