// Community research (docs/research/*.md) → product-level claims.
//
// The research file has three markdown tables (wallets, exchanges,
// corrections). Every row must be listed in PRODUCTS below, either mapped to a
// service or explicitly skipped, so a new row in a later version is noticed
// instead of guessed at. Pure functions; import-research.ts writes the result.
import type { ResearchClaim } from "./schema";

type Kind = "exchange" | "wallet" | "swap" | "hardware" | "other";

interface Product {
  slug: string;
  /** Display name for a service this import creates; existing services keep theirs. */
  name: string;
  kind: Kind;
  /** Official website for a new service (null when the research only links an app store or repo). */
  website: string | null;
  /** Required for the corrections table and for rows whose status is ambiguous. */
  claim?: ResearchClaim;
}

type Skip = { skip: string };

/** Keyed by the research's product name (bold markers removed). */
export const PRODUCTS: Record<string, Product | Skip> = {
  // Wallets
  "Zodl (formerly Zashi)": { slug: "zodl", name: "Zodl", kind: "wallet", website: "https://zodl.com" },
  "Cake Wallet": { slug: "cake-wallet", name: "Cake Wallet", kind: "wallet", website: "https://cakewallet.com" },
  "Edge Wallet": { slug: "edge", name: "Edge", kind: "wallet", website: "https://edge.app" },
  "Unstoppable Wallet": { slug: "unstoppable", name: "Unstoppable Wallet", kind: "wallet", website: "https://unstoppable.money" },
  Zingo: { slug: "zingo", name: "Zingo", kind: "wallet", website: "https://zingolabs.org" },
  Vizor: { slug: "vizor", name: "Vizor", kind: "wallet", website: null },
  ZKOOL: { slug: "zkool", name: "ZKOOL", kind: "wallet", website: null },
  // Websites only where orb's source link is the project's own domain (Noir: its
  // docs domain). Vizor, ZKOOL, YWallet and Nighthawk link only to an app store
  // or GitHub, so they stay blank.
  "Noir Wallet": { slug: "noir-wallet", name: "Noir Wallet", kind: "wallet", website: "https://docs.zknoir.com" },
  "Mane Wallet (LeoDex)": { slug: "mane-wallet", name: "Mane Wallet", kind: "wallet", website: "https://leodex.io" },
  "Ledger Wallet Desktop": { slug: "ledger", name: "Ledger", kind: "hardware", website: "https://www.ledger.com" },
  "Keystone 3 Pro (Cypherpunk firmware)": { slug: "keystone", name: "Keystone", kind: "hardware", website: "https://keyst.one" },
  Trezor: { slug: "trezor", name: "Trezor", kind: "hardware", website: "https://trezor.io" },
  "Gem Wallet": { slug: "gem-wallet", name: "Gem Wallet", kind: "wallet", website: "https://gemwallet.com" },
  Exodus: { slug: "exodus", name: "Exodus", kind: "wallet", website: "https://www.exodus.com" },
  "Atomic Wallet": { slug: "atomic-wallet", name: "Atomic Wallet", kind: "wallet", website: "https://atomicwallet.io" },
  "Trust Wallet": { slug: "trust-wallet", name: "Trust Wallet", kind: "wallet", website: "https://trustwallet.com" },
  Guarda: { slug: "guarda", name: "Guarda", kind: "wallet", website: "https://guarda.com" },
  Vultisig: { slug: "vultisig", name: "Vultisig", kind: "wallet", website: "https://vultisig.com" },
  zecd: { skip: "wallet server, not a consumer service" },
  "zcash-walletd": { skip: "wallet server, not a consumer service" },
  Zallet: { skip: "full-node wallet / RPC, not a consumer service" },

  // Exchanges and swaps
  Gemini: { slug: "gemini", name: "Gemini", kind: "exchange", website: "https://gemini.com" },
  // Outbound only to transparent addresses: that is what a withdrawal test measures.
  Coinbase: { slug: "coinbase", name: "Coinbase", kind: "exchange", website: "https://coinbase.com", claim: "transparent_only" },
  Kraken: { slug: "kraken", name: "Kraken", kind: "exchange", website: "https://kraken.com" },
  Binance: { slug: "binance", name: "Binance", kind: "exchange", website: "https://binance.com" },
  Robinhood: { slug: "robinhood", name: "Robinhood", kind: "exchange", website: "https://robinhood.com" },
  OKX: { slug: "okx", name: "OKX", kind: "exchange", website: "https://www.okx.com" },
  Bitfinex: { slug: "bitfinex", name: "Bitfinex", kind: "exchange", website: "https://bitfinex.com" },
  Gate: { slug: "gate", name: "Gate", kind: "exchange", website: "https://www.gate.com" },
  MEXC: { slug: "mexc", name: "MEXC", kind: "exchange", website: "https://www.mexc.com" },
  Poloniex: { slug: "poloniex", name: "Poloniex", kind: "exchange", website: "https://poloniex.com" },
  CoinDCX: { slug: "coindcx", name: "CoinDCX", kind: "exchange", website: "https://coindcx.com" },
  ChangeNOW: { slug: "changenow", name: "ChangeNOW", kind: "swap", website: "https://changenow.io" },
  StealthEX: { slug: "stealthex", name: "StealthEX", kind: "swap", website: "https://stealthex.io" },
  BitcoinVN: { slug: "bitcoinvn", name: "BitcoinVN", kind: "exchange", website: "https://bitcoinvn.io" },
  LeoDex: { slug: "leodex", name: "LeoDex", kind: "swap", website: "https://leodex.io" },

  // Corrections
  YWallet: { slug: "ywallet", name: "YWallet", kind: "wallet", website: null, claim: "no_longer_supported" },
  KuCoin: { slug: "kucoin", name: "KuCoin", kind: "exchange", website: "https://kucoin.com", claim: "no_longer_supported" },
  // The research says "not listed"; older notices disagree. Shown as disputed until our own check.
  Bitget: { slug: "bitget", name: "Bitget", kind: "exchange", website: "https://www.bitget.com", claim: "listing_disputed" },
  "zcashd wallet": { skip: "end-of-life node wallet, not a consumer service" },
  "OneKey Pro2 shielded ZEC": { slug: "onekey", name: "OneKey", kind: "hardware", website: "https://onekey.so", claim: "shielded_announced" },
  "Nighthawk Wallet": { slug: "nighthawk", name: "Nighthawk", kind: "wallet", website: null, claim: "no_current_release" },
};

