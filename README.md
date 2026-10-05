# ZecProof

A public registry of which Zcash services actually deliver shielded withdrawals, backed by on-chain evidence. Runs on **testnet** by default; mainnet is built but off (see below).

Each test gets a throwaway key of its own. The tester withdraws from the service to that key's address, and the worker records which pool the payment landed in. The key's viewing key is published so anyone can re-verify the result.

| Folder | What |
| --- | --- |
| `web/` | Next.js 16 (App Router) + Tailwind: mainnet board at `/`, testnet at `/testnet`, service evidence pages, "Run a test" flow |
| `worker/` | Scanner worker: assigns addresses to pending tests, watches for payments, records pool / txid / height / memo |
| `packages/db/` | Drizzle schema + migrations: `services`, `tests`, `reports`, `key_batches`, `key_pool` (Postgres) |
| `packages/zcash/` | Network profiles, UA/F4Jumble encoding, test-address derivation, key-batch format |
| `keygen/` | **Offline** key tool: one seed per test, encrypted seeds file, wallet verification. Never deployed. |
| `spike/` | Day-1 spike that proved the scanning path (standalone, not a workspace) |
| `docs/SPEC.md` | Build spec |

## Evidence tiers

- **On-chain verified**: a test whose payment the worker found. Its txid and viewing key are published so anyone can re-check.
- **Community reported**: observed but not provable on-chain (e.g. the service's form rejected the address). Shown as "pending review" until an admin accepts or rejects it. Includes **withdrawal form checks** (below), with `method: "withdrawal_form_check"`.
- **Unverified listing**: imported from an existing list, never tested; must carry a `source_url`.
- **Community research**: a product-level claim (e.g. "Ironwood supported") that a contributor read from the product's official page, stored apart in `research_claims`. Never tested, never fills a matrix cell, never counts toward readiness. Shown as "Claimed: … · per community research (orb)" with the official link, side by side with any ZecHub listing for the same service, never merged with it.

Claims older than 30 days show as **Stale** until retested. The mainnet board opens with an Ironwood readiness panel (verified Ironwood / transparent only / rejected / untested), counted from on-chain and community evidence only.

## Data export and listings

- `GET /api/results.json` (mainnet) or `?network=testnet`: readiness counts, every service's cells with dates and staleness, verified tests with txid and viewing key, community reports and listings. CORS-open and cached for a minute, format `zecproof-results/1`.
- `npm run import:zechub -w @zecproof/db` loads [`packages/db/data/zechub-custodial-exchanges.json`](packages/db/data/zechub-custodial-exchanges.json), a dated snapshot of ZecHub's custodial exchanges page (commit `31decdb815`, read 2026-10-02), as **Unverified listing** claims. Re-running replaces only that source's listings. Listing claims read as claims ("Listed: transparent only", "Listed: shielded/UA accepted", always "per ZecHub") and use `listedClaim` in the export, never the `outcome` values of tests and community reports.
- `npm run import:research -w @zecproof/db` loads [`docs/research/orb-zec-research-2026-10-02-v2.md`](docs/research/orb-zec-research-2026-10-02-v2.md) (community research by orb, read 2026-10-02) into `research_claims` and adds any new wallets, exchanges, swaps and hardware wallets to the mainnet board. Re-running replaces only that source's rows. Every row must be mapped or skipped in `packages/db/src/research.ts`, so a new row in a later version fails the import instead of being guessed at; server-only tools (zecd, zcash-walletd, Zallet, zcashd) are skipped. Corrections show as "No longer supports ZEC" (KuCoin, YWallet; sorted last) or "Listing status disputed: check pending" (Bitget). The export lists them under `research` with `researchClaim` codes and `researchCredit`.

## Scanner status

Each cycle that reaches an endpoint, the worker upserts one row per network into `worker_heartbeats` (tip, endpoint, time). The header pill reads it via `GET /api/scanner-status?network=…`: **Scanner online** if the last heartbeat is under 90 s old, otherwise a grey **Scanner offline**. Heartbeats are not evidence. After pulling this change, run `npm run db:migrate` and **restart any running worker** (testnet and mainnet) so it starts writing heartbeats.

## Chain endpoints

Each network has its own list, tried in order each cycle; the worker stops if an endpoint it reaches is on the wrong chain.

- Testnet (`ZECPROOF_TESTNET_GRPC_URLS`): `testnet.zec.rocks` → `zaino.testnet.unsafe.zec.rocks`
- Mainnet (`ZECPROOF_MAINNET_GRPC_URLS`): `na.zec.rocks` → `eu.zec.rocks` → `zaino.unsafe.zec.rocks`

## Mainnet (off by default)

Nothing touches mainnet unless the worker has `ZECPROOF_NETWORK=mainnet` **and** `ZECPROOF_ALLOW_MAINNET=yes`, and the web app has `ZECPROOF_ENABLE_MAINNET_TESTS=yes`. A mainnet worker uses only offline-generated keys, refuses to start if any seed (`WORKER_TEST_MNEMONIC`) is readable, and marks a result verified only after 10 confirmations and an independent explorer check (ZecBlock, then Blockchair).

Key workflow (seeds never leave the offline machine):

```bash
# On an offline machine, outside any git checkout:
npm run keygen -w keygen -- generate --network mainnet --count 20 --birthday <current height> --out <dir>
npm run keygen -w keygen -- reveal --seeds <dir>/<batch>.seeds.enc.json --index 0
#   → restore that seed in Zingo, copy the unified address (and t-address) it shows
npm run keygen -w keygen -- verify --batch <dir>/<batch>.public.json --index 0 --address <zingo u1…> --address <zingo t1…>
# Copy ONLY the .public.json to the worker host:
ZECPROOF_ALLOW_MAINNET=yes npm run pool:import -w worker -- <batch>.public.json
```

Keys are derived by `@ledgerhq/zcash-utils` `testDeriveKeys` (ZIP-32 account 0 per seed); the batch file records the exact derivation. Use `reveal` to type each seed into Bitwarden by hand; keep the encrypted seeds file (outside the repo, not cloud-synced) as the second copy. To return test funds, reveal a used seed, restore it in a wallet and send to the treasury wallet. Never send to a personal wallet or an exchange deposit address.

Treasury (sweep destination; Zingo, Ironwood/Orchard receiver only):

```text
u1k4cq54vwua52vle8cvqamyl9mhgzusd0p50enuq9jc3j8evra07r8zx9737wz66f9vj5tmf8wv5f66sjpmcp99s2qr630vy4wu0rf490
```

The first mainnet test, step by step on Windows: [docs/RUNBOOK-mainnet.md](docs/RUNBOOK-mainnet.md).

The whole pool path can be rehearsed on testnet: generate a `--network testnet` batch, verify, import, and run the worker with `WORKER_TEST_MNEMONIC=` (empty) and `ZECPROOF_REQUIRED_CONFIRMATIONS=10 ZECPROOF_EXPLORER_CHECK=on`.

## Test matrix (MVP)

| Address type | Receivers | What it answers |
| --- | --- | --- |
| `ironwood_ua` | Orchard only | Does the service accept a shielded-only UA? (Lands in Ironwood after NU6.3.) |
| `full_ua` | Orchard + P2PKH | Given a choice, does the service pay the shielded or the transparent receiver? |
| `transparent` | `tm…` address | Baseline. |

Sapling is deferred: the scanner detects Sapling notes, but nothing in the stack derives a Sapling receiver yet.

## Local setup

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env                 # then set WORKER_TEST_MNEMONIC:
npm run new-mnemonic -w worker       # paste the output into .env
npm run db:up                        # Postgres 17 in Docker
npm run db:migrate
npm run db:seed
npm run dev:worker                   # terminal 1
npm run dev:web                      # terminal 2 → http://localhost:3000
```

`npm run build` typechecks every package and builds the web app. `npm test` runs the zcash, keygen and worker tests.

## Withdrawal form checks

`/report/form-check` (mainnet) logs whether a service's withdrawal form accepts an address, without submitting it: no key is assigned and no funds move. Pick the service, the address type and the result (accepted by the form / rejected), copy the exact error text if any, set the date and attach a screenshot. The reference addresses are the mainnet Trust Wallet test addresses of each type, prefilled in the form.

- Stored as a community report (`method = withdrawal_form_check`, unreviewed), with `error_text`, `observed_at` and the pasted `address`. Database checks allow only "form accepted" or "address rejected" for this method, and only addresses encoded for the report's network.
- Shown as **Form accepted (not submitted)** or **Address rejected**, tier Community reported, with the screenshot. A form accept never counts as verified and never as Ironwood-ready; a UA rejection counts toward "Rejects unified addresses", like any community rejection.
- Screenshots: PNG or JPEG only, up to 4 MB and 8000 px a side, checked by their bytes; EXIF, XMP and text metadata are stripped. Saved under `web/public/evidence/` with a generated name and served by `/api/evidence/<file>` (`next start` does not serve files added to `public/` after a build), sandboxed and `nosniff`.
- Open in development; in production only with `ZECPROOF_ENABLE_FORM_CHECKS=yes`. There is no login, so keep it off on any public deployment.
- Export: `communityReports[]` carry `method`, `methodLabel`, `errorText`, `observedAt` and `address`; community cells carry `method`.
- Batch logging from screenshots on disk: `web/scripts/log-form-checks.mts` (dry run by default, `--apply` to store) runs the same validation, metadata stripping and storage as the page (`lib/form-check.ts`, `lib/form-check-store.ts`) and skips checks already logged. It was used for the Oct 5, 2026 checks of Bitget, MEXC and Binance.
- Review: a community report moves from "Pending review" to "Reviewed (maintainer)" with `reviewed_by` and `reviewed_at` recorded (a database check requires both). A review changes the review state only: the report stays Community reported and never counts as verified. The export carries `reviewStatus`, `reviewedBy` and `reviewedAt`. `web/scripts/attach-and-review-oct5.mts` attached the Oct 2 Trust Wallet screenshots to their existing reports (after matching each screenshot's address to the report's test address; earlier links kept in the note) and marked those two plus the nine Oct 5 form checks as reviewed.
- A research claim of "listing status disputed" is shown as resolved (the original claim and its date stay) once a later form check on that service shows the form accepting an address; the export adds `resolution` next to the original `researchClaim`.

## Service icons

Logos are fetched once, by hand, from each service's own website and served from our origin; visitors' browsers never contact the services, and no third-party favicon service is used.

```
npm run fetch:icons -w @zecproof/db              # missing icons only
npm run fetch:icons -w @zecproof/db -- --force   # refetch all
npm run fetch:icons -w @zecproof/db -- --only=binance,kraken
```

The script looks at the page's `<link>` icons, its web app manifest (`<link rel="manifest">`, `manifest.json`, `site.webmanifest`), the usual paths (`apple-touch-icon.png`, `favicon.svg`, `favicon.png`) and, as a last resort, `.ico` files, whose largest frame is converted to PNG locally (no extra dependency). Services without a website (Vizor, ZKOOL, YWallet, Nighthawk: orb's sources are app-store or GitHub links) are skipped.

Files land in `web/public/service-icons/<slug>.png` or `.svg`. The script checks the bytes, limits every download and converted file to 256 KB, refuses SVGs with scripts, event handlers or external references, and the folder is served with a sandboxing CSP. A file added by hand works too: the script rebuilds `web/src/lib/service-icons.json` from the folder. Services without an icon show a monogram. Review the files before committing them.

## Network guards

- One worker process serves one network (`ZECPROOF_NETWORK`, default `testnet`) and refuses endpoints on the other chain.
- Every `tests`, `reports` and `key_pool` row has a `network` with no default; DB `CHECK` constraints tie each viewing key (`uviewtest1`/`uview1`) and address (`utest1`/`tm` vs `u1`/`t1`) to it, and reject mainnet tests that use a worker-derived key.
- The worker imports no send/sign function. On testnet, dev-mode keys come from `WORKER_TEST_MNEMONIC` via `testDeriveKeys` (TEST-ONLY in the package; acceptable for throwaway testnet keys only).

## License

- **Code:** MIT (see [LICENSE](LICENSE)).
- **ZecProof results** (verified tests, community reports, readiness counts): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit "ZecProof" with a link.
- **Unverified listings** adapted from the ZecHub Wiki (ZecHub contributors) stay under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), their source's license, and are marked separately on the board and in `/api/results.json` (`license` vs `listingsLicense`).

## Credits

Community research by orb ([X @ArtofOrb](https://x.com/ArtofOrb) · [zec-os.com](https://zec-os.com)): the wallet and exchange claims marked "per community research (orb)". Listings from the ZecHub Wiki (ZecHub contributors). See [docs/CREDITS.md](docs/CREDITS.md).

## Author

Built by David Peluola · X [@0xdavee_](https://x.com/0xdavee_)
