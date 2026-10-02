# Credits

People who helped ZecProof. Every contribution here must be credited on the
board (next to the data it produced), in the README and in the Colosseum
submission. Do not remove an entry without asking the person.

## Community research

### orb (Discord: orb.ism)
- **What:** researched which wallets claim ZEC, shielded and Ironwood (NU6.3)
  support, with app versions and links to official sources. Posted in the
  Zcash Global community call chat on Oct 2, 2026; files saved in
  `docs/research/` (orb-zec-research-2026-10-02-v1.md and -v2.md; v2 has
  sources and is the one to import).
- **Used for:** the "Claimed: ... per community research (orb)" listings
  and the next wave of wallet tests (Zodl, Cake, Edge, Unstoppable).
- **Credit as (confirmed by orb, Oct 2):** name "orb", linking to X
  (preferred): https://x.com/ArtofOrb. A secondary link to
  https://zec-os.com is also fine.
- **Where it is credited (Oct 2):**
  - every research claim on a service page: "Community research by orb"
    (links to X) · zec-os.com, next to the official source link;
  - inline on the board: "Claimed: … · per community research (orb)";
  - the site footer credits line;
  - the README "Credits" section;
  - `/api/results.json`: each item in `research` carries `credit`, plus a
    top-level `researchCredit`.
- **Imported:** 38 claims from v2 (`npm run import:research -w @zecproof/db`),
  27 new services. Server-only tools (zecd, zcash-walletd, Zallet, zcashd)
  were not added to the board.

## Data sources

### ZecHub
- **What:** the ZecHub Wiki custodial exchanges list, imported as
  "Unverified listing · per ZecHub" (CC BY-SA 4.0).
