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

- **On-chain verified** — a test whose payment the worker found. Its txid and viewing key are published so anyone can re-check.
- **Community reported** — observed but not provable on-chain (e.g. the service's form rejected the address). Shown as "pending review" until an admin accepts or rejects it.
- **Unverified listing** — imported from an existing list, never tested; must carry a `source_url`.

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

Keys are derived by `@ledgerhq/zcash-utils` `testDeriveKeys` (ZIP-32 account 0 per seed); the batch file records the exact derivation. Back up each seed to your password manager with `reveal`; keep the encrypted seeds file as the offline backup. To return test funds, reveal a used seed, restore it in a wallet and send to the treasury wallet — never to a personal wallet or an exchange deposit address.

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

## Network guards

- One worker process serves one network (`ZECPROOF_NETWORK`, default `testnet`) and refuses endpoints on the other chain.
- Every `tests`, `reports` and `key_pool` row has a `network` with no default; DB `CHECK` constraints tie each viewing key (`uviewtest1`/`uview1`) and address (`utest1`/`tm` vs `u1`/`t1`) to it, and reject mainnet tests that use a worker-derived key.
- The worker imports no send/sign function. On testnet, dev-mode keys come from `WORKER_TEST_MNEMONIC` via `testDeriveKeys` (TEST-ONLY in the package; acceptable for throwaway testnet keys only).
