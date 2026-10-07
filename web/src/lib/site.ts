import { BRAND } from "./brand";

/**
 * Canonical origin for metadata and share links. ZECPROOF_SITE_URL wins (the
 * env var keeps its internal name); on Vercel it falls back to the project's
 * production domain, then to the public URL; locally, localhost.
 */
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  process.env.ZECPROOF_SITE_URL ||
  (vercelProduction ? `https://${vercelProduction}` : process.env.VERCEL ? BRAND.url : "http://localhost:3000")
).replace(/\/$/, "");
