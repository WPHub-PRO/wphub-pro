import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';

import { executeFunction, type HttpMethod } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

const viteEnv = import.meta.env as Record<string, string | undefined>;

function readPublishableKey(): string {
  return (viteEnv.STRIPE_PUBLISHABLE_KEY || viteEnv.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
}

/** Publishable key from `STRIPE_PUBLISHABLE_KEY` or `VITE_STRIPE_PUBLISHABLE_KEY` (see `vite.config.ts`). */
export function getStripePublishableKey(): string {
  return readPublishableKey();
}

let stripePromise: Promise<StripeJs | null> | null = null;

/**
 * Singleton `loadStripe` — same key resolution as `getStripePublishableKey`.
 */
export function getStripe(): Promise<StripeJs | null> {
  const key = readPublishableKey();
  if (!key) {
    return Promise.resolve(null);
  }
  if (!stripePromise) {
    stripePromise = loadStripe(key) as Promise<StripeJs | null>;
  }
  return stripePromise;
}

function stripeExecutionMethod(raw: string | undefined): HttpMethod {
  const m = (raw ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') return m;
  return 'GET';
}

async function stripeViaAppwriteFunction<T>(path: string, init?: RequestInit): Promise<T> {
  const method = stripeExecutionMethod(init?.method);
  let body: unknown;
  if (init?.body != null && typeof init.body === 'string') {
    const t = init.body.trim();
    if (t) {
      try {
        body = JSON.parse(t) as unknown;
      } catch {
        body = {};
      }
    }
  }
  /** Appwrite maps these to `req.path` / `req.method`; keep JSON body in sync for `stripe-api` `parsePayload`. */
  return executeFunction<T>(
    APPWRITE_FUNCTION_IDS.STRIPE_API,
    { path, method, body },
    { path, method },
  );
}

/**
 * Stripe JSON routes — dispatched by the `stripe-api` Appwrite function (`path` + `method` + `body`).
 */
export async function fetchStripeJson<T>(path: string, init?: RequestInit): Promise<T> {
  return stripeViaAppwriteFunction<T>(path, init);
}

export async function postStripeJson<T>(path: string, body: unknown): Promise<T> {
  return fetchStripeJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchStripeJson<T>(path: string, body: unknown): Promise<T> {
  return fetchStripeJson<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Same as `fetchStripeJson` — session is the Appwrite client used by `executeFunction`. */
export async function fetchStripeJsonAuthed<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchStripeJson<T>(path, init);
}

/** Same as `postStripeJson` — authenticated by the logged-in Appwrite session. */
export async function postStripeJsonAuthed<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return fetchStripeJson<T>(path, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
  });
}
