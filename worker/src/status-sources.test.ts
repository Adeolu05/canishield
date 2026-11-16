import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCES, readSource, type SourceResult, type StatusSource } from "./status-sources";
import { nextSide, type SideState } from "./status-step";
import { alertText, telegramConfig } from "./telegram";

const src = (slug: string): StatusSource => {
  const s = SOURCES.find((x) => x.slug === slug);
  assert.ok(s, slug);
  return s;
};
const reading = (r: SourceResult) => {
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.reading;
};

// Fixtures follow each exchange's documented response shape, with ZEC values.

test("Kraken: the four documented statuses, and anything else is unknown", () => {
  const body = (status: string) => ({ error: [], result: { XZEC: { aclass: "currency", altname: "ZEC", status } } });
  const k = src("kraken");
  assert.deepEqual(reading(k.parse([body("enabled")])), { deposit: "open", withdraw: "open", confirmations: null, note: null });
  assert.equal(reading(k.parse([body("deposit_only")])).withdraw, "paused");
  assert.equal(reading(k.parse([body("withdrawal_only")])).deposit, "paused");
  const off = reading(k.parse([body("funding_temporarily_disabled")]));
  assert.deepEqual([off.deposit, off.withdraw], ["paused", "paused"]);
  assert.equal(k.parse([body("something_new")]).ok, false);
  assert.equal(k.parse([{ error: ["EQuery:Unknown asset"] }]).ok, false);
  assert.equal(k.parse([{ error: [], result: {} }]).ok, false, "ZEC missing is unknown, not paused");
});

test("KuCoin: native ZEC chain, booleans and confirmations", () => {
  const body = (chains: unknown[]) => ({ code: "200000", data: { currency: "ZEC", name: "ZEC", chains } });
  const k = src("kucoin");
  const r = reading(k.parse([body([{ chainName: "ZEC", chainId: "zec", isDepositEnabled: true, isWithdrawEnabled: false, confirms: 10 }])]));
  assert.deepEqual(r, { deposit: "open", withdraw: "paused", confirmations: 10, note: null });
  // A wrapped token next to the native chain: the native one wins.
  const two = reading(
    k.parse([body([{ chainName: "BEP20", chainId: "bsc", isDepositEnabled: false, isWithdrawEnabled: false }, { chainName: "ZEC", chainId: "zec", isDepositEnabled: true, isWithdrawEnabled: true, confirms: 10 }])]),
  );
  assert.equal(two.deposit, "open");
  // Only wrapped chains: no answer.
  assert.equal(k.parse([body([{ chainName: "BEP20", chainId: "bsc", isDepositEnabled: true }, { chainName: "ERC20", chainId: "eth", isDepositEnabled: true }])]).ok, false);
  // A missing flag is unknown on that side only.
  assert.equal(reading(k.parse([body([{ chainName: "ZEC", isWithdrawEnabled: true }])])).deposit, "unknown");
  assert.equal(k.parse([{ code: "400100", msg: "error" }]).ok, false);
});

test("Gate: the fields say disabled, so open is their negation; delayed is a note", () => {
  const g = src("gate");
  const body = (c: object) => ({ currency: "ZEC", delisted: false, chains: [{ name: "ZEC", addr: "", ...c }] });
  assert.deepEqual(reading(g.parse([body({ deposit_disabled: false, withdraw_disabled: true, withdraw_delayed: false })])), {
    deposit: "open",
    withdraw: "paused",
    confirmations: null,
    note: null,
  });
  assert.equal(reading(g.parse([body({ deposit_disabled: false, withdraw_disabled: false, withdraw_delayed: true })])).note, "withdrawals delayed");
  assert.equal(g.parse([{ currency: "ZEC", delisted: true, chains: [] }]).ok, false);
  assert.equal(g.parse([{ label: "INVALID_CURRENCY", message: "Currency not found" }]).ok, false);
});

test("HTX: allowed / prohibited per chain, confirmations as a string", () => {
  const h = src("huobi");
  const body = (dep: string, wd: string) => ({
    code: 200,
    data: [{ currency: "zec", chains: [{ chain: "zec", displayName: "ZEC", numOfConfirmations: "10", depositStatus: dep, withdrawStatus: wd }] }],
  });
  assert.deepEqual(reading(h.parse([body("allowed", "prohibited")])), { deposit: "open", withdraw: "paused", confirmations: 10, note: null });
  assert.equal(reading(h.parse([body("maybe", "allowed")])).deposit, "unknown");
});

