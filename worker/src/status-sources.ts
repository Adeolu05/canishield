// Live ZEC deposit and withdrawal status from exchanges' own public APIs.
//
// Every source is a fixed URL that needs no API key, and every reply is
// checked field by field before anything is kept. Anything we can't read with
// certainty is "unknown", never "paused": a feed that fails, changes shape or
// stops listing ZEC must not look like an exchange pausing ZEC.
//
// This says nothing about shielded support. "Deposits open" means the exchange
// takes ZEC at all; whether it takes shielded ZEC is the board's evidence.
//
// Field names are from each exchange's API docs (cross-checked against the
// sample responses in the open-source ccxt parsers):
//   Kraken    GET /0/public/Assets?asset=ZEC      result.*.status
//   KuCoin    GET /api/v3/currencies/ZEC          data.chains[].isDepositEnabled / isWithdrawEnabled / confirms
//   Gate      GET /api/v4/spot/currencies/ZEC     chains[].deposit_disabled / withdraw_disabled / withdraw_delayed
//   HTX       GET /v2/reference/currencies?currency=zec  data[].chains[].depositStatus / withdrawStatus ("allowed")
//   Poloniex  GET /v2/currencies/ZEC              networkList[].depositEnable / withdrawalEnable / minConfirm
//   Bitfinex  GET /v2/conf/pub:map:tx:method,pub:info:tx:status  [METHOD, DEP 1|0, WD 1|0, ...]
//   Backpack  GET /api/v1/assets                  [].tokens[].depositEnabled / withdrawEnabled
//   Bitget    GET /api/v2/spot/public/coins?coin=ZEC  data[].chains[].rechargeable / withdrawable ("true")
import type { Fetch } from "./explorer";

export type FundingState = "open" | "paused" | "unknown";

export interface StatusReading {
  deposit: FundingState;
  withdraw: FundingState;
  /** Confirmations the exchange waits for before crediting a deposit, when it says. */
  confirmations: number | null;
  /** Short extra fact worth showing, e.g. "withdrawals delayed". */
  note: string | null;
}

export type SourceResult = { ok: true; reading: StatusReading } | { ok: false; reason: string };

export interface StatusSource {
  /** Can I Shield service slug. */
  slug: string;
  /** Human name of where the data comes from, shown on the site. */
  label: string;
  urls: readonly string[];
  /** Pure: takes the parsed JSON body of each URL, in order. */
  parse(bodies: unknown[]): SourceResult;
}

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2_000_000;

// ---------- small, strict readers ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (reason: string): SourceResult => ({ ok: false, reason });
const ok = (reading: Partial<StatusReading> & Pick<StatusReading, "deposit" | "withdraw">): SourceResult => ({
  ok: true,
  reading: { confirmations: null, note: null, ...reading },
});

/** true/false booleans, or the strings "true"/"false" (Bitget). Anything else is unknown. */
function flag(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}
const state = (enabled: boolean | null): FundingState => (enabled === null ? "unknown" : enabled ? "open" : "paused");

/** A whole number of confirmations between 1 and 10,000, or null. */
function confirms(v: unknown): number | null {
  const n = typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null;
}

const ZEC_CHAIN = /^(zec|zcash)$/i;

/**
 * The native ZEC chain among a currency's chains: the one named ZEC/Zcash, or
 * the only chain when there is exactly one. Several chains and none named
 * ZEC/Zcash (e.g. only a wrapped token) gives null.
 */
function nativeChain<T>(chains: unknown, names: (c: Record<string, unknown>) => unknown[]): (Record<string, unknown> & T) | null {
  if (!Array.isArray(chains)) return null;
  const list = chains.filter(isObj);
  const named = list.filter((c) => names(c).some((n) => typeof n === "string" && ZEC_CHAIN.test(n.trim())));
  if (named.length === 1) return named[0] as Record<string, unknown> & T;
  if (named.length === 0 && list.length === 1) return list[0] as Record<string, unknown> & T;
  return null;
}

// ---------- the sources ----------

