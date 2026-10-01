# ZecProof — Build Spec

Last updated: Oct 1, 2026 · Owner: David Peluola
Source doc: https://claude.ai/code/artifact/39691e4c-c885-4d44-ae85-c434fe54f62a

## Summary

ZecProof is a live, verifiable board that answers one question: **is this exchange, wallet or swap service Ironwood-ready?** It proves shielded Zcash support with on-chain evidence anyone can re-check, instead of self-reported lists.

**Pitch:** The Bech32 adoption page for Ironwood — proof, not claims, of where shielded ZEC actually works.

- **Track:** Colosseum Crypto World's Fair, Zcash track ($100,000 across the top 10 ZEC-integrated products).
- **Deadline:** Oct 12, 11:59 PM PT (8:59 AM Oct 13 Lagos). Final submission opens Oct 6. Target: submit Oct 11.
- **Builder:** David, solo.

## Status (Oct 1)

- Spike passed: a 1 TAZ testnet payment from the fauzec faucet was detected and classified as **IRONWOOD** (block 4,426,910, txid 848beda1…01c5) using `@ledgerhq/zcash-utils` on Windows.
- Scaffold committed (web, worker, packages/db). Not yet verified: a real payment to a worker-generated address; full-UA and transparent tests.

## Problem

Users are told to "confirm the service supports post-NU6.3 transactions" before sending, but nothing tells them how. Every existing list (ZecHub's custodial exchanges page, z.cash, blogs) is self-reported, undated and unverifiable.

- NU6.3 / Ironwood (July 2026) added a new shielded pool; Orchard is sealed.
- Most exchange withdrawal forms reject u1 addresses; exchanges never adopted UA support.
- Ledger shows shielded funds only in Ironwood; the old Zondax Ledger app is pulled Nov 5.

## MVP scope (Oct 12)

In scope:
- Public board: services × address types, with tier badges and last-tested dates
- Service detail page with every test, txid, block, memo, viewing key and re-check instructions
- "Run a test" flow: pick service + address type → fresh test address → send → auto-verify
- Scanner worker that detects the payment and records the pool it landed in
- Community report form (form accepted / rejected, screenshot, optional txid, note)
- Ironwood migration panel (counts from the registry)
- Seed data: ZecHub exchange list imported as "Unverified listing"

Out of scope (post-hackathon): scheduled re-testing, ZecProof-run exchange accounts, embeddable badges, public API with keys, status-change alerts, mobile app, moderation dashboard beyond a simple admin flag.

## Evidence model

Every claim carries a tier, a test date and its evidence. A claim older than 30 days shows as **stale** until retested.

| Tier | Meaning | Evidence |
| --- | --- | --- |
| On-chain verified | The scanner saw the payment land and recorded the pool | txid + the test address's viewing key, so anyone can re-check |
| Community reported | Observed but not provable on-chain (e.g. a form rejected the address) | Screenshot + reporter note; needs admin review |
| Unverified listing | Imported from an existing list, never tested | Link to the original source |

**Test matrix (MVP):**

| Address type | Question it answers |
| --- | --- |
| Ironwood-only UA | Does the service send to the current shielded pool? |
| Full UA (shielded + transparent) | Does it accept a UA, and which receiver does it pay? |
| Transparent | Baseline: does it work at all? |
| Sapling-only (zs1) | Deferred: the scanner package can't derive Sapling addresses; add via zingo-cli later |

**Rules:**
- One fresh, throwaway key per test. Its viewing key is published, which is safe only because the wallet holds nothing else.
- A test records the first payment it receives and ignores later ones.
- A tester can mark that a service rejected the address; that shows on the board as a result.
- Pending tests expire after 48 hours.
- Testnet only until mainnet tests are deliberately enabled.

## Architecture

- **web** (Next.js + TypeScript + Tailwind, Vercel): board, service pages, run-a-test flow, report form, API routes. Never touches Zcash cryptography.
- **worker** (Node + `@ledgerhq/zcash-utils`, Railway or small VPS): picks up pending tests, derives a fresh test address, scans via lightwalletd/Zaino, writes pool/txid/height/amount/memo back.
- **db** (Postgres: local Docker for dev, Supabase or Neon free tier in prod): `services`, `tests`, `reports`.
- **Chain access:** public endpoints (e.g. testnet.zec.rocks); support a second endpoint as fallback.

Flow: tester → web creates pending test → worker assigns address → tester sends → worker detects payment and classifies pool → web shows verified result.

## Test plan

Budget: about $5 of mainnet ZEC (in Trust Wallet). Develop on testnet with faucet TAZ.

| Target | Test | Cost | Tier |
| --- | --- | --- | --- |
| Trust Wallet | Paste each address type into its send form; send to whichever it accepts | 1 network fee | Verified + Reported |
| Zodl, YWallet, Zingo | Send to each address type | ~1 fee per send | Verified |
| Brave, Cake, Edge wallets | Same, where installable | ~1 fee per send | Verified |
| Bybit, Bitget, MEXC, Binance | Paste each address type into the withdrawal form; screenshot accept/reject; do not withdraw | Free | Reported |
| Same exchanges | Real withdrawal via community testers | Exchange fee + minimum | Verified |
| Swap services (0trace, Maya-routed) | Quote or swap to each address type | Varies | Verified or Reported |

Testnet faucets: fauzec.com (1 TAZ per address per 24h, UA/Sapling only — every fresh test address can get its own drip), faucet.testnet.valargroup.dev (0.125 TAZ per IP/day, all address types, global daily cap), zcashfaucet.jinolabs.xyz (0.1 TAZ, shielded).

Never send shielded ZEC to an exchange deposit address during testing.

## Plan

- Oct 1–2 · Prove the scanner — DONE Oct 1. Scaffold built.
- Oct 3–5 · Core loop end to end on testnet; first weekly update video; FROST workshop Oct 3.
- Oct 6–8 · Mainnet wallet tests, exchange form checks, board and evidence pages, ZecHub import. Gate Oct 8: 10+ entries on the board, else cut the report form.
- Oct 9–10 · Report form, Ironwood panel, polish, deploy app + worker, make repo public, README.
- Oct 11 · Record pitch (2–3 min) and demo (≤3 min), fill Colosseum fields, submit.

## Judging criteria

| Criterion | What ZecProof shows |
| --- | --- |
| Functionality | A live test verified on mainnet in the demo; clean, typed code |
| Potential impact | Every ZEC user choosing where to buy or which wallet to trust |
| Novelty | First registry with re-checkable on-chain proofs |
| UX | One-click test flow; plain-language results; clear tier badges |
| Open-source | Public repo (MIT) by submission; JSON export for ZecHub and wallets |
| Business plan | Free public board; paid readiness API and verified audits for wallets, exchanges and payment apps |
