/**
 * stripe-api — route dispatch + handler context types.
 */
import type { Databases, Teams, Users } from '@code045/wphubpro-shared';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type StripeApiAppwriteReq = {
  headers?: Record<string, string | string[]>;
  path?: string;
  method?: string;
  body?: unknown;
  bodyRaw?: string;
  _parsedPayload?: StripeApiPayload;
};

export type StripeApiAppwriteRes = {
  json: (body: unknown, status?: number) => unknown;
};

export type StripeApiLogFn = (...args: unknown[]) => void;

export type StripeApiPayload = {
  path?: string;
  stripePath?: string;
  method?: string;
  body?: Record<string, unknown>;
  [key: string]: unknown;
};

export type StripeApiCtx = {
  req: StripeApiAppwriteReq;
  res: StripeApiAppwriteRes;
  log: StripeApiLogFn;
  error: StripeApiLogFn;
  path: string;
  method: HttpMethod;
  searchParams: URLSearchParams;
  body: Record<string, unknown>;
  payload: StripeApiPayload;
  routeParams: Record<string, string>;
  databases?: Databases;
  users?: Users;
  teams?: Teams;
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
  executorUserId?: string;
};

export type StripeApiHandler = (ctx: StripeApiCtx) => Promise<unknown>;

export type RouteDef = {
  method: HttpMethod;
  path: string | RegExp;
  handler: StripeApiHandler;
  needsAppwrite?: boolean;
  needsAuth?: boolean;
  needsStripeSecret?: boolean;
  needsPublishableKey?: boolean;
  needsWebhookSecret?: boolean;
};

export type UserBillingActionKey =
  | 'list-invoices'
  | 'list-plans'
  | 'create-checkout-session'
  | 'cancel-subscription'
  | 'get-subscription'
  | 'get-customer'
  | 'list-payment-methods'
  | 'create-setup-intent'
  | 'attach-payment-method'
  | 'detach-payment-method'
  | 'set-default-payment-method'
  | 'get-subscription-details'
  | 'preview-proration'
  | 'prepare-pay-invoice'
  | 'update-customer'
  | 'add-customer-tax-id'
  | 'delete-customer-tax-id'
  | 'list-customer-tax-ids'
  | 'ensure-customer'
  | 'cancel-scheduled-change'
  | 'billing-portal'
  | 'create-team-checkout-session'
  | 'finalize-team-checkout'
  | 'list-team-invoices'
  | 'sync-team-stripe-customer-email'
  | 'transfer-team-ownership';

export type UserBillingCtx = StripeApiCtx & {
  userId: string;
  stripe: import('stripe').default;
  databases: Databases;
};

export type UserBillingHandler = (
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) => Promise<unknown>;