export const SOURCES: readonly StatusSource[] = [
  {
    slug: "kraken",
    label: "Kraken public API",
    urls: ["https://api.kraken.com/0/public/Assets?asset=ZEC"],
    parse([body]) {
      if (!isObj(body)) return fail("reply is not an object");
      if (Array.isArray(body.error) && body.error.length > 0) return fail(`Kraken error: ${String(body.error[0]).slice(0, 80)}`);
      if (!isObj(body.result)) return fail("no result");
      const zec = Object.values(body.result).filter(isObj).find((a) => a.altname === "ZEC");
      if (!zec) return fail("ZEC not listed");
      switch (zec.status) {
        case "enabled":
          return ok({ deposit: "open", withdraw: "open" });
        case "deposit_only":
          return ok({ deposit: "open", withdraw: "paused" });
        case "withdrawal_only":
          return ok({ deposit: "paused", withdraw: "open" });
        case "funding_temporarily_disabled":
          return ok({ deposit: "paused", withdraw: "paused" });
        default:
          return fail(`unknown status ${JSON.stringify(zec.status).slice(0, 40)}`);
      }
    },
  },
  {
    slug: "kucoin",
    label: "KuCoin public API",
    urls: ["https://api.kucoin.com/api/v3/currencies/ZEC"],
    parse([body]) {
      if (!isObj(body) || body.code !== "200000" || !isObj(body.data)) return fail("unexpected reply");
      if (body.data.currency !== "ZEC") return fail("ZEC not listed");
      const c = nativeChain(body.data.chains, (x) => [x.chainName, x.chainId]);
      if (!c) return fail("no native ZEC chain");
      return ok({ deposit: state(flag(c.isDepositEnabled)), withdraw: state(flag(c.isWithdrawEnabled)), confirmations: confirms(c.confirms) });
    },
  },
  {
    slug: "gate",
    label: "Gate public API",
    urls: ["https://api.gateio.ws/api/v4/spot/currencies/ZEC"],
    parse([body]) {
      if (!isObj(body) || body.currency !== "ZEC") return fail("ZEC not listed");
      if (body.delisted === true) return fail("ZEC delisted");
      const c = nativeChain(body.chains, (x) => [x.name]);
      if (!c) return fail("no native ZEC chain");
      // The fields say "disabled", so the open state is their negation.
      const dep = flag(c.deposit_disabled);
      const wd = flag(c.withdraw_disabled);
      const delayed = flag(c.withdraw_delayed) === true && wd === false;
      return ok({
        deposit: state(dep === null ? null : !dep),
        withdraw: state(wd === null ? null : !wd),
        note: delayed ? "withdrawals delayed" : null,
      });
    },
  },
  {
    slug: "huobi",
    label: "Huobi (HTX) public API",
    urls: ["https://api.huobi.pro/v2/reference/currencies?currency=zec"],
    parse([body]) {
      if (!isObj(body) || body.code !== 200 || !Array.isArray(body.data)) return fail("unexpected reply");
      const cur = body.data.filter(isObj).find((d) => d.currency === "zec");
      if (!cur) return fail("ZEC not listed");
      const c = nativeChain(cur.chains, (x) => [x.chain, x.displayName, x.baseChain]);
      if (!c) return fail("no native ZEC chain");
      const allowed = (v: unknown) => (v === "allowed" ? true : v === "prohibited" ? false : null);
      return ok({
        deposit: state(allowed(c.depositStatus)),
        withdraw: state(allowed(c.withdrawStatus)),
        confirmations: confirms(c.numOfConfirmations),
      });
    },
  },
  {
    slug: "poloniex",
    label: "Poloniex public API",
    urls: ["https://api.poloniex.com/v2/currencies/ZEC"],
    parse([body]) {
      // The single-currency route answers with one object; accept a one-item list too.
      const cur = Array.isArray(body) ? (body.length === 1 ? body[0] : null) : body;
      if (!isObj(cur) || cur.coin !== "ZEC") return fail("ZEC not listed");
      if (cur.delisted === true) return fail("ZEC delisted");
      const c = nativeChain(cur.networkList, (x) => [x.blockchain]);
      if (!c) return fail("no native ZEC chain");
      return ok({ deposit: state(flag(c.depositEnable)), withdraw: state(flag(c.withdrawalEnable)), confirmations: confirms(c.minConfirm) });
    },
  },
  {
    slug: "bitfinex",
    label: "Bitfinex public API",
    urls: ["https://api-pub.bitfinex.com/v2/conf/pub:map:tx:method,pub:info:tx:status"],
    parse([body]) {
      // One request, two configs: [[ [METHOD, [CURRENCY...]], ... ], [ [METHOD, DEP, WD, ...], ... ]].
      if (!Array.isArray(body) || body.length !== 2 || !Array.isArray(body[0]) || !Array.isArray(body[1])) return fail("unexpected reply");
      const methods = body[0].filter(
        (m): m is [string, string[]] => Array.isArray(m) && typeof m[0] === "string" && Array.isArray(m[1]) && m[1].includes("ZEC"),
      );
      const native = methods.length === 1 ? methods : methods.filter((m) => ZEC_CHAIN.test(m[0]));
      if (native.length !== 1) return fail(methods.length ? "several ZEC methods" : "ZEC not listed");
      const method = native[0][0];
      const row = body[1].find((r): r is unknown[] => Array.isArray(r) && r[0] === method);
      if (!row) return fail("no status for ZEC");
      const bit = (v: unknown) => (v === 1 ? true : v === 0 ? false : null);
      // Documented order: METHOD, DEP_STATUS, WD_STATUS, 4 placeholders, PAYMENT_ID_DEP, PAYMENT_ID_WD, 2 placeholders, DEPOSIT_CONFIRMATIONS_REQUIRED.
      return ok({ deposit: state(bit(row[1])), withdraw: state(bit(row[2])), confirmations: confirms(row[11]) });
    },
  },
  {
    slug: "backpack",
    label: "Backpack public API",
    urls: ["https://api.backpack.exchange/api/v1/assets"],
    parse([body]) {
      if (!Array.isArray(body)) return fail("unexpected reply");
      const cur = body.filter(isObj).find((a) => a.symbol === "ZEC");
      if (!cur) return fail("ZEC not listed");
      const c = nativeChain(cur.tokens, (x) => [x.blockchain]);
      if (!c) return fail("no native ZEC chain");
      return ok({ deposit: state(flag(c.depositEnabled)), withdraw: state(flag(c.withdrawEnabled)) });
    },
  },
  {
    slug: "bitget",
    label: "Bitget public API",
    urls: ["https://api.bitget.com/api/v2/spot/public/coins?coin=ZEC"],
    parse([body]) {
      if (!isObj(body) || body.code !== "00000" || !Array.isArray(body.data)) return fail("unexpected reply");
      const cur = body.data.filter(isObj).find((d) => d.coin === "ZEC");
      if (!cur) return fail("ZEC not listed");
      const c = nativeChain(cur.chains, (x) => [x.chain]);
      if (!c) return fail("no native ZEC chain");
      return ok({ deposit: state(flag(c.rechargeable)), withdraw: state(flag(c.withdrawable)), confirmations: confirms(c.depositConfirm) });
    },
  },
];

/** The body as text, or null past maxBytes: stops reading there, so a huge reply can't fill memory. */
export async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Fetches a source's URLs and parses them. Never throws. */
export async function readSource(src: StatusSource, fetchFn: Fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<SourceResult> {
  try {
    const bodies: unknown[] = [];
    for (const url of src.urls) {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return fail(`HTTP ${res.status}`);
      const text = await readCapped(res, MAX_BYTES);
      if (text === null) return fail("reply too large");
      try {
        bodies.push(JSON.parse(text));
      } catch {
        return fail("reply is not JSON");
      }
    }
    return src.parse(bodies);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return fail(name === "TimeoutError" || name === "AbortError" ? "timed out" : "request failed");
  }
}
