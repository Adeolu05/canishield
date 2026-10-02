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
