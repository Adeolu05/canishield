# Deposit checks and timing: build spec

Status: draft for review · Owner: David Peluola · Written 28 Oct 2026
Origin: suggestion from squirrel (ZecHub) on the Zcash 10th Anniversary community call, 28 Oct 2026: after the NU7 upgrade, let people confirm whether they can deposit into a service the same way they confirm withdrawals, and record how long it takes.

Target: live before NU7 activates (block 3,543,405, around 5 Nov), so the first deposit and timing results come from the post-NU7 retest on 5 to 7 Nov.

---

## 1. What we are adding, in one paragraph

Today Can I Shield? answers one question per service: **will it pay my shielded address?** (a withdrawal test). This adds the reverse question, **can I send to it from a shielded wallet, and does it get credited?** (a deposit check), and adds **how long** to both directions: for a withdrawal, from the moment the tester requested it to the moment it landed on-chain; for a deposit, from the moment it landed on-chain to the moment the service credited it.

## 2. Why this matters (and why it is not already covered)

- A withdrawal test proves what a service *sends*. It says nothing about what it *accepts*.
- Exchanges hand out three kinds of deposit address, and each behaves differently for a shielded user:
  - **Transparent (t1 / t3):** a shielded wallet can send to it (the payment leaves the shielded pool on-chain). Whether the exchange then credits it, holds it for review, or rejects it is unknown and undocumented.
  - **TEX (ZIP 320, `tex1…`):** a transparent-only address. A wallet may pay it only from transparent inputs, so shielded wallets that support TEX send in two steps: shielded to a one-time transparent address, then on to the exchange. Wallets without TEX support cannot pay it at all.
  - **Unified (u1…):** rare for deposits. If offered, a shielded payment stays shielded.
- Timing: users ask "how long will this take?" and nobody publishes measured numbers. NU7 cuts block time from 75 s to 25 s, so every exchange's confirmation rules and real waits change on activation day.

## 3. Rules that do not change

These come from the main SPEC and stay true:

1. **Never send from a Can I Shield test key to an exchange deposit address.** Test keys have published viewing keys, which show outgoing payments too. Deposit checks always use the tester's own wallet; Can I Shield never holds or derives a key for them.
2. Evidence tiers stay separate and are never merged into one cell. Deposit checks get their own column group and their own tier (section 6).
3. Results older than 30 days are stale until retested.
4. Mainnet stays behind the existing switches. Deposit checks add a fourth switch (section 10).

## 4. Withdrawal timing (small, ships first)

### What we measure

| Field | Source | Trust |
| --- | --- | --- |
| `requested_at` | tester enters the time they clicked "withdraw" (their timezone, converted to UTC) | tester-reported, optional screenshot |
| `block_time` | header time of the block the payment landed in | on-chain |
| `time_to_chain` | `block_time - requested_at` | derived; shown as tester-reported |
| `confirmed_at` | when our worker saw the required confirmations (10 on mainnet) | ours |

`block_time` comes from the explorer response we already fetch for the cross-check (ZecBlock returns `blockTime`, Unix seconds). If the explorer is unavailable, read it from the compact block at that height (lightwalletd `GetBlock`, field `time`). Both are block header times: they can be off by a minute or two from wall-clock time, so durations under 3 minutes are shown as "under 3 min", never to the second.

### UI

- On the test page, while waiting for payment and after, an optional field: "When did you request this withdrawal?" (date and time, local timezone shown, plus optional screenshot link of the withdrawal history).
- Service page and board: "Withdrawal reached the chain in 14 min (reported request time)". With several results, show the median and the range, never an average.
- If `requested_at` is later than `block_time`, refuse it with "That's after the payment landed on-chain, please check the time".

### Data model

`tests`: add `requested_at timestamptz NULL`, `requested_evidence_url text NULL`, `block_time timestamptz NULL`.
CHECK: `requested_at IS NULL OR block_time IS NULL OR requested_at <= block_time + interval '5 minutes'` (allows for block-time skew).

