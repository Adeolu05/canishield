# CanIShield scanner worker. Build from the repo root (the worker uses the
# packages/db and packages/zcash workspaces):
#   docker build -f worker/Dockerfile -t zecproof-worker .
#
# Debian (glibc), not Alpine: @ledgerhq/zcash-utils ships a linux-x64-gnu
# native binary (needs glibc 2.34+) and no musl build.
FROM node:24-bookworm-slim

WORKDIR /app

# Workspace manifests first, so the install layer is cached across code changes.
# npm ci needs every workspace listed in package-lock.json to be present.
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/zcash/package.json packages/zcash/
COPY keygen/package.json keygen/
COPY worker/package.json worker/
COPY web/package.json web/
# Only the worker's dependency tree (plus the db/zcash workspaces it uses).
# Dev dependencies stay: the worker runs TypeScript through tsx.
RUN npm ci --workspace worker --no-audit --no-fund && npm cache clean --force

COPY packages/db packages/db
COPY packages/zcash packages/zcash
COPY worker worker

# Fail the build, not the deploy, if the native binary doesn't load here.
RUN node -e "require('@ledgerhq/zcash-utils').testDeriveKeys" >/dev/null

ENV NODE_ENV=production
# A hosted worker holds viewing keys only: it always uses the offline key pool,
# and refuses to start if a seed (WORKER_TEST_MNEMONIC) is in its environment.
# Mainnet still needs ZECPROOF_NETWORK=mainnet AND ZECPROOF_ALLOW_MAINNET=yes.
ENV ZECPROOF_KEY_SOURCE=pool

USER node
WORKDIR /app/worker
# tsx directly (not npm start) so SIGTERM reaches the process on redeploys.
CMD ["/app/node_modules/.bin/tsx", "src/index.ts"]
