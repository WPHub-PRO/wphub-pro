/// <reference types="vite/client" />

/** Appwrite + Stripe keys read in the SPA (see `vite.config.ts` `envPrefix`). */
interface ImportMetaEnv {
  readonly APPWRITE_ENDPOINT?: string;
  readonly APPWRITE_PROJECT_ID?: string;
  readonly APPWRITE_DATABASE_ID?: string;
  /** Legacy id for `ADMIN_TEAM_ID` (contact routing); not used for platform admin auth. */
  readonly APPWRITE_ADMIN_TEAM_ID?: string;
  /** Server-only in tooling; do not use from browser `src/`. */
  readonly APPWRITE_API_KEY?: string;
  readonly STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_FREE_PRICE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
