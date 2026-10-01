import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import zcash from "@ledgerhq/zcash-utils";
import { Typecode, decodeUnifiedAddress, encodeUnifiedAddress, f4jumble, f4jumbleInv } from "./ua";
import { deriveTestKeys } from "./keys";

const mnemonic = generateMnemonic(wordlist, 256);

test("F4Jumble inverts across the length boundaries", () => {
  for (const len of [48, 64, 127, 128, 129, 200, 1000]) {
    const m = Uint8Array.from({ length: len }, (_, k) => (k * 31 + 7) & 0xff);
    assert.deepEqual(f4jumbleInv(f4jumble(m)), m);
  }
});

test("decodes the package's own Orchard UA and re-encodes it byte-for-byte", () => {
  // The padding check inside decode only passes if F4Jumble matches ZIP 316.
  const { ufvk } = zcash.testDeriveKeys(mnemonic, 1, "testnet");
  const ua = zcash.orchardAddressFromUfvk(ufvk);
  const { hrp, receivers } = decodeUnifiedAddress(ua);
  assert.equal(hrp, "utest");
  assert.deepEqual(receivers.map((r) => [r.typecode, r.data.length]), [[Typecode.Orchard, 43]]);
  assert.equal(encodeUnifiedAddress(hrp, receivers), ua);
});

test("full UA carries the Orchard receiver and the transparent receiver", () => {
  const keys = deriveTestKeys(mnemonic, 2, "full_ua");
  const ironwood = deriveTestKeys(mnemonic, 2, "ironwood_ua");
  const { receivers } = decodeUnifiedAddress(keys.receiveAddress);
  assert.deepEqual(receivers.map((r) => r.typecode), [Typecode.P2PKH, Typecode.Orchard]);
  const orchard = decodeUnifiedAddress(ironwood.receiveAddress).receivers[0];
  assert.deepEqual(receivers[1].data, orchard.data);
  assert.match(keys.transparentAddress!, /^tm/);
});

test("each account gets distinct keys; account 0 is refused", () => {
  const a = deriveTestKeys(mnemonic, 1, "ironwood_ua");
  const b = deriveTestKeys(mnemonic, 3, "ironwood_ua");
  assert.notEqual(a.ufvk, b.ufvk);
  assert.notEqual(a.receiveAddress, b.receiveAddress);
  assert.throws(() => deriveTestKeys(mnemonic, 0, "ironwood_ua"));
});
