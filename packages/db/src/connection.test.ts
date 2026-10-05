import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionSettings } from "./connection";

const NEON_POOLED = "postgresql://u:p@ep-cool-name-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const NEON_DIRECT = "postgresql://u:p@ep-cool-name-a1b2c3.eu-central-1.aws.neon.tech/neondb";

test("local Docker Postgres: unchanged, no SSL forced, prepared statements on", () => {
  const { url, options } = connectionSettings("postgres://zecproof:zecproof@localhost:5432/zecproof", {});
  assert.equal(url, "postgres://zecproof:zecproof@localhost:5432/zecproof");
  assert.equal(options.prepare, true);
  assert.equal(options.max, 5);
  assert.equal(options.idle_timeout, undefined);
});

test("Neon pooled: drops channel_binding, keeps sslmode, no prepared statements", () => {
  const { url, options } = connectionSettings(NEON_POOLED, {});
  const u = new URL(url);
  assert.equal(u.searchParams.get("sslmode"), "require");
  assert.equal(u.searchParams.has("channel_binding"), false);
  assert.equal(options.prepare, false);
});

test("Neon direct without sslmode: SSL is required anyway", () => {
  const { url, options } = connectionSettings(NEON_DIRECT, {});
  assert.equal(new URL(url).searchParams.get("sslmode"), "require");
  assert.equal(options.prepare, true);
});

test("explicit sslmode is respected", () => {
  const { url } = connectionSettings(`${NEON_DIRECT}?sslmode=verify-full`, {});
  assert.equal(new URL(url).searchParams.get("sslmode"), "verify-full");
});

test("on Vercel: small pool that closes idle connections", () => {
  const { options } = connectionSettings(NEON_POOLED, { VERCEL: "1" });
  assert.equal(options.max, 3);
  assert.equal(options.idle_timeout, 20);
});