test("Poloniex: v2 networkList, as one object or a one-item list", () => {
  const p = src("poloniex");
  const cur = { coin: "ZEC", delisted: false, networkList: [{ blockchain: "ZEC", depositEnable: false, withdrawalEnable: true, minConfirm: 20 }] };
  assert.deepEqual(reading(p.parse([cur])), { deposit: "paused", withdraw: "open", confirmations: 20, note: null });
  assert.equal(reading(p.parse([[cur]])).withdraw, "open");
  assert.equal(p.parse([[cur, cur]]).ok, false);
});

test("Bitfinex: method map plus status rows; 1 active, 0 maintenance", () => {
  const b = src("bitfinex");
  const row = (dep: unknown, wd: unknown) => ["ZCASH", dep, wd, null, null, null, null, 0, 0, null, null, 30];
  const body = (r: unknown[]) => [[["BITCOIN", ["BTC"]], ["ZCASH", ["ZEC"]]], [["BITCOIN", 1, 1, null, null, null, null, 0, 0, null, null, 3], r]];
  assert.deepEqual(reading(b.parse([body(row(1, 0))])), { deposit: "open", withdraw: "paused", confirmations: 30, note: null });
  assert.equal(reading(b.parse([body(row(2, 1))])).deposit, "unknown");
  assert.equal(b.parse([[[["BITCOIN", ["BTC"]]], []]]).ok, false, "ZEC missing");
  assert.equal(b.parse([{ error: "x" }]).ok, false);
});

test("Backpack and Bitget", () => {
  const bp = src("backpack");
  assert.deepEqual(reading(bp.parse([[{ symbol: "SOL", tokens: [] }, { symbol: "ZEC", tokens: [{ blockchain: "Zcash", depositEnabled: true, withdrawEnabled: true }] }]])), {
    deposit: "open",
    withdraw: "open",
    confirmations: null,
    note: null,
  });
  assert.equal(bp.parse([[{ symbol: "SOL", tokens: [] }]]).ok, false);

  const bg = src("bitget");
  const body = { code: "00000", data: [{ coin: "ZEC", chains: [{ chain: "ZEC", rechargeable: "false", withdrawable: "true", depositConfirm: "15" }] }] };
  assert.deepEqual(reading(bg.parse([body])), { deposit: "paused", withdraw: "open", confirmations: 15, note: null });
  assert.equal(bg.parse([{ code: "40034", msg: "Parameter does not exist" }]).ok, false);
});

test("confirmations outside 1..10000 or not whole numbers are dropped", () => {
  const k = src("kucoin");
  const r = (confirms: unknown) => reading(k.parse([{ code: "200000", data: { currency: "ZEC", chains: [{ chainName: "ZEC", isDepositEnabled: true, isWithdrawEnabled: true, confirms }] } }]));
  assert.equal(r(0).confirmations, null);
  assert.equal(r(2.5).confirmations, null);
  assert.equal(r(99999).confirmations, null);
  assert.equal(r("12").confirmations, 12);
});

test("every source is a fixed https URL on the exchange's own API host", () => {
  for (const s of SOURCES) {
    for (const u of s.urls) {
      const url = new URL(u);
      assert.equal(url.protocol, "https:", u);
      assert.ok(/^api(-pub)?\.|^api\.huobi\.pro$/.test(url.hostname), u);
    }
  }
  assert.equal(new Set(SOURCES.map((s) => s.slug)).size, SOURCES.length);
});

// ---------- readSource: network failures are unknown with a short reason ----------

const fakeFetch =
  (respond: (url: string) => Response | Promise<Response>) =>
  async (url: string) =>
    respond(url);

test("readSource: HTTP errors, non-JSON, timeouts and throws never escape", async () => {
  const k = src("kraken");
  assert.deepEqual(await readSource(k, fakeFetch(() => new Response("blocked", { status: 403 }))), { ok: false, reason: "HTTP 403" });
  assert.deepEqual(await readSource(k, fakeFetch(() => new Response("<html>"))), { ok: false, reason: "reply is not JSON" });
  assert.deepEqual(
    await readSource(k, async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }),
    { ok: false, reason: "timed out" },
  );
  assert.deepEqual(
    await readSource(k, async () => {
      throw new Error("getaddrinfo ENOTFOUND secret-detail");
    }),
    { ok: false, reason: "request failed" },
  );
  const good = await readSource(k, fakeFetch(() => Response.json({ error: [], result: { XZEC: { altname: "ZEC", status: "enabled" } } })));
  assert.equal(good.ok, true);
});

// ---------- two readings in a row, and events against the last known state ----------

