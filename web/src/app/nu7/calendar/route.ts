// "Add to calendar": an .ics event at the current activation estimate.
// GET /nu7/calendar. The estimate moves with the block pace; the file says so.
import { getNu7Snapshot } from "@/lib/nu7-data";
import { NU7_HEIGHT } from "@/lib/nu7";
import { SITE_URL } from "@/lib/site";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 text: escape \ ; , and newlines. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

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
  const url = `${SITE_URL}/nu7`;
  const h = NU7_HEIGHT.toLocaleString("en-US");
  // Live: the activation block's own timestamp. Upcoming: the estimate. Neither
  // (database unreachable): the planned day, said plainly.
  const at = snap.activation?.time ?? snap.etaMs ?? Date.UTC(2026, 10, 5, 12, 0, 0);
  const kind = snap.activation ? "recorded" : snap.etaMs ? "estimate" : "planned";
  const description = [
    kind === "recorded" ? `Zcash NU7 activated at block ${h}. This is the block's timestamp as recorded by Can I Shield's scanner.` : `Zcash NU7 activates at block ${h}.`,
    kind === "estimate" ? "This time is an estimate from the recent block pace when you downloaded it. The block height is fixed; the time can move by hours." : "",
    kind === "planned" ? "Planned for around 5 November 2026; the exact time depends on when block " + h + " is mined." : "",
    `Live countdown: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CanIShield//NU7//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:nu7-${NU7_HEIGHT}@canishield`,
    // Increases with each download, so a calendar that re-imports the file takes the newer estimate.
    `SEQUENCE:${Math.floor(Date.now() / 60_000) - 29_800_000}`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(at - 30 * 60_000)}`,
    `DTEND:${stamp(at + 30 * 60_000)}`,
    `SUMMARY:${text(kind === "recorded" ? "Zcash NU7 activated" : kind === "estimate" ? "Zcash NU7 activates (estimate)" : "Zcash NU7 activates (planned day)")}`,
    `DESCRIPTION:${text(description)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text("Zcash NU7 in about an hour")}`,
    "TRIGGER:-PT30M",
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
