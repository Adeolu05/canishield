import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import zcash from "@ledgerhq/zcash-utils";
import { Typecode, decodeUnifiedAddress, encodeUnifiedAddress, f4jumble, f4jumbleInv } from "./ua";
import { assertNetworkUfvk, receiversOf, testAddresses } from "./addresses";
import { NETWORKS, looksLikeNetworkAddress, type NetworkId } from "./networks";

// Throwaway seed, generated per run; nothing is ever sent to these keys.
const mnemonic = generateMnemonic(wordlist, 256);

test("F4Jumble inverts across the length boundaries", () => {
  for (const len of [48, 64, 127, 128, 129, 200, 1000]) {
    const m = Uint8Array.from({ length: len }, (_, k) => (k * 31 + 7) & 0xff);
    assert.deepEqual(f4jumbleInv(f4jumble(m)), m);
  }
});

for (const network of ["testnet", "mainnet"] as NetworkId[]) {
  const p = NETWORKS[network];

  test(`${network}: decodes the package's own Orchard UA and re-encodes it byte-for-byte`, () => {
    // The padding check inside decode only passes if F4Jumble matches ZIP 316.
    const { ufvk } = zcash.testDeriveKeys(mnemonic, 0, network);
    const ua = zcash.orchardAddressFromUfvk(ufvk);
    const { hrp, receivers } = decodeUnifiedAddress(ua);
    assert.equal(hrp, p.uaHrp);
    assert.deepEqual(receivers.map((r) => [r.typecode, r.data.length]), [[Typecode.Orchard, 43]]);
    assert.equal(encodeUnifiedAddress(hrp, receivers), ua);
  });

  test(`${network}: test addresses carry the network's prefixes and shared receivers`, () => {
    const { ufvk, xpub } = zcash.testDeriveKeys(mnemonic, 0, network);
    assertNetworkUfvk(ufvk, network);
    const a = testAddresses(ufvk, xpub, network);
    for (const addr of [a.ironwoodUa, a.fullUa, a.transparentAddress]) assert.ok(looksLikeNetworkAddress(addr, network));
    assert.ok(a.transparentAddress.startsWith(p.tAddressPrefix));
    const full = receiversOf(a.fullUa, network);
    assert.deepEqual(full.map((r) => r.typecode), [Typecode.P2PKH, Typecode.Orchard]);
    assert.deepEqual(full[1].data, receiversOf(a.ironwoodUa, network)[0].data);
    assert.deepEqual(full[0].data, receiversOf(a.transparentAddress, network)[0].data);
  });
}

test("keys and addresses never cross networks", () => {
  const t = zcash.testDeriveKeys(mnemonic, 0, "testnet");
  const m = zcash.testDeriveKeys(mnemonic, 0, "mainnet");
  assert.throws(() => assertNetworkUfvk(t.ufvk, "mainnet"));
  assert.throws(() => assertNetworkUfvk(m.ufvk, "testnet"));
  const ta = testAddresses(t.ufvk, t.xpub, "testnet");
  assert.throws(() => receiversOf(ta.fullUa, "mainnet"));
  assert.throws(() => receiversOf(ta.transparentAddress, "mainnet"));
  assert.equal(looksLikeNetworkAddress(ta.ironwoodUa, "mainnet"), false);
});
