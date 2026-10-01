// Guards for where and how keygen runs.
import { existsSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { dirname, join, resolve } from "node:path";

/** Nearest ancestor (or self) that is a git working tree, if any. */
export function enclosingGitRepo(dir: string): string | undefined {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** True if this machine can resolve a public Zcash host, i.e. looks online. */
export async function looksOnline(): Promise<boolean> {
  try {
    await Promise.race([
      lookup("zec.rocks"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}
