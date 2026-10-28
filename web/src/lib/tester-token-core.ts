// Pure helpers for the tester token (see tester-token.ts). No request access here,
// so they can be unit tested.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const testerCookieName = (testId: string) => `cis_tester_${testId}`;

export const hashTesterToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh token and the hash to store on the test. */
export function newTesterToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashTesterToken(token) };
}

/** True when the token matches the stored hash (constant-time). */
export function tokenMatches(token: string | undefined, storedHash: string | null): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashTesterToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
