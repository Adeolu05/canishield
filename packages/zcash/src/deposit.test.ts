import { test } from "node:test";
import assert from "node:assert/strict";
import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { DepositAddressError, checkAmountZat, decodeDepositAddress, depositHmac } from "./deposit";
import { encodeUnifiedAddress } from "./ua";

const b58 = createBase58check(sha256);
const T1 = "t1KfKBK2P13DUPu7EhHWz5XcFAjx1zHXAQb"; // a real mainnet P2PKH address (public chain data)
const hash = b58.decode(T1).slice(2);
const err = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    assert.ok(e instanceof DepositAddressError, String(e));
    return e.message;
  }
  assert.fail("expected an error");
};

test("deposit: mainnet t1 and t3", () => {
  assert.deepEqual(decodeDepositAddress(T1, "mainnet"), { kind: "transparent_p2pkh", onChain: T1, label: "Transparent address (t-address)" });
  const t3 = b58.encode(new Uint8Array([0x1c, 0xbd, ...hash]));
  assert.ok(t3.startsWith("t3"));
  assert.equal(decodeDepositAddress(t3, "mainnet").kind, "transparent_p2sh");
  assert.equal(decodeDepositAddress(`  ${T1}\n`, "mainnet").onChain, T1, "trims whitespace");
});

test("deposit: TEX decodes to the P2PKH address with the same hash (ZIP 320 example)", () => {
  // The example pair from ZIP 320.
  const d = decodeDepositAddress("tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte", "mainnet");
  assert.equal(d.kind, "tex");
  assert.equal(d.onChain, "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC");
  // Round trip from our own t1.
  const tex = bech32m.encode("tex", bech32m.toWords(hash));
  assert.equal(decodeDepositAddress(tex, "mainnet").onChain, T1);
  // Testnet TEX on testnet, and refused on mainnet.
  const textest = bech32m.encode("textest", bech32m.toWords(hash));
  assert.equal(decodeDepositAddress(textest, "testnet").onChain?.startsWith("tm"), true);
  assert.match(err(() => decodeDepositAddress(textest, "mainnet"))!, /testnet address/);
});

test("deposit: unified addresses report their receivers; a shielded receiver hides the destination", () => {
  const orchard = { typecode: 3, data: new Uint8Array(43).fill(7) };
  const p2pkh = { typecode: 0, data: hash };
  const full = decodeDepositAddress(encodeUnifiedAddress("u", [orchard, p2pkh]), "mainnet");
  assert.equal(full.kind, "unified");
  assert.deepEqual(full.receivers, ["p2pkh", "orchard"]);
  assert.equal(full.onChain, null);
  assert.match(full.label, /stays shielded/);
  assert.match(err(() => decodeDepositAddress(encodeUnifiedAddress("utest", [orchard]), "mainnet"))!, /testnet address/);
});

test("deposit: Sapling, wrong network, typos and junk", () => {
  const zs = bech32.encode("zs", bech32.toWords(new Uint8Array(43).fill(1)), 120);
  assert.equal(decodeDepositAddress(zs, "mainnet").kind, "sapling");
  assert.equal(decodeDepositAddress(zs, "mainnet").onChain, null);
  const tm = b58.encode(new Uint8Array([0x1d, 0x25, ...hash]));
  assert.match(err(() => decodeDepositAddress(tm, "mainnet"))!, /testnet address/);
  assert.match(err(() => decodeDepositAddress(T1, "testnet"))!, /mainnet address/);
  assert.match(err(() => decodeDepositAddress(T1.slice(0, -1) + (T1.endsWith("b") ? "c" : "b"), "mainnet"))!, /checksum/);
  assert.match(err(() => decodeDepositAddress("", "mainnet"))!, /Paste/);
  assert.match(err(() => decodeDepositAddress("0xabc", "mainnet"))!, /doesn't look like a Zcash address/);
});

test("deposit: HMAC is keyed and stable; check amounts add 1 to 9,999 zatoshis", () => {
  const secret = "s".repeat(32);
  assert.equal(depositHmac(secret, T1), depositHmac(secret, T1));
  assert.notEqual(depositHmac(secret, T1), depositHmac("t".repeat(32), T1));
  assert.match(depositHmac(secret, T1), /^[0-9a-f]{64}$/);
  assert.throws(() => depositHmac("short", T1));
  assert.equal(checkAmountZat(1_000_000, () => 0), 1_000_001);
  assert.equal(checkAmountZat(1_000_000, () => 0.99999999), 1_009_999);
  const r = checkAmountZat(1_000_000);
  assert.ok(r > 1_000_000 && r <= 1_009_999);
  assert.throws(() => checkAmountZat(0));
});