### Worker

When a receipt is first seen, store `block_time` from the explorer check or from the compact block. Nothing else changes.

## 5. Deposit checks (the main feature)

### The flow, from the tester's side

1. **Pick the service** (exchanges and swap services; wallets are already covered by withdrawal tests, because "depositing into a wallet" is just receiving).
2. **Tell us the deposit address type.** The tester pastes the deposit address the service shows them. The browser decodes it and shows the type ("TEX address: transparent-only, needs a TEX-capable wallet", or "Transparent address", or "Unified address with Orchard + transparent receivers"). The address is sent to the server only to compute a keyed hash (section 7) and is then discarded; it is never stored in plain text and never published.
3. **Get a check amount.** We generate a unique amount: the tester picks a base at or above the service's minimum deposit (we show the minimum if known), and we add 1 to 9,999 random zatoshis. Example: base 0.01 ZEC → send exactly **0.01004217 ZEC**. This ties the on-chain payment to this check without publishing anything: only the tester and our database know the amount, and it is deleted after review (section 7).
4. **Send it from a shielded wallet.** The tester says which wallet and version (for example "Zodl 3.18"), because TEX support depends on the wallet.
5. **Paste the txid.** For a TEX deposit, the txid of the second step (the payment to the exchange).
6. **Report the result** when it happens, with a screenshot of the service's deposit history (account details cropped):
   - credited (time credited, and the number of confirmations the service showed, if any),
   - not credited after 24 hours,
   - held or flagged for review by the service,
   - the wallet could not pay this address (for example, a wallet without TEX support refused it). This one needs no txid.

### What the worker verifies on-chain

From the explorer (`/api/tx/{txid}` on ZecBlock, which returns `valueBalanceSapling/Orchard/IronwoodZat`, transparent `inputs` and `outputs` (as JSON strings, each input with `prev_txid` and `address`), `blockTime` (Unix seconds), `confirmations` and `isCanonical`):

