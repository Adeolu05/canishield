// Withdrawal form checks: paste a reference address into a service's withdrawal
// form, note whether the form accepted or rejected it, and do NOT submit. No
// key is assigned and no funds move, so this is community evidence about the
// form only. A form accept never counts as verified or as Ironwood-ready.
// Pure functions: validation and image checks, tested in form-check.test.ts.
import type { AddressType, Report } from "@zecproof/db";

export const FORM_CHECK_METHOD = "withdrawal_form_check" as const;
export const FORM_CHECK_LABEL = "withdrawal form check (not submitted)";

/** Screenshots: PNG or JPEG, at most 4 MB and 8000 px a side. */
export const EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;
export const EVIDENCE_MAX_SIDE = 8000;

/** Form checks are a local tool: on in development, opt-in elsewhere. */
export const canLogFormChecks = () =>
  process.env.NODE_ENV !== "production" || process.env.ZECPROOF_ENABLE_FORM_CHECKS === "yes";

export interface FormCheckInput {
  serviceId: string;
  addressType: AddressType;
  address: string;
  result: "form_accepted" | "address_rejected";
  errorText: string | null;
  observedAt: Date;
  note: string | null;
}

const ADDRESS_TYPES: AddressType[] = ["ironwood_ua", "full_ua", "transparent"];
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Mainnet only: UAs start u1, t-addresses t1. Form checks are never filed on testnet. */
export function addressMatchesType(address: string, type: AddressType) {
  return type === "transparent" ? /^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : /^u1[02-9ac-hj-np-z]{100,}$/.test(address);
}

/**
 * Validates a submitted form check. Returns the clean input or a list of
 * human-readable problems. `today` is injectable for tests.
 */
export function parseFormCheck(
  get: (name: string) => unknown,
  today = new Date(),
): { ok: true; value: FormCheckInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const serviceId = text(get("serviceId"), 64);
  if (!serviceId || !/^[0-9a-f-]{36}$/i.test(serviceId)) errors.push("Pick a service.");
  const addressType = get("addressType");
  if (!ADDRESS_TYPES.includes(addressType as AddressType)) errors.push("Pick an address type.");
  const address = text(get("address"), 600) ?? "";
  if (!address) errors.push("Paste the address you used.");
  else if (ADDRESS_TYPES.includes(addressType as AddressType) && !addressMatchesType(address, addressType as AddressType)) {
    errors.push(addressType === "transparent" ? "A t-address starts with t1." : "A unified address starts with u1.");
  }
  const result = get("result");
  if (result !== "form_accepted" && result !== "address_rejected") errors.push("Say whether the form accepted or rejected it.");
  const date = text(get("observedAt"), 10);
  let observedAt = new Date(NaN);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) observedAt = new Date(`${date}T12:00:00Z`);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (Number.isNaN(observedAt.getTime())) errors.push("Give the date of the check.");
  else if (observedAt > tomorrow) errors.push("The date can't be in the future.");
  else if (observedAt < new Date("2024-01-01T00:00:00Z")) errors.push("The date looks too old.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      serviceId: serviceId!,
      addressType: addressType as AddressType,
      address,
      result: result as FormCheckInput["result"],
      errorText: text(get("errorText"), 500),
      observedAt,
      note: text(get("note"), 1000),
    },
  };
}

// ---- Evidence images ---------------------------------------------------------

export type EvidenceFormat = "png" | "jpeg";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** What the bytes are, regardless of file name or the browser's content type. */
export function sniffImage(b: Uint8Array): EvidenceFormat | null {
  if (b.length > 24 && PNG_SIG.every((x, i) => b[i] === x)) return "png";
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return null;
}

/** Pixel size from the PNG IHDR or the JPEG SOF marker; null if unreadable. */
export function imageSize(b: Uint8Array, format: EvidenceFormat): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (format === "png") {
    if (String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return null;
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    const len = v.getUint16(o + 2);
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { height: v.getUint16(o + 5), width: v.getUint16(o + 7) };
    if (marker === 0xda || len < 2) return null; // reached image data without a size
    o += 2 + len;
  }
  return null;
}

/**
 * Drops metadata a screenshot or phone photo may carry (EXIF with GPS, XMP,
 * comments, text chunks) without touching the pixels.
 */
export function stripMetadata(b: Uint8Array, format: EvidenceFormat): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const keep: Uint8Array[] = [];
  if (format === "png") {
    keep.push(b.subarray(0, 8));
    const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
    let o = 8;
    while (o + 12 <= b.length) {
      const len = v.getUint32(o);
      const type = String.fromCharCode(...b.subarray(o + 4, o + 8));
      const end = o + 12 + len;
      if (end > b.length) break;
      if (!drop.has(type)) keep.push(b.subarray(o, end));
      o = end;
      if (type === "IEND") break;
    }
  } else {
    keep.push(b.subarray(0, 2)); // SOI
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const marker = b[o + 1];
      if (marker === 0xda) {
        keep.push(b.subarray(o)); // start of scan: the rest is image data
        break;
      }
      const end = o + 2 + v.getUint16(o + 2);
      if (end > b.length) break;
      // APP1 (EXIF / XMP), APP2-APP13 and COM go; APP0 (JFIF) and APP14 (Adobe colour) stay.
      const metadata = (marker >= 0xe1 && marker <= 0xed) || marker === 0xfe;
      if (!metadata) keep.push(b.subarray(o, end));
      o = end;
    }
  }
  const out = new Uint8Array(keep.reduce((n, k) => n + k.length, 0));
  let at = 0;
  for (const k of keep) {
    out.set(k, at);
    at += k.length;
  }
  return out;
}

/** Checks an uploaded screenshot; returns clean bytes to store, or why it was refused. */
export function checkEvidence(b: Uint8Array): { ok: true; bytes: Uint8Array; format: EvidenceFormat } | { ok: false; error: string } {
  if (b.length === 0) return { ok: false, error: "The screenshot is empty." };
  if (b.length > EVIDENCE_MAX_BYTES) return { ok: false, error: "The screenshot is over 4 MB." };
  const format = sniffImage(b);
  if (!format) return { ok: false, error: "The screenshot must be a PNG or JPEG." };
  const size = imageSize(b, format);
  if (!size || size.width < 1 || size.height < 1) return { ok: false, error: "Couldn't read the image size." };
  if (size.width > EVIDENCE_MAX_SIDE || size.height > EVIDENCE_MAX_SIDE) return { ok: false, error: "The screenshot is over 8000 px a side." };
  return { ok: true, bytes: stripMetadata(b, format), format };
}

/** Export fields for a report's method; the same shape for every community report. */
export function methodJson(r: Pick<Report, "method" | "errorText" | "observedAt" | "address">) {
  return {
    method: r.method,
    methodLabel: r.method === FORM_CHECK_METHOD ? FORM_CHECK_LABEL : null,
    errorText: r.errorText,
    observedAt: r.observedAt ? r.observedAt.toISOString() : null,
    address: r.address,
  };
}
