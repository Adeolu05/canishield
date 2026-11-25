// Pure helpers that stop one browser from opening the same test again and again
// (repeat clicks used up a whole mainnet key batch on Nov 25, 2026). No request
// access here, so they can be unit tested.

export const OPEN_TESTS_COOKIE = "cis_open_tests";
const MAX_ENTRIES = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^(mainnet|testnet):[0-9a-f-]{36}:(ironwood_ua|full_ua|transparent)$/;

export type OpenTests = Record<string, string>;

/** One entry per network, service and address type. */
export const openTestKey = (network: string, serviceId: string, addressType: string) => `${network}:${serviceId}:${addressType}`;

/** Reads the cookie, dropping anything malformed. Never throws. */
export function parseOpenTests(raw: string | undefined): OpenTests {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: OpenTests = {};
    for (const [k, v] of Object.entries(value)) {
      if (KEY.test(k) && typeof v === "string" && UUID.test(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Records a new test, keeping only the newest entries so the cookie stays small. */
export function rememberOpenTest(current: OpenTests, key: string, testId: string): OpenTests {
  const rest = Object.entries(current).filter(([k]) => k !== key);
  return Object.fromEntries([...rest, [key, testId] as const].slice(-MAX_ENTRIES));
}

/** Statuses where an existing test can still be used, so a new one isn't needed. */
export const STILL_OPEN = ["pending", "awaiting_payment", "confirming"] as const;

/**
 * Mainnet keys come from a fixed pool. Refuse a new test when the tests already
 * waiting for an address would use up every key that is left.
 */
export function poolIsFull(waitingForAddress: number, availableKeys: number): boolean {
  return waitingForAddress >= availableKeys;
}