const start: SideState = { shown: "unknown", seen: null, known: null };
function run(readings: Array<"open" | "paused" | "unknown">) {
  let s = start;
  const events: string[] = [];
  const shown: string[] = [];
  for (const r of readings) {
    const c = nextSide(s, r);
    s = c.next;
    shown.push(s.shown);
    if (c.event) events.push(`${c.event.from}>${c.event.to}`);
  }
  return { shown, events, final: s };
}

test("nextSide: a state shows only after two readings agree", () => {
  assert.deepEqual(run(["open"]).shown, ["unknown"]);
  assert.deepEqual(run(["open", "open"]).shown, ["unknown", "open"]);
  // One odd reading doesn't flip it.
  assert.deepEqual(run(["open", "open", "paused", "open"]).shown, ["unknown", "open", "open", "open"]);
  assert.deepEqual(run(["open", "open", "paused", "open"]).events, []);
});

test("nextSide: the first known state is not an event; real changes are", () => {
  const r = run(["open", "open", "paused", "paused", "open", "open"]);
  assert.deepEqual(r.shown, ["unknown", "open", "open", "paused", "paused", "open"]);
  assert.deepEqual(r.events, ["open>paused", "paused>open"]);
});

test("nextSide: unknown in between is measured against the last known state", () => {
  assert.deepEqual(run(["open", "open", "unknown", "unknown", "open", "open"]).events, [], "open, unknown, open: nothing happened");
  assert.deepEqual(run(["open", "open", "unknown", "unknown", "paused", "paused"]).events, ["open>paused"]);
  const r = run(["paused", "paused", "unknown", "unknown"]);
  assert.equal(r.final.shown, "unknown");
  assert.equal(r.final.known, "paused");
});

// ---------- Telegram ----------

test("telegramConfig: off unless both are set and well formed", () => {
  assert.equal(telegramConfig({}), null);
  assert.equal(telegramConfig({ TELEGRAM_CHAT_ID: "@canishield_status" }), null);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: "nope", TELEGRAM_CHAT_ID: "@canishield_status" }), null);
  const token = "123456789:AAAbbbCCCdddEEEfffGGGhhhIIIjjjKKKl";
  assert.deepEqual(telegramConfig({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "@canishield_status" }), { token, chat: "@canishield_status" });
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "-1001234567890" })?.chat, "-1001234567890");
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "@x" }), null);
});

test("alertText: says what changed and that it's not about shielded support", () => {
  const t = alertText({ name: "Kraken", slug: "kraken", side: "withdraw", fromState: "open", toState: "paused", at: new Date("2026-11-16T14:05:09Z") });
  assert.equal(
    t,
    "Kraken: ZEC withdrawals paused.\nSeen at 14:05 UTC on Kraken's public API.\nOpen or paused is about ZEC in general, not shielded support. Full record: https://canishield.vercel.app/services/kraken",
  );
  assert.match(alertText({ name: "Gate", slug: "gate", side: "deposit", fromState: "paused", toState: "open", at: new Date() }), /^Gate: ZEC deposits reopened\./);
  assert.doesNotMatch(t, /\u2014/, "no em dashes");
});

test("readCapped: stops at the limit, with or without a content-length", async () => {
  const { readCapped } = await import("./status-sources");
  assert.equal(await readCapped(new Response("x".repeat(100)), 50), null);
  assert.equal(await readCapped(new Response("x".repeat(40)), 50), "x".repeat(40));
  const declared = new Response("small", { headers: { "content-length": "999999999" } });
  assert.equal(await readCapped(declared, 50), null);
  const stream = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(30).fill(65));
    },
  });
  assert.equal(await readCapped(new Response(stream), 100), null, "an endless reply is cut off");
});

test("readSource: a source's own maxBytes lets a big feed through (Backpack lists every asset)", async () => {
  const bp = src("backpack");
  assert.ok((bp.maxBytes ?? 0) >= 4_000_000);
  const filler = Array.from({ length: 9000 }, (_, i) => ({ symbol: `T${i}`, tokens: [{ blockchain: "Solana", depositEnabled: true, withdrawEnabled: true, contractAddress: "x".repeat(200) }] }));
  const body = JSON.stringify([...filler, { symbol: "ZEC", tokens: [{ blockchain: "Zcash", depositEnabled: true, withdrawEnabled: true }] }]);
  assert.ok(body.length > 2_000_000, "bigger than the default cap");
  const r = await readSource(bp, async () => new Response(body));
  assert.deepEqual(r, { ok: true, reading: { deposit: "open", withdraw: "open", confirmations: null, note: null } });
  // Other sources keep the default cap.
  assert.deepEqual(await readSource(src("kraken"), async () => new Response(body)), { ok: false, reason: "reply too large" });
});
