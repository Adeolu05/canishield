/**
 * Canonical origin for metadata and share links. Set ZECPROOF_SITE_URL in
 * production; on Vercel it falls back to the project's production domain.
 */
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  process.env.ZECPROOF_SITE_URL || (vercelProduction ? `https://${vercelProduction}` : "http://localhost:3000")
).replace(/\/$/, "");
