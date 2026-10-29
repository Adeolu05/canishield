# ZecBlock transaction fixtures

Real mainnet transactions as returned by `https://api.zecblock.com/api/tx/{txid}`,
read on 29 Oct 2026, trimmed to the fields the deposit check reads (long
output lists are cut to the first few outputs). Public chain data, used by
`src/deposits.test.ts`.

| File | What it shows |
| --- | --- |
| `direct_ironwood.json` | Spends from Ironwood straight to a t-address (`valueBalanceIronwoodZat` > 0, no transparent inputs) |
| `direct_sapling.json` | Same, from Sapling |
| `tex_step1.json`, `tex_step2.json` | A two-step payment: Sapling to a one-time t-address, then that whole output on to the destination (the shape ZIP 320 TEX payments take) |
| `transparent.json`, `transparent_prev.json` | A purely transparent payment and the transaction that funded its first input |
