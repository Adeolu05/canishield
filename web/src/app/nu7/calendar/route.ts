// "Add to calendar": an .ics event at the current activation estimate.
// GET /nu7/calendar. The estimate moves with the block pace; the file says so.
import { getNu7Snapshot } from "@/lib/nu7-data";
import { NU7_HEIGHT } from "@/lib/nu7";
import { SITE_URL } from "@/lib/site";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 text: escape \ ; , and newlines. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** RFC 5545 line folding: at most 75 octets per line, continuation lines start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export async function GET() {
  const snap = await getNu7Snapshot();
  // Fallback when there is no live estimate: the planned day, 5 Nov 2026 (UTC noon).
  const eta = snap.etaMs ?? Date.UTC(2026, 10, 5, 12, 0, 0);
  const url = `${SITE_URL}/nu7`;
  const description = [
    `Zcash NU7 activates at block ${NU7_HEIGHT.toLocaleString("en-US")}.`,
    "This time is an estimate from the recent block pace when you downloaded it. The block height is fixed; the time can move by hours.",
    `Live countdown: ${url}`,
  ].join("\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CanIShield//NU7//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:nu7-${NU7_HEIGHT}@canishield`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(eta - 30 * 60_000)}`,
    `DTEND:${stamp(eta + 30 * 60_000)}`,
    `SUMMARY:${text("Zcash NU7 activates (estimate)")}`,
    `DESCRIPTION:${text(description)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text("Zcash NU7 in about an hour")}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zcash-nu7.ics"',
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
