# Deploying ZecProof (Windows, PowerShell 7)

What goes where:

| Part | Host | Config in the repo |
| --- | --- | --- |
| Web app (`web/`) | **Vercel** | `web/vercel.json`, `web/next.config.ts`, `web/.env.example` |
| Database | **Neon** (Postgres 17, SSL) | `packages/db/migrations`, `npm run db:migrate:hosted` |
| Scanner worker (`worker/`) | **Railway** (always on, Docker) | `worker/Dockerfile`, `railway.json`, `worker/.env.example` |

Rules for the whole session:

- Use **PowerShell 7** (`pwsh`) in the repo folder: `Set-Location C:\Users\USER\Projects\zecproof`.
- Connection strings contain a password. Paste them only into Neon/Vercel/Railway dashboards and into the `Read-Host` prompts below. Never into the repo, a `.env.example`, a commit, an issue or a chat.
- The hosted worker gets **viewing keys only**. Never give Railway (or Vercel) a seed, `WORKER_TEST_MNEMONIC`, a `.seeds.enc.json` file or the keygen passphrase.
- Never run `docker compose down -v`: it deletes your local database, which is the source for step 2.
- Mainnet stays off throughout. Turning it on is a separate step at the end.

---

## 0. Before you start

```powershell
Set-Location C:\Users\USER\Projects\zecproof
git checkout main
git pull
npm install
npm run build
docker compose up -d postgres
npm run db:migrate
```

Expected: the build ends without errors, and `db:migrate` prints `Migrations applied.` Your local database is now on the latest schema, which is what you'll copy.

Stop any worker you're running locally (Ctrl+C in its window). From step 2 on, Neon is the real database; anything written locally after the copy won't be on the site.

---

## 1. Create the Neon database

1. Go to <https://console.neon.tech> → **New Project**.
   - Name: `zecproof`
   - **Postgres version: 17** (the same as the local Docker image).
   - Region: pick one close to you and use **the same region** for Vercel's functions later (e.g. AWS US East 1 / Washington, D.C. or AWS Europe Central 1 / Frankfurt).
2. Open the project → **Dashboard** → **Connect**. You need two connection strings. Leave the dialog open; you'll copy from it in later steps.
   - **Pooled**: "Connection pooling" switched **on**. The host contains `-pooler`. Used by **Vercel**.
   - **Direct**: "Connection pooling" switched **off**. No `-pooler` in the host. Used by **Railway**, the data copy and migrations.
   - Both end in `?sslmode=require` (and maybe `&channel_binding=require`). Keep that; the app handles both.

Note on cost: the worker polls every 30 seconds, so Neon's compute never goes to sleep. 0.25 CU running all month is about 180 compute-hours. Check that your Neon plan allows that (Project → **Settings** → **Compute**), or expect the free plan's allowance to run out.

---

## 2. Copy your local data to Neon (pg_dump / pg_restore inside Docker)

The `postgres` container already has `pg_dump`/`pg_restore` 17, so nothing needs installing on Windows. The dump stays inside the container and is deleted at the end.

**2a. Get the Direct string into a variable without it showing on screen:**

```powershell
$Direct = Read-Host "Neon DIRECT connection string (no -pooler)" -MaskInput
```

Paste it from Neon's **Connect** dialog (pooling **off**) and press Enter.

**2b. Dump the local database (inside the container):**

```powershell
docker compose exec postgres pg_dump -U zecproof -d zecproof -Fc --no-owner --no-acl -f /tmp/zecproof.dump
```

Expected: no output.

**2c. Restore it into the empty Neon database (also from inside the container):**

```powershell
docker compose exec -e TARGET="$Direct" postgres sh -c 'pg_restore --no-owner --no-acl -d "$TARGET" /tmp/zecproof.dump'
```

Expected: no output, or only warnings. If it prints `ERROR:` lines, stop and send me the output. Don't restore twice into the same database; to retry, delete and recreate the Neon project's `neondb` database (Neon → **Databases**) first.

**2d. Compare row counts, local vs Neon:**

```powershell
$Q = 'select (select count(*) from services) as services, (select count(*) from tests) as tests, (select count(*) from reports) as reports, (select count(*) from key_pool) as key_pool, (select count(*) from drizzle.__drizzle_migrations) as migrations;'
docker compose exec -e Q="$Q" postgres sh -c 'psql -U zecproof -d zecproof -c "$Q"'
docker compose exec -e TARGET="$Direct" -e Q="$Q" postgres sh -c 'psql "$TARGET" -c "$Q"'
```

Expected: the two tables of numbers are identical.

**2e. Run the migrations against Neon (should be a no-op now):**

