// House style: no em dashes in anything under web/src (copy, titles, aria
// labels, comments). Rewrite with a colon, full stop, comma or "·".
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EM_DASH = String.fromCharCode(0x2014);

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(tsx?|css|md|json)$/.test(entry.name)) yield path;
  }
}

test("no em dashes in web/src", () => {
  const hits: string[] = [];
  for (const file of files(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.includes(EM_DASH)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, [], `Em dashes found:\n${hits.join("\n")}`);
});

// The product is "Can I Shield?" / "CanIShield"; another, unrelated project has
// our old name (OLD_NAME). Case-sensitive on purpose: internal identifiers keep the
// zecproof prefix (@zecproof/* packages, ZECPROOF_* env vars, zecproofDb).
const OLD_NAME = ["Zec", "Proof"].join("");

test("the old product name never appears in web/src", () => {
  const hits: string[] = [];
  for (const file of files(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.includes(OLD_NAME)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, [], `Old name found (use BRAND from lib/brand.ts):\n${hits.join("\n")}`);
});