1. The tx is on the main chain with at least 10 confirmations (mainnet).
2. **Destination:** a transparent output whose value equals the check amount exactly, and whose address hash matches the keyed hash of the deposit address the tester gave (for TEX, compare against the P2PKH address with the same 20-byte hash).
3. **Source is shielded**, one of:
   - **Direct:** the tx itself spends from a shielded pool: `valueBalanceIronwood`, `valueBalanceOrchard` or `valueBalanceSapling` is positive (value leaving that pool). Record which pool.
   - **Two-step (TEX):** the tx has only transparent inputs, and the transaction that created each of those inputs spent from a shielded pool (one hop back, using each input's `prev_txid`). Record "via TEX, from <pool>".
   - Otherwise the source is transparent: the check is refused ("this deposit did not come from a shielded wallet").
4. Store `block_time` for the timing.

> Sign checked on 28 Oct 2026 against a real mainnet transaction: `040d7fa5099dd63184d85f524d7413a2ff5e46b34af412f51d535e0627d7586d` (block 3,533,851) has no transparent inputs, one transparent output of 10,000,000 zat to a t1 address, a 15,000 zat fee, and `valueBalanceIronwoodZat` = +10,015,000. So a positive value balance means value leaving that shielded pool, exactly the protocol definition. Save this transaction's JSON as the "direct Ironwood" fixture.

If the deposit address was a **unified address**, the payment stays shielded and its destination cannot be seen on-chain. The worker can still verify the tx exists and spends from a shielded pool, but not where it went: such a check is marked "destination not visible on-chain" and relies on the screenshot alone.

If ZecBlock is unavailable, retry later. Blockchair is not used for deposit checks, because its value fields are wrong for v6 (Ironwood) transactions.

### Statuses

`awaiting_tx` → `verifying` → `onchain_ok` (waiting for the tester's credit report) → `reported` (credit result in, waiting for review) → `published`
Side exits: `refused` (on-chain check failed, with reason), `expired` (no txid within 48 h, or no credit report within 7 days of `onchain_ok`), `wallet_refused` (step 6, last option).

## 6. Evidence tier for deposits

Deposit results are **on-chain checked, privately**: our worker verified the payment on-chain, but the txid is not published, so the public cannot re-check it the way they can a withdrawal test. This is weaker than "On-chain verified" and stronger than "Community reported", so it gets its own label:

| Tier | Shown as | What backs it |
| --- | --- | --- |
| On-chain verified | existing | public txid + viewing key, anyone can re-check |
| **On-chain checked (private)** | new, deposits only | our worker matched txid, amount and address hash; maintainer reviewed the credit screenshot |
| Community reported | existing | screenshot + note, reviewed |

The "credited" part of a deposit is always reviewed evidence (a screenshot), because crediting happens inside the exchange, not on-chain. The board says so in plain words.

## 7. Privacy

A deposit address belongs to the tester's verified exchange account. Publishing it, or the txid, or the exact amount would link that deposit (and the shielded wallet it came from) to them. So:

| Data | Stored | Published |
| --- | --- | --- |
| Deposit address | never in plain text; only `HMAC-SHA256(server secret, address)` and its decoded type and receivers | type only |
| Check amount | until review, then deleted | never |
| txid | until review, then deleted (keep only `HMAC(txid)` to stop the same tx being reused) | never |
| Block height | until review, then deleted | never |
| Block time | kept | date only (day), plus durations |
| Source pool (Ironwood / Orchard / Sapling / via TEX) | kept | yes |
| Wallet used | kept | yes |
| Credit result, confirmations shown, time to credit | kept | yes |
| Screenshot | link kept for review, then deleted | never |

- Durations are rounded (under 3 min, then whole minutes, then hours), so they cannot be used to find the block.
- The page tells the tester all of this before they start, and tells them to crop account numbers, emails and balances out of screenshots.
- The server secret for the HMACs lives only in the web app's and worker's environment, never in the repo.

## 8. Data model

New enums:
- `deposit_address_type`: `transparent_p2pkh`, `transparent_p2sh`, `tex`, `unified`
- `deposit_source`: `ironwood`, `orchard`, `sapling`, `via_tex_ironwood`, `via_tex_orchard`, `via_tex_sapling`
- `deposit_result`: `credited`, `not_credited_24h`, `held_for_review`, `wallet_refused`
- `deposit_status`: `awaiting_tx`, `verifying`, `onchain_ok`, `reported`, `published`, `refused`, `expired`, `wallet_refused`

New table `deposit_checks`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `service_id` | uuid → services | |
| `network` | text | no default, CHECK like the other tables |
| `status` | deposit_status | |
| `address_type` | deposit_address_type | |
| `ua_receivers` | text[] NULL | for unified: e.g. `{orchard, p2pkh}` |
| `address_hmac` | text | never the address |
| `check_amount_zat` | bigint NULL | deleted after review |
| `wallet` | text | e.g. "Zodl 3.18" |
| `txid` | text NULL | deleted after review |
| `txid_hmac` | text NULL UNIQUE | stops reuse of the same tx |
| `height` | integer NULL | deleted after review |
| `block_time` | timestamptz NULL | |
| `source` | deposit_source NULL | from the on-chain check |
| `result` | deposit_result NULL | from the tester |
| `credited_at` | timestamptz NULL | tester-reported |
| `confirmations_shown` | integer NULL | tester-reported, from the service's UI |
| `evidence_url` | text NULL | deleted after review |
| `refused_reason` | text NULL | |
| `reviewed_by`, `reviewed_at` | | like reports |
| `expires_at`, `created_at`, `updated_at` | | |

CHECKs:
- `published` requires `reviewed_by` and `reviewed_at`, and requires `txid`, `check_amount_zat`, `height` and `evidence_url` to be NULL (privacy rule enforced by the database, not by memory).
- `result = 'credited'` requires `credited_at`, and `credited_at >= block_time`.
- `wallet_refused` needs no txid; every other non-expired status past `awaiting_tx` needs `txid_hmac`.

## 9. Worker

A new step in each cycle, after the existing ones:

1. Pick `deposit_checks` in `verifying`.
2. Fetch the tx from ZecBlock. Not found or under 10 confirmations: leave it for the next cycle (give up after 48 h with `refused: tx not found`).
3. Run the checks in section 5. Pass: `onchain_ok`, with `source`, `height` and `block_time`. Fail: `refused` with a plain reason ("no output for the check amount", "deposit came from a transparent wallet", "address does not match the one you gave").
4. The step never throws out of the cycle: errors are logged per check, like `scanAwaiting`.

Pure functions, unit tested with saved explorer JSON:
- `classifyDepositSource(tx, prevTxs)`, covering direct Ironwood, direct Orchard, via TEX, transparent source, and a UA destination.
- `matchesDeposit(tx, checkAmountZat, addressHmac, hmac)`, covering an exact match, an amount off by 1 zat, the wrong address, and TEX matched to the same-hash t1.
- `decodeDepositAddress(address, network)`, covering t1, t3, tex (bech32m, 20-byte hash), u1 with receivers, and testnet prefixes on mainnet (refused).

## 10. Web

- **Board:** a "Deposit" column group next to the withdrawal columns, with these columns:
  - deposit address type
  - shielded deposit: credited / held / not credited / untested
  - typical time to credit (post-NU7)
- **Service page:** a "Deposits" section listing each published check:
  - date
  - wallet used
  - source pool
  - address type
  - result
  - confirmations shown
  - time to credit
  - the tier label

  Plus a short explainer of TEX.
- **New flow:** `/test/deposit` (testnet: `/testnet/test/deposit`) with the six steps in section 5, a progress view, and the privacy notice up front.
- **Admin review:** list `reported` checks with the screenshot; accept (moves to `published` and clears private fields in the same transaction) or reject with a reason.
- **Export:** `results.json` gains `depositChecks` with only the published columns, and `canishield-results/1` stays backward compatible (new key only).
- **Switch:** `ZECPROOF_ENABLE_DEPOSIT_CHECKS=yes` on the web app, per network, so testnet goes first.

## 11. NU7

- Activation height 3,543,405 (expected 5 to 6 Nov). Every timing result stores `block_time` and height-derived "before NU7 / after NU7" (computed from height before height is deleted).
- The board shows only after-NU7 timings once there are any; before-NU7 timings stay on the service page, labelled.
- Retest campaign on 5 to 7 Nov: Binance, MEXC, Bitget, plus any exchange a tester offers. Withdrawal timing and deposit checks for each.

## 12. Plan

| When | What |
| --- | --- |
| 29 to 30 Oct | Withdrawal timing (section 4): migration, worker `block_time`, test page field, board and service display. Ship to testnet, then mainnet. |
| 30 Oct to 2 Nov | Deposit checks backend: enums, table, address decoding (TEX), HMACs, worker step and its unit tests with saved explorer JSON. |
| 2 to 3 Nov | Deposit flow pages, admin review, board column group, export. Testnet end to end (TAZ from a shielded testnet wallet to a testnet t-address and to a tex address). |
| 4 Nov | Mainnet switch on. One real deposit check ourselves (small amount, own exchange account) to prove the path. Update README and SPEC. |
| 5 to 7 Nov | NU7 retest campaign; publish "which exchanges take shielded deposits, and how long withdrawals take, after NU7". |
| by 13 Nov | Results feed the retro grant application. |

## 13. Open questions

1. Minimum deposit per exchange: collect from each exchange's deposit page at check time, or let the tester enter it?
2. Is a screenshot enough for "credited", or do we also accept the exchange's deposit-history CSV (more reliable, but more personal data to clean)?
3. Swap services (for example NEAR Intents-based ones) also take deposits: include them in the first release or after?
4. Ask squirrel: would ZecHub link the deposit results from its exchanges page, and is there interest in a ZecHub bounty for the post-NU7 retest campaign (testers need exchange accounts and small amounts)?
