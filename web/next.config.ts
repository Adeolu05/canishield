import type { NextConfig } from "next";

// Share the repo-root .env (DATABASE_URL) with the worker and db scripts.
try {
  process.loadEnvFile("../.env");
} catch {
  // No root .env: rely on the environment (e.g. in CI or production).
}

const nextConfig: NextConfig = {};

export default nextConfig;
