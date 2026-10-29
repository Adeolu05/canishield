import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { depositHmac } from "@zecproof/zcash/deposit";
import { classifyDepositSource, normalizeTx, paysCheckAddress, shieldedSpend, verifyDeposit, type ZbTx } from "./deposits";

const fx = (name: string): ZbTx => normalizeTx(JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/zecblock/${name}.json`, import.meta.url)), "utf8")))!;
const SECRET = "x".repeat(40);
const hmac = (v: string) => depositHmac(SECRET, v);
const none = new Map<string, ZbTx>();

test("deposits: positive value balance is value leaving the pool", () => {
  assert.equal(shieldedSpend(fx("direct_ironwood")), "ironwood");
  assert.equal(shieldedSpend(fx("direct_sapling")), "sapling");
  assert.equal(shieldedSpend(fx("transparent")), null);
  assert.equal(shieldedSpend({ ...fx("transparent"), valueBalanceOrchardZat: "-500" }), null, "negative = value entering the pool");
  assert.equal(shieldedSpend({ ...fx("transparent"), valueBalanceOrchardZat: "500" }), "orchard");
});

test("deposits: inputs and outputs given as JSON strings are accepted", () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/zecblock/tex_step2.json", import.meta.url)), "utf8"));
  const t = normalizeTx({ ...raw, inputs: JSON.stringify(raw.inputs), outputs: JSON.stringify(raw.outputs) })!;
  assert.equal(t.inputs[0].prev_txid, raw.inputs[0].prev_txid);
  assert.equal(normalizeTx({}), null);
});

test("deposits: direct, two-step (TEX) and transparent sources", () => {
  assert.deepEqual(classifyDepositSource(fx("direct_ironwood"), none), { kind: "shielded", source: "ironwood" });
  const step2 = fx("tex_step2");
  assert.deepEqual(classifyDepositSource(step2, none), { kind: "need", txids: [fx("tex_step1").txid] });
  assert.deepEqual(classifyDepositSource(step2, new Map([[fx("tex_step1").txid, fx("tex_step1")]])), { kind: "shielded", source: "via_tex_sapling" });
  const t = fx("transparent");
  const prev = new Map(t.inputs.map((i) => [i.prev_txid, fx("transparent_prev")]));
  assert.equal(classifyDepositSource(t, prev).kind, "refused");
});

test("deposits: the destination must match amount and address exactly", () => {
  const tx = fx("direct_ironwood");
  const out = tx.outputs[0];
  assert.equal(paysCheckAddress(tx, Number(out.value), hmac(out.address!), hmac), true);
  assert.equal(paysCheckAddress(tx, Number(out.value) + 1, hmac(out.address!), hmac), false, "off by 1 zat");
  assert.equal(paysCheckAddress(tx, Number(out.value), hmac("t1Qfn52D2TGCAC75aBEKiWkozeJgaQsR638"), hmac), false, "other address");
});

test("deposits: full verdicts", () => {
  const tx = fx("direct_ironwood");
  const out = tx.outputs[0];
  const check = { addressType: "transparent_p2pkh" as const, addressHmac: hmac(out.address!), checkAmountZat: Number(out.value) };
  const ok = verifyDeposit(check, tx, none, 10, hmac);
  assert.equal(ok.kind, "ok");
  if (ok.kind === "ok") {
    assert.equal(ok.source, "ironwood");
    assert.equal(ok.height, 3533851);
    assert.equal(ok.blockTime?.toISOString(), new Date(1793213323 * 1000).toISOString());
    assert.equal(ok.destinationVisible, true);
  }
  assert.equal(verifyDeposit(check, { ...tx, confirmations: 3 }, none, 10, hmac).kind, "wait");
  assert.equal(verifyDeposit(check, { ...tx, blockHeight: null }, none, 10, hmac).kind, "wait");
  assert.equal(verifyDeposit(check, { ...tx, isCanonical: false }, none, 10, hmac).kind, "refused");
  const wrongAddr = verifyDeposit({ ...check, addressHmac: hmac("t1somewhere") }, tx, none, 10, hmac);
  assert.deepEqual(wrongAddr, { kind: "refused", reason: "The check amount went to a different address than the deposit address you gave." });
  const wrongAmount = verifyDeposit({ ...check, checkAmountZat: check.checkAmountZat - 1 }, tx, none, 10, hmac);
  assert.deepEqual(wrongAmount, { kind: "refused", reason: "No output in this transaction pays the exact check amount." });

  // TEX: matched against the P2PKH address with the same hash, source one hop back.
  const step2 = fx("tex_step2");
  const texCheck = { addressType: "tex" as const, addressHmac: hmac(step2.outputs[0].address!), checkAmountZat: Number(step2.outputs[0].value) };
  assert.deepEqual(verifyDeposit(texCheck, step2, none, 10, hmac), { kind: "need", txids: [fx("tex_step1").txid] });
  const tex = verifyDeposit(texCheck, step2, new Map([[fx("tex_step1").txid, fx("tex_step1")]]), 10, hmac);
  assert.equal(tex.kind === "ok" && tex.source, "via_tex_sapling");

  // A unified deposit address: destination not visible, only the source is checked.
  const ua = verifyDeposit({ addressType: "unified", addressHmac: hmac("u1..."), checkAmountZat: 123 }, tx, none, 10, hmac);
  assert.equal(ua.kind === "ok" && ua.destinationVisible, false);

  // Transparent money is refused even when the destination matches.
  const t = fx("transparent");
  const tCheck = { addressType: "transparent_p2pkh" as const, addressHmac: hmac(t.outputs[0].address!), checkAmountZat: Number(t.outputs[0].value) };
  const prev = new Map(t.inputs.map((i) => [i.prev_txid, fx("transparent_prev")]));
  assert.deepEqual(verifyDeposit(tCheck, t, prev, 10, hmac), { kind: "refused", reason: "This deposit came from a transparent address, not a shielded wallet." });
});
