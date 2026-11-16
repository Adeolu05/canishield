import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Braces, Rss, Send } from "lucide-react";
import { LivePill as Pill } from "@/components/live-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { ServiceIcon } from "@/components/service-icon";
import { NOT_LIVE, ago, eventTitle, presentLive, type LiveView } from "@/lib/live";
import { listServices, liveStatuses, recentLiveEvents } from "@/lib/queries";

/** A public Telegram channel link, if one is configured (t.me only). */
function telegramUrl(): string | null {
  const u = process.env.STATUS_TELEGRAM_URL?.trim();
  return u && /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u) ? u : null;
}

function Row({ v, now }: { v: LiveView; now: Date }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="py-3 pr-3 text-left font-medium sm:pr-4">
        <Link href={`/services/${v.slug}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
          <ServiceIcon slug={v.slug} name={v.name} size={18} />
          {v.name}
        </Link>
        {v.note && <p className="mt-1 text-xs font-normal text-warn">{v.note[0].toUpperCase() + v.note.slice(1)}</p>}
        {/* Phones have no Checked column: the time sits under the name. */}
        <p className="mt-1 text-xs font-normal text-subtle sm:hidden">{v.fresh ? `Checked ${ago(v.checkedAt, now)}` : "Not checked recently"}</p>
      </th>
      <td className="py-3 pr-3 sm:pr-4">
        <Pill state={v.deposit} label="Deposits" />
      </td>
      <td className="py-3 sm:pr-4">
        <Pill state={v.withdraw} label="Withdrawals" />
      </td>
      <td className="py-3 pr-4 text-muted max-md:hidden">{v.creditEstimate ? `${v.creditEstimate} (${v.confirmations} conf.)` : <span className="text-subtle">Not published</span>}</td>
      <td className="py-3 text-muted max-sm:hidden">
        <time dateTime={v.checkedAt.toISOString()} title={v.checkedAt.toISOString()}>
          {ago(v.checkedAt, now)}
        </time>
        {!v.fresh && <p className="text-xs text-warn">Not checked recently</p>}
      </td>
    </tr>
  );
}

export async function StatusView() {
  const now = new Date();
  // A database problem shows as "unavailable", not an error page.
  const [rows, events, all] = await Promise.all([liveStatuses().catch(() => null), recentLiveEvents(10).catch(() => null), listServices("mainnet").catch(() => [])]);
  const unavailable = rows === null;
  const live = (rows ?? []).map((r) => presentLive(r, now));
  const liveSlugs = new Set(live.map((v) => v.slug));
  const notLive = all.filter((s) => s.kind === "exchange" && !liveSlugs.has(s.slug));
  const paused = live.filter((v) => v.deposit === "paused" || v.withdraw === "paused");
  const readable = live.filter((v) => v.deposit !== "unknown" || v.withdraw !== "unknown");
  const telegram = telegramUrl();

  return (
    <div className="space-y-10">
      <AutoRefresh intervalMs={60_000} />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Can I move ZEC right now?</h1>
        <p className="max-w-2xl text-muted">
          Live ZEC deposit and withdrawal status, read from each exchange&rsquo;s own public API every 5 minutes. Open or paused is about ZEC in general.
          Whether <strong className="font-semibold text-foreground">shielded</strong> ZEC works is on each exchange&rsquo;s record.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a href="/status/feed.xml" className="inline-flex items-center gap-1.5 font-medium text-accent-ink underline-offset-4 hover:underline">
            <Rss aria-hidden="true" className="size-4" /> Follow changes (RSS)
          </a>
          {telegram && (
            <a href={telegram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent-ink underline-offset-4 hover:underline">
              <Send aria-hidden="true" className="size-4" /> Telegram alerts
            </a>
          )}
          <a href="/api/status.json" className="inline-flex items-center gap-1.5 font-medium text-accent-ink underline-offset-4 hover:underline">
            <Braces aria-hidden="true" className="size-4" /> JSON
          </a>
        </div>
      </div>

      {live.length > 0 && (
        <p role="status" className="max-w-none rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-card">
          {paused.length > 0 ? (
            <>
              <span className="font-medium text-bad">
                {paused.length} {paused.length === 1 ? "exchange has" : "exchanges have"} ZEC paused:
              </span>{" "}
              <span className="text-muted">{paused.map((v) => v.name).join(", ")}.</span>
            </>
          ) : readable.length > 0 ? (
            <>
              <span className="font-medium text-ok">No pauses right now</span>
              <span className="text-muted">
                {" "}
                on the {readable.length} {readable.length === 1 ? "exchange" : "exchanges"} we could read
                {readable.length < live.length ? ` (${live.length - readable.length} unknown)` : ""}.
              </span>
            </>
          ) : live.every((v) => !v.fresh) ? (
            <span className="text-muted">The scanner hasn&rsquo;t checked the exchanges for a while, so every reading shows as unknown until it does.</span>
          ) : (
            <span className="text-muted">No exchange could be read just now. The next check is within 5 minutes.</span>
          )}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Read live</h2>
        {live.length === 0 ? (
          <p className="max-w-none rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            {unavailable ? "Live status is unavailable right now. Try again in a few minutes." : "No readings yet. They appear a few minutes after the scanner starts reading exchanges."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface px-4 shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">ZEC deposit and withdrawal status per exchange, from each exchange&rsquo;s public API</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                  <th scope="col" className="py-2.5 pr-3 font-medium sm:pr-4">Exchange</th>
                  <th scope="col" className="py-2.5 pr-3 font-medium sm:pr-4">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownToLine aria-hidden="true" className="size-3.5 max-sm:hidden" /> Deposits
                    </span>
                  </th>
                  <th scope="col" className="py-2.5 font-medium sm:pr-4">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpFromLine aria-hidden="true" className="size-3.5 max-sm:hidden" /> Withdrawals
                    </span>
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium max-md:hidden">Deposit credit</th>
                  <th scope="col" className="py-2.5 font-medium max-sm:hidden">Checked</th>
                </tr>
              </thead>
              <tbody>
                {live.map((v) => (
                  <Row key={v.slug} v={v} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-subtle">
          A state only changes after two readings in a row agree. Unknown means the feed couldn&rsquo;t be read, never that ZEC is paused. Deposit credit is a
          rough estimate: the confirmations the exchange publishes, at Zcash&rsquo;s 25-second block target.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent changes</h2>
        {!events || events.length === 0 ? (
          <p className="max-w-none rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            {events ? "No pauses or reopenings recorded yet." : "Recent changes are unavailable right now."}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-4 shadow-card">
            {events.map((e) => (
              <li key={`${e.slug}-${e.side}-${e.at.getTime()}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <Link href={`/services/${e.slug}`} className={`font-medium underline-offset-4 hover:underline ${e.toState === "paused" ? "text-bad" : "text-ok"}`}>
                  {eventTitle(e)}
                </Link>
                <time dateTime={e.at.toISOString()} className="text-muted">
                  {ago(e.at, now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notLive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Not read live</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {notLive.map((s) => (
              <li key={s.slug} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
                <ServiceIcon slug={s.slug} name={s.name} size={18} className="mt-0.5" />
                <span>
                  <Link href={`/services/${s.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {s.name}
                  </Link>
                  <span className="block text-muted">{NOT_LIVE[s.slug] ?? "No public status feed found."}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
