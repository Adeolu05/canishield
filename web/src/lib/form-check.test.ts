import { test } from "node:test";
import assert from "node:assert/strict";
import type { Report } from "@zecproof/db";
import { bestCell, readinessOf } from "./evidence";
import { addressMatchesType, checkEvidence, imageSize, methodJson, parseFormCheck, sniffImage, stripMetadata } from "./form-check";
import { cellView, verdictFor } from "./present";

const NOW = new Date("2026-10-03T12:00:00Z");
const UA = `u1${"q".repeat(104)}`;
const T = `t1${"a".repeat(33)}`;
const SERVICE = "0b6f2a54-8e0e-4b2c-9a4f-1d2e3f405060";

const form = (o: Record<string, string> = {}) => {
  const v: Record<string, string> = { serviceId: SERVICE, addressType: "ironwood_ua", address: UA, result: "form_accepted", observedAt: "2026-10-03", ...o };
  return (name: string) => v[name] ?? null;
};

test("a valid form check parses, with the check date at midday UTC", () => {
  const r = parseFormCheck(form({ errorText: "  Invalid address  ", note: "" }), NOW);
  assert.ok(r.ok);
  assert.equal(r.value.errorText, "Invalid address");
  assert.equal(r.value.note, null);
  assert.equal(r.value.observedAt.toISOString(), "2026-10-03T12:00:00.000Z");
});

test("the real reference addresses (mainnet Trust Wallet tests) pass validation for their type", () => {
  const refs = {
    ironwood_ua: "u1a5qtpxl7fl6cz6nrmcpnhpa2kgmxyreat94j7a0vsmxyf3gguflq48rkfm5e88ydcqcj9vr32jp2094p40qgm6hrps69g7t37ywdm0fj",
    full_ua:
      "u1htzfjg489ed68p2zwr9m282q5psrm2lnscy9suw94gx9lekhq6jg72qd2w454mnvfk0a486g6p80r6k7jch99wcsac6thl84vzvlyduh36rkc309mxn7zr372yg3f6kkl6yxc3e2ttm",
    transparent: "t1UNFPmPYCyK9eNECvB51njwbjo3s3f8yzP",
  } as const;
  for (const [type, address] of Object.entries(refs)) {
    assert.ok(addressMatchesType(address, type as keyof typeof refs), type);
    assert.ok(parseFormCheck(form({ addressType: type, address }), NOW).ok, type);
  }
});

test("form check validation names each problem", () => {
  const bad = (o: Record<string, string>) => {
    const r = parseFormCheck(form(o), NOW);
    assert.ok(!r.ok);
    return r.errors.join(" ");
  };
  assert.match(bad({ serviceId: "x" }), /Pick a service/);
  assert.match(bad({ addressType: "sapling" }), /Pick an address type/);
  assert.match(bad({ address: T }), /unified address starts with u1/);
  assert.match(bad({ addressType: "transparent", address: UA }), /t-address starts with t1/);
  assert.match(bad({ address: `utest1${"q".repeat(100)}` }), /starts with u1/, "testnet addresses are refused");
  assert.match(bad({ result: "landed_in_ironwood" }), /accepted or rejected/);
  assert.match(bad({ observedAt: "2026-10-09" }), /future/);
  assert.match(bad({ observedAt: "yesterday" }), /date of the check/);
  assert.ok(parseFormCheck(form({ addressType: "transparent", address: T, result: "address_rejected" }), NOW).ok);
});

// --- images ---------------------------------------------------------------

const chunk = (type: string, data: number[]) => {
  const len = data.length;
  return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
};
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, extra: number[] = []) =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(w), ...be32(h), 8, 6, 0, 0, 0]),
    ...extra,
    ...chunk("IDAT", [1, 2, 3]),
    ...chunk("IEND", []),
  ]);
const seg = (marker: number, data: number[]) => [0xff, marker, ((data.length + 2) >> 8) & 255, (data.length + 2) & 255, ...data];
const jpeg = (w: number, h: number, extra: number[] = []) =>
  new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]), // APP0 JFIF
    ...extra,
    ...seg(0xc0, [8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
    0xff, 0xda, 0, 2, 9, 9, 9, // scan
    0xff, 0xd9,
  ]);

test("evidence: PNG and JPEG only, sized from their headers", () => {
  assert.equal(sniffImage(png(10, 20)), "png");
  assert.equal(sniffImage(jpeg(30, 40)), "jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a.................................")), null);
  assert.deepEqual(imageSize(png(1440, 900), "png"), { width: 1440, height: 900 });
  assert.deepEqual(imageSize(jpeg(1170, 2532), "jpeg"), { width: 1170, height: 2532 });
});

