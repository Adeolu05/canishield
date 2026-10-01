# ZecProof

A public registry of which Zcash services actually deliver shielded withdrawals, backed by on-chain evidence. **Testnet only** for now.

Each test gets a throwaway testnet key of its own. The tester withdraws from the service to that key's address, and the worker records which pool the payment landed in. The key's viewing key is published so anyone can re-verify the result.

| Folder | What |
| --- | --- |
| `web/` | Next.js 16 (App Router) + Tailwind: board, service evidence page, "Run a test" flow |
| `worker/` | Scanner worker: assigns addresses to pending tests, watches for payments, records pool / txid / height / memo |
| `packages/db/` | Drizzle schema + migrations for `services`, `tests`, `reports` (Postgres) |
| `spike/` | Day-1 spike that proved the scanning path (standalone, not a workspace) |

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

`npm run build` typechecks db + worker and builds the web app. `npm test -w worker` runs the UA/F4Jumble tests.

## Testnet guards

- Network is hard-coded to `testnet` in the worker; it refuses to start unless the endpoint reports `chainName: "test"`.
- Only `uviewtest1…` viewing keys are accepted, in code and by a DB `CHECK` constraint; `tests.network` is constrained to `testnet`.
- The worker imports no send/sign function. Test keys come from `testDeriveKeys`, which `@ledgerhq/zcash-utils` marks TEST-ONLY — acceptable for throwaway testnet keys only.
