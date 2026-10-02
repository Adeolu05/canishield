// One-off: download each service's own icon into web/public/service-icons/,
// so the site serves logos from its own origin and visitors' browsers never
// contact an exchange. Run by hand (npm run fetch:icons -w @zecproof/db);
// existing icons are kept unless --force. Only each service's own website
// (services.website_url) is contacted; no third-party favicon services.
//
// You can also drop a file in by hand (<slug>.png or <slug>.svg); the
// manifest below is rebuilt from the folder on every run.
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb, services } from "./index";
import { iconCandidates, sniff, svgIsSafe, type IconFormat } from "./icons";

const OUT_DIR = fileURLToPath(new URL("../../../web/public/service-icons/", import.meta.url));
const MANIFEST = fileURLToPath(new URL("../../../web/src/lib/service-icons.json", import.meta.url));
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; ZecProof icon fetch; one-off)";

/** Pages to read instead of the listed website, when the homepage is not the brand's. */
const PAGE_OVERRIDES: Record<string, string> = {};

const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

async function fetchIcon(site: string): Promise<{ bytes: Uint8Array; format: IconFormat; from: string } | { error: string }> {
  const page = await get(site);
  const html = page && (page.headers.get("content-type") ?? "").includes("html") ? await page.text() : "";
  const base = page?.url || site;
  for (const c of iconCandidates(html, base)) {
    const r = await get(c.url);
    if (!r) continue;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
    const format = sniff(bytes);
    if (!format) continue;
    if (format === "svg" && !svgIsSafe(new TextDecoder().decode(bytes))) continue;
    return { bytes, format, from: c.url };
  }
  return { error: page ? "no PNG or SVG icon found" : "site did not respond (blocked or down)" };
}

const existing = () => {
  try {
    return readdirSync(OUT_DIR).filter((f) => /^[a-z0-9-]+\.(png|svg)$/.test(f));
  } catch {
    return [];
  }
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const db = createDb();
  const rows = await db.select({ slug: services.slug, name: services.name, website: services.websiteUrl }).from(services);
  await db.$client.end();

  const have = new Set(existing().map((f) => f.replace(/\.(png|svg)$/, "")));
  for (const s of rows.sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (only && !only.includes(s.slug)) continue;
    if (have.has(s.slug) && !force) {
      console.log(`  keep   ${s.slug}`);
      continue;
    }
    const site = PAGE_OVERRIDES[s.slug] ?? s.website;
    if (!site?.startsWith("https://")) {
      console.log(`  skip   ${s.slug}: no https website`);
      continue;
    }
    const res = await fetchIcon(site);
    if ("error" in res) {
      console.log(`  miss   ${s.slug}: ${res.error} (monogram will show)`);
      continue;
    }
    for (const ext of ["png", "svg"]) {
      try {
        unlinkSync(`${OUT_DIR}${s.slug}.${ext}`);
      } catch {}
    }
    writeFileSync(`${OUT_DIR}${s.slug}.${res.format}`, res.bytes);
    console.log(`  saved  ${s.slug}.${res.format} (${res.bytes.length} B) from ${res.from}`);
  }

  // The manifest the site reads: slug -> public path. Built from what is on disk.
  const manifest = Object.fromEntries(
    existing()
      .sort()
      .map((f) => [f.replace(/\.(png|svg)$/, ""), `/service-icons/${f}`]),
  );
  const before = (() => {
    try {
      return readFileSync(MANIFEST, "utf8");
    } catch {
      return "";
    }
  })();
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  if (next !== before) writeFileSync(MANIFEST, next);
  console.log(`\n${Object.keys(manifest).length} icon(s) in ${OUT_DIR}. Review them, then commit web/public/service-icons and web/src/lib/service-icons.json.`);
}

await main();
