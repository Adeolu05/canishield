import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmOnExplorer, type Fetch } from "./explorer";

const TXID = "a".repeat(64);
const HASH = "0".repeat(56) + "deadbeef";

/** Fake fetch: route URL substrings to [status, body]. */
const fakeFetch = (routes: Record<string, [number, unknown] | Error>): Fetch =>
  async (url) => {
    for (const [part, reply] of Object.entries(routes)) {
      if (!url.includes(part)) continue;
      if (reply instanceof Error) throw reply;
      return new Response(JSON.stringify(reply[1]), { status: reply[0] });
    }
    return new Response("{}", { status: 404 });
  };

const zecblock = (over: object = {}) => [
  200,
  { txid: TXID, blockHeight: "100", blockHash: HASH, confirmations: 12, isCanonical: true, ...over },
] as [number, unknown];
const blockchair = (blockId: number, state: number) => [
  200,
  { data: { [TXID]: { transaction: { hash: TXID, block_id: blockId } } }, context: { state } },
] as [number, unknown];

const receipt = { txid: TXID, height: 100, blockHash: HASH };

test("confirms when ZecBlock agrees on height, hash and depth", async () => {
  const v = await confirmOnExplorer("mainnet", receipt, 10, fakeFetch({ zecblock: zecblock() }));
  assert.deepEqual(v, { kind: "confirmed", explorer: "ZecBlock", confirmations: 12 });
});

test("waits while the explorer has fewer confirmations than required", async () => {
  const v = await confirmOnExplorer("mainnet", receipt, 10, fakeFetch({ zecblock: zecblock({ confirmations: 3 }), blockchair: blockchair(100, 102) }));
  assert.equal(v.kind, "unavailable");
});

test("a disagreeing primary blocks verification; no second opinion is sought", async () => {
  for (const over of [{ blockHeight: "101" }, { blockHash: "f".repeat(64) }, { isCanonical: false }]) {
    const v = await confirmOnExplorer("mainnet", receipt, 10, fakeFetch({ zecblock: zecblock(over), blockchair: blockchair(100, 200) }));
    assert.equal(v.kind, "disagrees", JSON.stringify(over));
  }
});

test("falls back to Blockchair on mainnet when ZecBlock is down or does not know the tx", async () => {
  for (const zb of [new Error("ECONNREFUSED"), [404, null] as [number, unknown]]) {
    const v = await confirmOnExplorer("mainnet", receipt, 10, fakeFetch({ zecblock: zb, blockchair: blockchair(100, 111) }));
    assert.deepEqual(v, { kind: "confirmed", explorer: "Blockchair", confirmations: 12 });
  }
  const wrong = await confirmOnExplorer("mainnet", receipt, 10, fakeFetch({ zecblock: new Error("down"), blockchair: blockchair(99, 111) }));
  assert.equal(wrong.kind, "disagrees");
});

test("testnet has no Blockchair fallback", async () => {
  const v = await confirmOnExplorer("testnet", receipt, 1, fakeFetch({ zecblock: new Error("down"), blockchair: blockchair(100, 200) }));
  assert.equal(v.kind, "unavailable");
});
