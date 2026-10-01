// Uses throwaway testnet seeds only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import zcash from "@ledgerhq/zcash-utils";
import { compareWalletAddresses, encodeUnifiedAddress, parseBatchPublic, receiversOf, Typecode } from "@zecproof/zcash";
import { decryptSeeds, encryptSeeds } from "./crypto";
import { generateBatch } from "./generate";
import { enclosingGitRepo } from "./safety";

const PASS = "correct horse battery staple";

test("seeds round-trip through encryption; wrong passphrase and swapped batch fail", () => {
  const seeds = [{ index: 0, mnemonic: "abandon ".repeat(23) + "art" }];
  const file = encryptSeeds("testnet-x", "testnet", seeds, PASS);
  assert.deepEqual(decryptSeeds(file, PASS), seeds);
  assert.throws(() => decryptSeeds(file, "wrong passphrase!!"), /Wrong passphrase/);
  assert.throws(() => decryptSeeds({ ...file, batchId: "testnet-y" }, PASS), /Wrong passphrase/);
  assert.throws(() => encryptSeeds("b", "testnet", seeds, "short"), /at least/);
});

test("a generated batch re-derives cleanly and its seeds reproduce its keys", () => {
  const { batch, seeds } = generateBatch({ network: "testnet", count: 3, birthdayHeight: 4_400_000, passphrase: PASS });
  assert.equal(parseBatchPublic(structuredClone(batch)).keys.length, 3);
  for (const { index, mnemonic } of decryptSeeds(seeds, PASS)) {
    assert.equal(zcash.testDeriveKeys(mnemonic, 0, "testnet").ufvk, batch.keys[index].ufvk);
  }
  const tampered = structuredClone(batch);
  tampered.keys[1].fullUa = batch.keys[2].fullUa;
  assert.throws(() => parseBatchPublic(tampered), /does not derive/);
});

test("verify accepts a wallet UA with extra receivers, rejects a different seed", () => {
  const { batch } = generateBatch({ network: "testnet", count: 2, birthdayHeight: 4_400_000, passphrase: PASS });
  const key = batch.keys[0];
  // Stand-in for a wallet's default UA: our Orchard + P2PKH plus a (fake) Sapling receiver.
  const walletUa = encodeUnifiedAddress("utest", [
    ...receiversOf(key.fullUa, "testnet"),
    { typecode: Typecode.Sapling, data: new Uint8Array(43).fill(7) },
  ]);
  const ok = compareWalletAddresses(batch, 0, [walletUa, key.transparentAddress]);
  assert.deepEqual(ok.matched.sort(), ["orchard", "p2pkh"]);
  assert.deepEqual(ok.unchecked, ["sapling"]);
  assert.throws(() => compareWalletAddresses(batch, 0, [batch.keys[1].ironwoodUa]), /MISMATCH/);
  assert.throws(() => compareWalletAddresses(batch, 0, [key.transparentAddress]), /No Orchard receiver/);
});

test("output inside a git working tree is detected", () => {
  assert.ok(enclosingGitRepo(process.cwd()));
  assert.equal(enclosingGitRepo(tmpdir()), undefined);
});
