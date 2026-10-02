// Every icon the manifest lists is a file we serve ourselves, never a remote URL.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import manifest from "./service-icons.json";

test("service icons are local files that exist", () => {
  for (const [slug, src] of Object.entries(manifest as Record<string, string>)) {
    assert.match(src, /^\/service-icons\/[a-z0-9-]+\.(png|svg)$/, slug);
    assert.ok(existsSync(new URL(`../../public${src}`, import.meta.url)), `${slug}: ${src} missing`);
  }
});
