# stripe-api

Stripe billing Appwrite function — path + method dispatch (same contract as `sites/wphubpro/src/lib/stripe-loader.ts`).

## Appwrite Git deploy

| Setting | Value |
|--------|--------|
| Provider root directory | `functions/stripe-api` |
| Entrypoint | `main.ts` |
| Build commands | `npm install` |
| Runtime | Node.js 22 |

**shared:** `@code045/wphubpro-shared@^1.0.11` (direct import)

**Extra deps:** `stripe@17.7.0`

## Layout (wp-proxy pattern)

```
main.ts → handler.ts → lib/routes.ts → handlers/<domain>/
```

- **`handler.ts`** — parse payload, env checks, Appwrite client, auth, dispatch
- **`lib/routes.ts`** — declarative `ROUTES` registry
- **`handlers/userBilling/dispatch.ts`** — inner `ACTION_HANDLERS` map for POST `/user-billing`
- **`lib/services/`** — Stripe + Appwrite business logic
- Handlers call `ok(res)` / `fail(res)` directly

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/config` | — |
| GET | `/plans` | — |
| GET | `/subscriptions` | JWT |
| POST | `/subscriptions` | JWT |
| GET | `/billing` | JWT |
| POST | `/user-billing` | JWT |
| POST | `/webhook` | Stripe signature |
| POST | `/internal/team-subscription/cancel` | Internal key |
| GET | `/admin/stats` | Admin |
| GET | `/admin/subscriptions` | Admin |
| GET | `/admin/subscriptions/:id` | Admin |
| POST | `/admin/subscriptions/:id/actions` | Admin |
| POST | `/admin/subscriptions/:id/cancel` | Admin |
| POST | `/admin/subscriptions/:id/pause` | Admin |
| POST | `/admin/subscriptions/:id/resume` | Admin |
| POST | `/admin/subscriptions/:id/change-price` | Admin |
| GET | `/admin/plans` | Admin |
| GET | `/admin/plans/catalog` | Admin |
| GET | `/admin/plans/catalog/:id` | Admin |
| POST | `/admin/plans/products` | Admin |
| PATCH | `/admin/plans/products/:id` | Admin |
| POST | `/admin/plans/prices` | Admin |
| POST | `/admin/plans/catalog-metadata` | Admin |
| POST | `/admin/plans/product-active` | Admin |
| POST | `/admin/plans/price-active` | Admin |
| POST | `/admin/plans/prices-major` | Admin |
| GET/POST | `/admin/plans/team-billing` | Admin |
| GET/POST | `/admin/plans/personal-billing` | Admin |
| GET | `/admin/billing` | Admin |
| GET | `/admin/billing/customers/:id/subscriptions` | Admin |
| POST | `/admin/billing/customers/plan-labels` | Admin |
| GET | `/admin/billing/invoices/:id` | Admin |
| POST | `/admin/billing/invoices/:id/send-reminder` | Admin |
| GET | `/admin/finance-dashboard` | Admin |
| GET | `/admin/subscription-rows` | Admin |
| GET | `/admin/payment-intents` | Admin |
| GET | `/admin/payment-intents/:id` | Admin |
| GET | `/admin/invoices/recent` | Admin |
| POST | `/admin/tools/reconcile-free-tier` | Admin |
| GET/POST | `/admin/tools/backfill-team-subscriptions` | Admin |

## Env

- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- Appwrite server triple (endpoint, project, API key)
- `WPHUB_INTERNAL_FUNCTION_KEY` — internal team subscription cancel

## Local

```bash
cd functions/stripe-api && npm install && npm run typecheck
```
