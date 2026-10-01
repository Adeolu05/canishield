# ZecProof spike — which pool did a payment land in?

Testnet only. Uses [`@ledgerhq/zcash-utils`](https://www.npmjs.com/package/@ledgerhq/zcash-utils) 2.5.0 (Apache-2.0) for shielded scanning and the lightwalletd gRPC API ([lightwallet-protocol](https://github.com/zcash/lightwallet-protocol), MIT — `proto/`) for transparent UTXOs.

```bash
npm install
npm run spike            # one pass: birthday → tip
npm run spike -- --watch # poll every 30 s
```

First run creates a throwaway testnet wallet in `.wallet/` (gitignored — it holds a mnemonic) and prints a shielded UA and a transparent `tm…` address. Fund either from a testnet faucet, wait for a block, and the scan prints `IRONWOOD`, `SAPLING`, `TRANSPARENT` (or `ORCHARD (!)`, which should not happen after NU6.3).

View-only mode: `ZECPROOF_UFVK=uviewtest1… ZECPROOF_BIRTHDAY=<height> npm run spike` (no transparent check in this mode).

## Safety

- Network is hard-coded to `testnet`; the endpoint must report `chainName: "test"`; only `uviewtest1…` keys are accepted.
- No send/sign export from the package is imported.
- Keys come from `testDeriveKeys`, which the package marks TEST-ONLY. Fine for throwaway testnet keys; never for real funds.

## Known gaps

- No Sapling address: the package only derives the Orchard-receiver UA. Sapling notes *are* detected if someone pays this UFVK's Sapling receiver.
- Transparent address is derived locally (`tpub/0/0`, P2PKH `tm` prefix) and has not yet been cross-checked against another wallet.
- Mined blocks only; mempool and reorgs are ignored.