```powershell
$env:DATABASE_URL = $Direct
npm run db:migrate:hosted
Remove-Item Env:DATABASE_URL
```

Expected: `Applying migrations to ep-….neon.tech/neondb` then `Migrations applied.` This is also **the one command** for future schema changes (see "Later" below).

**2f. Delete the dump from the container:**

```powershell
docker compose exec postgres rm /tmp/zecproof.dump
```

---

## 3. Deploy the web app on Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pick `zecproof` (grant Vercel access to the repo if it asks).
2. On the **Configure Project** screen:
   - **Root Directory**: click **Edit** → choose `web` → **Continue**.
   - **Framework Preset**: Next.js (detected).
   - **Build and Output Settings**: leave all overrides **off**. `web/vercel.json` sets them: install `cd .. && npm ci` (the whole npm workspace, from the repo root), build `next build`.
   - **Environment Variables**: add
     - `DATABASE_URL` = the **Pooled** string from Neon (host contains `-pooler`).
     - Nothing else yet. Do **not** add `ZECPROOF_ENABLE_MAINNET_TESTS` or `ZECPROOF_ENABLE_FORM_CHECKS`.
3. Click **Deploy**. Expected: the build log ends with the route list and "Deployment completed".
4. After the first deploy, in the project:
   - **Settings → Build and Deployment → Node.js Version**: `24.x` (`web/package.json` pins `24.x` too).
   - **Settings → Build and Deployment → Root Directory**: check that **"Include files outside the root directory in the Build Step"** is **enabled** (it is by default; the web app needs `packages/`).
   - **Settings → Functions → Function Region**: the same region as Neon.

The DB client notices Neon's pooled host and turns off prepared statements, keeps at most 3 connections per function instance, and closes idle ones after 20 s.

---

## 4. Set ZECPROOF_SITE_URL

1. Note the site address: Vercel project → **Domains** (e.g. `https://zecproof.vercel.app`, or your own domain if you add one there).
2. **Settings → Environment Variables** → add `ZECPROOF_SITE_URL` = that address, with `https://` and **no trailing slash**. Environment: Production (and Preview if you want).
3. **Deployments** → the latest one → **⋯** → **Redeploy**. Environment variable changes only apply to new deployments.

