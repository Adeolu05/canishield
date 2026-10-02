import type { NextConfig } from "next";

// Share the repo-root .env (DATABASE_URL) with the worker and db scripts.
try {
  process.loadEnvFile("../.env");
} catch {
  // No root .env: rely on the environment (e.g. in CI or production).
}

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
