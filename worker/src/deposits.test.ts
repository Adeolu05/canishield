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

const OLD = new Date("2026-10-01T00:00:00Z"); // well before every fixture
const tex = { allowOneHop: true, notBefore: OLD };
const plain = { allowOneHop: false, notBefore: OLD };

test("deposits: direct, two-step (TEX) and transparent sources", () => {
  assert.deepEqual(classifyDepositSource(fx("direct_ironwood"), none, plain), { kind: "shielded", source: "ironwood" });
  const step2 = fx("tex_step2");
  const step1 = fx("tex_step1");
  assert.deepEqual(classifyDepositSource(step2, none, tex), { kind: "need", txids: [step1.txid] });
  assert.deepEqual(classifyDepositSource(step2, new Map([[step1.txid, step1]]), tex), { kind: "shielded", source: "via_tex_sapling" });
  const t = fx("transparent");
  const prev = new Map(t.inputs.map((i) => [i.prev_txid, fx("transparent_prev")]));
  assert.equal(classifyDepositSource(t, prev, tex).kind, "refused");
});

test("deposits: the one-hop path is narrow", () => {
  const step2 = fx("tex_step2");
  const step1 = fx("tex_step1");
  const one = (p: ZbTx, rules = tex) => classifyDepositSource(step2, new Map([[step1.txid, p]]), rules).kind;
  assert.equal(one(step1, plain), "refused", "only for TEX deposit addresses");
  assert.equal(one({ ...step1, inputs: [{ address: "t1x", prev_txid: "aa", prev_vout: 0, value: "1" }] }), "refused", "first step had transparent inputs");
  assert.equal(one(step1, { allowOneHop: true, notBefore: new Date(Number(step1.blockTime) * 1000 + 1000) }), "refused", "first step older than the check");
  assert.equal(one({ ...step1, blockHeight: String(Number(step2.blockHeight) - 101) }), "refused", "first step too far back");
  // A direct shielded spend that also has transparent inputs is mixed money.
  const mixed = { ...fx("direct_ironwood"), inputs: step2.inputs };
  assert.equal(classifyDepositSource(mixed, none, plain).kind, "refused");
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
  const createdAt = new Date(Number(tx.blockTime) * 1000 - 3600_000);
  const check = { addressType: "transparent_p2pkh" as const, addressHmac: hmac(out.address!), checkAmountZat: Number(out.value), createdAt };
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
  assert.equal(verifyDeposit(check, { ...tx, isCanonical: false }, none, 10, hmac).kind, "wait", "a reorg may be in progress");
  const late = verifyDeposit({ ...check, createdAt: new Date(Number(tx.blockTime) * 1000 + 3600_000) }, tx, none, 10, hmac);
  assert.deepEqual(late, { kind: "refused", reason: "This transaction is older than the check. Send a new payment with the check amount." });
  const wrongAddr = verifyDeposit({ ...check, addressHmac: hmac("t1somewhere") }, tx, none, 10, hmac);
  assert.deepEqual(wrongAddr, { kind: "refused", reason: "The check amount went to a different address than the deposit address you gave." });
  const wrongAmount = verifyDeposit({ ...check, checkAmountZat: check.checkAmountZat - 1 }, tx, none, 10, hmac);
  assert.deepEqual(wrongAmount, { kind: "refused", reason: "No output in this transaction pays the exact check amount." });

  // TEX: matched against the P2PKH address with the same hash, source one hop back.
  const step2 = fx("tex_step2");
  const texCheck = {
    addressType: "tex" as const,
    addressHmac: hmac(step2.outputs[0].address!),
    checkAmountZat: Number(step2.outputs[0].value),
    createdAt: new Date(Number(fx("tex_step1").blockTime) * 1000 - 600_000),
  };
  assert.deepEqual(verifyDeposit(texCheck, step2, none, 10, hmac), { kind: "need", txids: [fx("tex_step1").txid] });
  const tex = verifyDeposit(texCheck, step2, new Map([[fx("tex_step1").txid, fx("tex_step1")]]), 10, hmac);
  assert.equal(tex.kind === "ok" && tex.source, "via_tex_sapling");

  // A unified deposit address: destination not visible, only the source is checked.
  const ua = verifyDeposit({ addressType: "unified", addressHmac: hmac("u1..."), checkAmountZat: 123, createdAt }, tx, none, 10, hmac);
  assert.equal(ua.kind === "ok" && ua.destinationVisible, false);

  // Transparent money is refused even when the destination matches.
  const t = fx("transparent");
  const tCheck = { addressType: "transparent_p2pkh" as const, addressHmac: hmac(t.outputs[0].address!), checkAmountZat: Number(t.outputs[0].value), createdAt: OLD };
  const prev = new Map(t.inputs.map((i) => [i.prev_txid, fx("transparent_prev")]));
  assert.deepEqual(verifyDeposit(tCheck, t, prev, 10, hmac), { kind: "refused", reason: "This deposit came from a transparent address, not a shielded wallet." });
});
