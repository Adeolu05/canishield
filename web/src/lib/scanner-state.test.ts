import { test } from "node:test";
import assert from "node:assert/strict";
import { ONLINE_WITHIN_SECONDS, SCANNER_LABEL, heartbeatAge, parseScannerAnswer, scannerState, type ScannerAnswer } from "./scanner-state";

const T = Date.parse("2026-11-16T08:42:00Z");
const answer = (over: Partial<ScannerAnswer> = {}): ScannerAnswer => ({
  online: true,
  tip: 3578645,
  seenAt: new Date(T - 4000).toISOString(),
  ageSeconds: 4,
  receivedAt: T,
  ...over,
});

test("unknown: no answer yet is 'Checking scanner', never offline (server HTML and first paint)", () => {
  assert.deepEqual(scannerState(null, null), { state: "checking", age: null });
  assert.deepEqual(scannerState(null, T), { state: "checking", age: null });
  assert.equal(SCANNER_LABEL.checking, "Checking scanner");
});

test("online: the 16 Nov case (ageSeconds 4) is online, including before the clock starts", () => {
  assert.deepEqual(scannerState(answer(), T), { state: "online", age: 4 });
  assert.deepEqual(scannerState(answer(), null), { state: "online", age: 4 }, "first render after the answer, clock not ticking yet");
  assert.equal(scannerState(answer(), T + 86_000).state, "online", "4 s + 86 s = 90 s: still online");
});

test("offline: only after a real answer says so, or the heartbeat passes 90 s", () => {
  assert.deepEqual(scannerState(answer(), T + 87_000), { state: "offline", age: 91 });
  assert.equal(scannerState(answer({ online: false, seenAt: null, ageSeconds: null, tip: null }), T).state, "offline", "no heartbeat ever recorded");
  assert.equal(scannerState(answer({ online: false, ageSeconds: 300 }), T).state, "offline");
  assert.equal(ONLINE_WITHIN_SECONDS, 90);
});

test("a visitor's wrong clock doesn't flip the state: age comes from the server's ageSeconds", () => {
  // Clock 10 minutes ahead: received and now are both on the same (wrong) clock.
  const skewed = answer({ receivedAt: T + 600_000 });
  assert.deepEqual(scannerState(skewed, T + 600_000 + 5_000), { state: "online", age: 9 });
  // Without ageSeconds (older API), fall back to seenAt on the local clock.
  assert.equal(heartbeatAge(answer({ ageSeconds: null }), T + 6_000), 10);
  assert.equal(heartbeatAge(answer({ ageSeconds: null, seenAt: "not a date" }), T), null);
});

test("parseScannerAnswer: only a real API answer counts", () => {
  assert.equal(parseScannerAnswer(null, T), null);
  assert.equal(parseScannerAnswer({ error: "unknown network" }, T), null);
  assert.equal(parseScannerAnswer("<html>", T), null);
  assert.deepEqual(parseScannerAnswer({ network: "mainnet", online: true, tip: 3578645, seenAt: "2026-11-16T08:41:56.000Z", ageSeconds: 4 }, T), {
    online: true,
    tip: 3578645,
    seenAt: "2026-11-16T08:41:56.000Z",
    ageSeconds: 4,
    receivedAt: T,
  });
  assert.equal(parseScannerAnswer({ online: false, tip: "x", seenAt: 5, ageSeconds: Infinity }, T)?.ageSeconds, null);
});
