// postgres.js options for a DATABASE_URL: local Docker Postgres in development,
// Neon (serverless, SSL) in production. Pure, so it is tested without a database.
import type { Options } from "postgres";

// libpq-only URL parameters. postgres.js forwards unknown parameters to the
// server as settings, and Postgres rejects these (Neon's console adds
// channel_binding=require to its connection strings).
const LIBPQ_ONLY = ["channel_binding", "gssencmode", "sslcert", "sslkey", "sslcrl", "sslsni", "passfile"];

export interface ConnectionSettings {
  url: string;
  options: Options<Record<string, never>>;
}

export function connectionSettings(rawUrl: string, env: Record<string, string | undefined> = process.env): ConnectionSettings {
  const url = new URL(rawUrl);
  for (const p of LIBPQ_ONLY) url.searchParams.delete(p);

  const neon = url.hostname.endsWith(".neon.tech");
  // Neon only accepts TLS; don't depend on the string carrying sslmode=require.
  if (neon && !url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");

  // Serverless functions (Vercel): few connections per instance, closed when
  // idle so a frozen instance doesn't hold sockets. Long-running processes
  // (worker, scripts): a small pool kept open.
  const serverless = Boolean(env.VERCEL);
  return {
    url: url.toString(),
    options: {
      max: serverless ? 3 : 5,
      ...(serverless ? { idle_timeout: 20 } : {}),
      connect_timeout: 15,
      // Neon's pooled host ("-pooler") is PgBouncer in transaction mode: no
      // named prepared statements across transactions.
      prepare: !url.hostname.includes("-pooler."),
    },
  };
}
