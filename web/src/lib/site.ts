/** Canonical origin for metadata and share links. Set ZECPROOF_SITE_URL in production. */
export const SITE_URL = (process.env.ZECPROOF_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
