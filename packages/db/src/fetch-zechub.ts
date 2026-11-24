// npm run fetch:zechub -w @zecproof/db
//
// Downloads ZecHub's custodial-exchanges page and rewrites the listing
// snapshot. It does not touch the database. Apply the file with
// `npm run import:zechub -w @zecproof/db` (that needs DATABASE_URL).
import { writeFileSync } from "node:fs";
import { claimsFromListing, parseZecHubMarkdown } from "./zechub-md";

const RAW = "https://raw.githubusercontent.com/ZecHub/zechub/master/site/Using_Zcash/Custodial_Exchanges.md";
const COMMITS = "https://api.github.com/repos/ZecHub/zechub/commits?path=site/Using_Zcash/Custodial_Exchanges.md&per_page=1";
const PAGE = "https://zechub.wiki/using-zcash/custodial-exchanges";

const dataDir = new URL("../data/", import.meta.url);
const mdPath = new URL("zechub-custodial-exchanges.md", dataDir);
const jsonPath = new URL("zechub-custodial-exchanges.json", dataDir);

interface CommitResponse {
  sha?: string;
  commit?: { committer?: { date?: string } };
}

const md = await fetch(RAW).then((r) => {
  if (!r.ok) throw new Error(`ZecHub page download failed: ${r.status}`);
  return r.text();
});
const commits = (await fetch(COMMITS, { headers: { Accept: "application/vnd.github+json", "User-Agent": "canishield-fetch-zechub" } }).then((r) => {
  if (!r.ok) throw new Error(`ZecHub commit lookup failed: ${r.status}`);
  return r.json();
})) as CommitResponse[];
const commit = commits[0]?.sha;
const committedAt = commits[0]?.commit?.committer?.date;
if (!commit || !committedAt) throw new Error("ZecHub commit response had no sha or date.");

const exchanges = parseZecHubMarkdown(md).map((e) => ({
  ...e,
  // Key order matches the previous snapshot: transparent, then the two unified types.
  claims: claimsFromListing(e.supports, e.ironwood),
}));
const readAt = new Date().toISOString().slice(0, 10);

const snapshot = {
  format: "zecproof-listing-snapshot/1",
  source: {
    name: "ZecHub Wiki: Custodial Exchanges",
    url: PAGE,
    file: `https://github.com/ZecHub/zechub/blob/${commit}/site/Using_Zcash/Custodial_Exchanges.md`,
    commit,
    committedAt,
    readAt,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "Adapted from the ZecHub Wiki (ZecHub contributors), CC BY-SA 4.0. Quotes are verbatim; the per-address-type claims below are CanIShield's reading of them.",
  },
  mapping: {
    transparent: '"Supports" names transparent addresses → claim the service pays a transparent address.',
    "ironwood_ua / full_ua (rejected)": '"Ironwood: Not applicable, transparent addresses only" → claim the service does not accept unified addresses.',
    "ironwood_ua / full_ua (accepted)":
      '"Supports" names unified withdrawals (and Orchard) → claim the form accepts the address. Which pool a payment lands in is not stated.',
    "no claim": '"Not stated", or shielded support limited to Sapling z-addresses (not in the MVP matrix) → the cell stays Untested.',
  },
  exchanges,
};

writeFileSync(mdPath, md.endsWith("\n") ? md : `${md}\n`);
writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${exchanges.length} exchange(s), read ${readAt}, commit ${commit.slice(0, 10)}.`);