(Without it, Vercel's production domain is used, so share links work either way; set it so they use your chosen domain.)

---

## 5. Deploy the scanner worker on Railway

**5a. Check the testnet key pool.** The hosted worker uses the key pool only (viewing keys imported from an offline keygen batch), never a seed. Count unused testnet pool keys in Neon:

```powershell
$Q = "select network, status, count(*) from key_pool group by 1, 2 order by 1, 2;"
docker compose exec -e TARGET="$Direct" -e Q="$Q" postgres sh -c 'psql "$TARGET" -c "$Q"'
```

- If there's a `testnet | available` row with a count above zero: go on to 5b.
- If not (your local testnet worker used `WORKER_TEST_MNEMONIC`): create a testnet batch the same way as the mainnet runbook, with `--network testnet`, verify one seed in Zingo (testnet), then import it into Neon:

  ```powershell
  npm run keygen -w keygen -- generate --network testnet --count 20 --birthday <testnet height> --out $Keys
  npm run keygen -w keygen -- verify --batch <file.public.json> --index 0 --address <zingo-testnet-ua>
  $env:DATABASE_URL = $Direct
  npm run pool:import -w worker -- <file.public.json>
  Remove-Item Env:DATABASE_URL
  ```

  Only the `.public.json` file is imported. Tests already waiting for a payment keep working: their viewing key is stored on the test itself.

**5b. Create the service:**

1. <https://railway.com/new> → **Deploy from GitHub repo** → `zecproof`.
2. Railway reads `railway.json` at the repo root: it builds `worker/Dockerfile` (Node 24, Debian) and restarts the worker whenever it exits. Leave **Root Directory** empty (the build needs `packages/`).
3. Open the service → **Variables** → add:
   - `DATABASE_URL` = the **Direct** string from Neon (no `-pooler`).
   - `ZECPROOF_NETWORK` = `testnet`
   - Nothing else. **Never** `WORKER_TEST_MNEMONIC` (the worker refuses to start with it) and don't override `ZECPROOF_KEY_SOURCE`.
4. **Settings → Networking**: no public domain needed. The worker makes outbound connections only.
5. **Settings → Deploy**: Serverless / App Sleeping **off** (also set in `railway.json`). Replicas: **1**.
6. Deploy (Railway starts automatically after you add variables; otherwise **Deploy**).

Expected in **Deployments → View logs**:

```
worker    network=testnet keys=pool confirmations=1 explorer=off
          endpoints: https://testnet.zec.rocks:443, https://zaino.testnet.unsafe.zec.rocks:443
          N unused testnet pool key(s)
using     https://testnet.zec.rocks:443 (tip …)
```

If it says `Config: …`, the message names the setting to fix. If it says `DATABASE_URL is not set`, the variable is missing on this service.

---

## 6. Check everything

Open the site (your `ZECPROOF_SITE_URL`) and tick each:

- [ ] **Board loads**: `/` shows the mainnet board with services and icons; `/testnet` shows the testnet board.
- [ ] **Scanner online**: on `/testnet` the header pill says **Scanner online** within about a minute of the worker starting. (On `/` it stays **Scanner offline** until a mainnet worker exists. That's expected.)
- [ ] **Export**: `/api/results.json` and `/api/results.json?network=testnet` return JSON starting with `{"format":"zecproof-results/1"`.
- [ ] **Evidence screenshots**: open a service with a form check (e.g. `/services/binance`) and click a screenshot link; the image loads from `/api/evidence/…`.
- [ ] **404s**: `/no-such-page` and `/services/no-such-service` show the ZecProof "not found" page.
- [ ] **No mainnet test button**: on `/`, the hero button reads **Try a test on testnet** (not "Run a test"); untested services show no "Help test this" link; ⌘K / Ctrl+K lists "Run a test · testnet" only; `/test` says mainnet tests aren't open.
- [ ] **Form checks closed**: `/report/form-check` says form checks aren't open here.
- [ ] **Testnet test works end to end**: `/testnet/test` → pick a service → you get an address within ~30 s (the worker assigned a pool key).

---

## Later

**Schema changes.** When a change adds a file under `packages/db/migrations`, apply it to Neon **before** merging it to `main` (migrations here only add things, so the running site keeps working):

```powershell
git pull
$env:DATABASE_URL = Read-Host "Neon DIRECT connection string" -MaskInput
npm run db:migrate:hosted
Remove-Item Env:DATABASE_URL
```

Then merge: Vercel and Railway redeploy `main` by themselves.

**Logging form checks.** `/report/form-check` stays off on Vercel; it also couldn't store screenshots there (read-only filesystem). Log them on your PC with `npm run dev:web` and the root `.env`'s `DATABASE_URL` set to the Neon **Direct** string, then commit the new file in `web/public/evidence/` and push, so the deployed site can serve it.

**Turning mainnet on** (only after `docs/RUNBOOK-mainnet.md` is done and the mainnet pool is imported into Neon with `$env:DATABASE_URL = $Direct` and `$env:ZECPROOF_ALLOW_MAINNET = "yes"`):

1. Railway: **+ New → GitHub Repo → zecproof** again, a second service. Variables: `DATABASE_URL` (Direct), `ZECPROOF_NETWORK=mainnet`, `ZECPROOF_ALLOW_MAINNET=yes`. Both are required; with only one it refuses to start. Check the logs show `network=mainnet keys=pool confirmations=10 explorer=on`.
2. Vercel: add `ZECPROOF_ENABLE_MAINNET_TESTS=yes` → Redeploy.

**Turning it off again**: remove `ZECPROOF_ENABLE_MAINNET_TESTS` on Vercel and redeploy; remove the mainnet Railway service (or its `ZECPROOF_ALLOW_MAINNET`).

---

## Every variable

| Variable | Where | Value |
| --- | --- | --- |
| `DATABASE_URL` | Vercel | Neon **pooled** string (`-pooler`), `sslmode=require` |
| `ZECPROOF_SITE_URL` | Vercel | `https://your-domain`, no trailing slash |
| `ZECPROOF_ENABLE_MAINNET_TESTS` | Vercel | unset (off). `yes` only once a mainnet worker runs |
| `ZECPROOF_ENABLE_FORM_CHECKS` | Vercel | unset (off). Leave it off on any public deployment |
| `DATABASE_URL` | Railway | Neon **direct** string (no `-pooler`), `sslmode=require` |
| `ZECPROOF_NETWORK` | Railway | `testnet` (or `mainnet` on the second service) |
| `ZECPROOF_ALLOW_MAINNET` | Railway | unset, or `yes` on the mainnet service only |
| `ZECPROOF_TESTNET_GRPC_URLS` / `ZECPROOF_MAINNET_GRPC_URLS` | Railway | optional; defaults are built in |
| `TEST_TTL_HOURS` | Railway | optional; default 48 |
| `ZECPROOF_KEY_SOURCE` | Railway | **don't set**; the image pins `pool` |
| `WORKER_TEST_MNEMONIC` | — | **never** on Vercel or Railway |

Templates with placeholders only: `web/.env.example` (Vercel), `worker/.env.example` (Railway), `.env.example` (local).
