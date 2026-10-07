import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Share the repo-root .env (DATABASE_URL) with the worker and db scripts.
try {
  process.loadEnvFile("../.env");
} catch {
  // No root .env: rely on the environment (e.g. in CI or production).
}

const nextConfig: NextConfig = {
  // npm workspace: trace files from the repo root, so the server functions on
  // Vercel include packages/db and packages/zcash.
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
  // /api/evidence reads screenshots from disk at request time; ship them with
  // that function (Vercel functions only see traced files, not public/).
  outputFileTracingIncludes: { "/api/evidence/*": ["./public/evidence/**/*"] },
  // Form-check screenshots are up to 4 MB (checked again in lib/form-check.ts);
  // the rest is room for the other fields and multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [
      {
        // Service logos are third-party files served from our origin: never let one
        // run script or load anything, even if opened directly.
        source: "/service-icons/:file*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Uploaded form-check screenshots: same treatment, they are images only.
        source: "/evidence/:file*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