test("evidence: refuses empty, oversized, non-image and huge-dimension files", () => {
  assert.match((checkEvidence(new Uint8Array()) as { error: string }).error, /empty/);
  assert.match((checkEvidence(new Uint8Array(4 * 1024 * 1024 + 1)) as { error: string }).error, /over 4 MB/);
  assert.match((checkEvidence(new TextEncoder().encode("<svg onload=alert(1)>........................")) as { error: string }).error, /PNG or JPEG/);
  assert.match((checkEvidence(png(9000, 100)) as { error: string }).error, /8000 px/);
  assert.ok(checkEvidence(png(1440, 900)).ok);
});

test("evidence: metadata (EXIF, XMP, text chunks) is stripped, pixels kept", () => {
  const exif = seg(0xe1, [...[..."Exif"].map((c) => c.charCodeAt(0)), 0, 0, 0x47, 0x50, 0x53]); // "GPS" inside
  const clean = stripMetadata(jpeg(10, 10, exif), "jpeg");
  assert.ok(!Buffer.from(clean).includes(Buffer.from("Exif")), "EXIF gone");
  assert.ok(Buffer.from(clean).includes(Buffer.from("JFIF")), "JFIF header kept");
  assert.deepEqual(imageSize(clean, "jpeg"), { width: 10, height: 10 });
  assert.deepEqual([...clean.subarray(-2)], [0xff, 0xd9], "scan data and end marker kept");

  const text = chunk("tEXt", [...[..."Author\0me"].map((c) => c.charCodeAt(0))]);
  const exifPng = chunk("eXIf", [1, 2, 3, 4]);
  const p = stripMetadata(png(5, 5, [...text, ...exifPng]), "png");
  const s = Buffer.from(p).toString("latin1");
  assert.ok(!s.includes("tEXt") && !s.includes("eXIf"));
  assert.ok(s.includes("IHDR") && s.includes("IDAT") && s.includes("IEND"));
  const ok = checkEvidence(png(5, 5, text));
  assert.ok(ok.ok && !Buffer.from(ok.bytes).toString("latin1").includes("tEXt"), "checkEvidence strips too");
});

// --- semantics --------------------------------------------------------------

const formReport = (o: Partial<Report>): Report =>
  ({
    id: "f1",
    serviceId: "s",
    network: "mainnet",
    tier: "community",
    status: "unreviewed",
    method: "withdrawal_form_check",
    outcome: "form_accepted",
    addressType: "ironwood_ua",
    address: UA,
    errorText: null,
    observedAt: new Date("2026-10-03T12:00:00Z"),
    evidenceUrl: "/api/evidence/binance-ironwood_ua-2026-10-03-0a1b2c3d.png",
    createdAt: NOW,
    updatedAt: NOW,
    sourceReadAt: null,
    ...o,
  }) as Report;

test("a form accept is community evidence, never verified and never Ironwood-ready", () => {
  const accepted = [formReport({}), formReport({ id: "f2", addressType: "full_ua" })];
  assert.equal(readinessOf([], accepted), "untested");
  const cell = bestCell([], accepted, "ironwood_ua", NOW);
  assert.equal(cell.tier, "community");
  const view = cellView(cell, NOW);
  assert.equal(view.label, "Form accepted (not submitted)");
  assert.equal(view.tier, "community");
  assert.ok(view.pendingReview);
  assert.notEqual(verdictFor("untested", [], accepted, NOW).title, "Ironwood-ready");
});

test("a form rejection of a UA reads as Address rejected, dated by the check", () => {
  const rejected = formReport({ outcome: "address_rejected", errorText: "Invalid address", observedAt: new Date("2026-10-01T12:00:00Z") });
  assert.equal(readinessOf([], [rejected]), "rejected");
  const cell = bestCell([], [rejected], "ironwood_ua", NOW);
  assert.equal(cellView(cell, NOW).label, "Address rejected");
  assert.ok(cell.tier === "community" && cell.date.toISOString().startsWith("2026-10-01"));
});

test("export: method fields on every community report", () => {
  assert.deepEqual(methodJson(formReport({ errorText: "Invalid address" })), {
    method: "withdrawal_form_check",
    methodLabel: "withdrawal form check (not submitted)",
    errorText: "Invalid address",
    observedAt: "2026-10-03T12:00:00.000Z",
    address: UA,
  });
  assert.deepEqual(methodJson({ method: null, errorText: null, observedAt: null, address: null }), {
    method: null,
    methodLabel: null,
    errorText: null,
    observedAt: null,
    address: null,
  });
});