export interface ParsedClaim {
  product: string;
  table: "wallets" | "exchanges" | "corrections";
  slug: string;
  name: string;
  kind: Kind;
  website: string | null;
  claim: ResearchClaim;
  detail: string;
  officialUrl: string;
}

const EM_DASH = "—";

const clean = (cell: string) =>
  cell
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/️/g, "") // emoji variation selector: "⚠️" becomes "⚠"
    .split(` ${EM_DASH} `)
    .join(": ") // house style: no em dashes in stored text
    .split(EM_DASH)
    .join("-")
    .trim();

/** The leading status mark of a cell: ✅ ❌ ⚠ ❓, or "" (e.g. a lone dash). */
const mark = (cell: string) => clean(cell).match(/^(✅|❌|⚠|❓)/u)?.[1] ?? "";
/** The cell's words without its status mark. */
const words = (cell: string) => clean(cell).replace(/^(✅|❌|⚠|❓|-)\s*/u, "").trim();

function tables(md: string): string[][][] {
  const out: string[][][] = [];
  let rows: string[][] | null = null;
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      if (rows?.length) out.push(rows);
      rows = null;
      continue;
    }
    if (/^\|[\s|:-]+\|$/.test(t)) continue; // separator row
    rows ??= [];
    rows.push(t.slice(1, -1).split("|").map((c) => c.trim()));
  }
  if (rows?.length) out.push(rows);
  return out;
}

const linkUrl = (cell: string) => cell.match(/\]\((https:\/\/[^)\s]+)\)/)?.[1] ?? null;

function shieldedClaim(shielded: string, ironwood: string, product: string): ResearchClaim {
  switch (mark(shielded)) {
    case "✅":
      return mark(ironwood) === "✅" ? "ironwood_supported" : "shielded_supported";
    case "❌":
      return "transparent_only";
    case "❓":
      return "shielded_not_claimed";
    default:
      throw new Error(`${product}: shielded status "${shielded}" is ambiguous; set claim in PRODUCTS`);
  }
}

export interface ParseResult {
  claims: ParsedClaim[];
  skipped: { product: string; reason: string }[];
}

export function parseResearch(md: string): ParseResult {
  const found = tables(md);
  const claims: ParsedClaim[] = [];
  const skipped: ParseResult["skipped"] = [];
  const kinds = { "Wallet / Product": "wallets", "Exchange / Service": "exchanges", "Product / Service": "corrections" } as const;
  const seen = new Set<string>();
  for (const [header, ...rows] of found) {
    const table = kinds[header[0] as keyof typeof kinds];
    if (!table) throw new Error(`Unknown research table starting "${header[0]}"`);
    seen.add(table);
    const col = (name: string) => {
      const i = header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
      if (i < 0) throw new Error(`${table}: no "${name}" column`);
      return i;
    };
    for (const row of rows) {
      const product = clean(row[0]);
      const p = PRODUCTS[product];
      if (!p) throw new Error(`Research row "${product}" is not in PRODUCTS; map it or mark it skipped`);
      if ("skip" in p) {
        skipped.push({ product, reason: p.skip });
        continue;
      }
      const officialUrl = linkUrl(row[col("Source")]);
      if (!officialUrl) throw new Error(`${product}: no https source link`);
      let claim: ResearchClaim;
      let detail: string;
      if (table === "wallets") {
        claim = p.claim ?? shieldedClaim(row[col("Shielded")], row[col("Ironwood")], product);
        detail = words(row[col("Notes")]);
      } else if (table === "exchanges") {
        const shielded = row[col("Shielded")];
        const ironwood = row[col("Ironwood")];
        claim = p.claim ?? shieldedClaim(shielded, ironwood, product);
        detail = `Shielded: ${words(shielded)}. Ironwood / network: ${words(ironwood)}.`;
      } else {
        if (!p.claim) throw new Error(`${product}: corrections need an explicit claim in PRODUCTS`);
        claim = p.claim;
        detail = words(row[col("Correction")]);
      }
      claims.push({ product, table, slug: p.slug, name: p.name, kind: p.kind, website: p.website, claim, detail, officialUrl });
    }
  }
  for (const t of ["wallets", "exchanges", "corrections"]) if (!seen.has(t)) throw new Error(`Research file has no ${t} table`);
  const dupes = claims.map((c) => c.slug).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupes.length) throw new Error(`Several research rows map to: ${[...new Set(dupes)].join(", ")}`);
  return { claims, skipped };
}
