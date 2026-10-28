import "server-only";
// Proof that a browser created a test: a random token in an httpOnly cookie,
// with only its sha256 stored on the test. Test pages are public once shared,
// so tester-only fields (the withdrawal request time) need this, not the link.
import { cookies } from "next/headers";
import { testerCookieName, tokenMatches } from "./tester-token-core";

export { newTesterToken } from "./tester-token-core";

const MAX_AGE_SECONDS = 7 * 24 * 3600; // longer than a test can stay open (48 h) plus confirmations

/** Sets the cookie, scoped to the test's own page (its render and its actions); call only from a Server Function. */
export async function setTesterCookie(testId: string, token: string, path: string) {
  (await cookies()).set(testerCookieName(testId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path,
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Whether the current request comes from the browser that created this test. */
export async function isTester(testId: string, storedHash: string | null): Promise<boolean> {
  return tokenMatches((await cookies()).get(testerCookieName(testId))?.value, storedHash);
}
