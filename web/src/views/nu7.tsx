import Link from "next/link";
import { Archive, ArrowDown, ArrowRight, ArrowUpRight, Building2, Clock, Server, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { Nu7Countdown, type InitialTip } from "@/components/nu7-countdown";
import { StatusLabel } from "@/components/status";
import { canCreateTests } from "@/lib/network";
import { NU7_HEIGHT, NU7_PLANNED_DATE, SOURCES } from "@/lib/nu7";
import { READINESS_VISUAL, cellView, strongestTier } from "@/lib/present";
import { getBoard, getScannerHeartbeat } from "@/lib/queries";

type Source = (typeof SOURCES)[keyof typeof SOURCES];
const H = NU7_HEIGHT.toLocaleString("en-US");

function Cite({ sources }: { sources: Source[] }) {
  return (
    <p className="mt-4 text-xs text-subtle">
      Source:{" "}
      {sources.map((s, i) => (
        <span key={s.href}>
          {i > 0 && ", "}
          <a href={s.href} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:text-foreground">
            {s.label}
          </a>
        </span>
      ))}
    </p>
  );
}

function ExternalAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
    >
      {children} <ArrowUpRight aria-hidden="true" className="size-4" />
    </a>
  );
}

function InternalAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
      {children} <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

const ROLES = [
  {
    id: "wallet",
    icon: Smartphone,
    title: "I keep ZEC in a wallet app",
    urgent: true,
    body: [
      "Update the app before activation. Every network upgrade changes the consensus branch ID a transaction must commit to, so a wallet that doesn't know NU7 can't send once it activates.",
      "Hardware wallets may need a firmware update as well.",
    ],
    action: <ExternalAction href={SOURCES.readiness.href}>Check your wallet on the NU7 readiness tracker</ExternalAction>,
    note: "An independent list: every line links to the issue, pull request or code it is based on.",
    sources: [SOURCES.readiness],
  },
  {
    id: "sprout",
    icon: Archive,
    title: "I have old Sprout funds (a zc… address)",
    urgent: true,
    body: [
      `Move them out before block ${H}. NU7 disables v4 transactions, the only kind that can spend Sprout, so Sprout funds left behind can't be spent normally after activation.`,
      "An old zcashd wallet.dat can hold Sprout funds you have forgotten about. Check it now.",
    ],
    action: <ExternalAction href={SOURCES.sprout.href}>Read the recovery thread</ExternalAction>,
    sources: [SOURCES.timeline, SOURCES.zebra],
  },
  {
    id: "exchange",
    icon: Building2,
    title: "I withdraw ZEC from exchanges",
    urgent: false,
    body: [
      "Exchanges and custodial wallets have to upgrade too, and some may pause ZEC deposits and withdrawals while they do.",
      "Before you withdraw, check whether the service can pay a shielded address at all. After NU7, blocks come every 25 seconds, so a withdrawal should reach the chain sooner.",
    ],
    action: <InternalAction href="/">Check a service on the board</InternalAction>,
    sources: [SOURCES.zebra],
  },
  {
    id: "node",
    icon: Server,
    title: "I run a node, indexer or explorer",
    urgent: true,
    body: [
      `Upgrade before block ${H}: Zebra 7.0.0 or later. After activation, NU7 nodes disconnect older peers, and nodes that haven't upgraded follow a different chain.`,
      "Zebra 7.0.0 migrates its database on first start, and a downgrade means a full resync, so back up first. Indexers and explorers may need changes too.",
    ],
    action: <ExternalAction href={SOURCES.zebra.href}>Zebra 7.0.0 release notes</ExternalAction>,
    sources: [SOURCES.zebra, SOURCES.timeline],
  },
];

const CHANGES = [
  {
    title: "Blocks every 25 seconds",
    body: "Down from 75, so the first confirmation comes about three times sooner. Daily issuance stays the same: block rewards are divided by three and the remaining halving intervals are tripled.",
    sources: [SOURCES.zip218, SOURCES.zebra],
  },
  {
    title: "Sprout is frozen",
    body: "v4 transactions are disabled and no new Sprout JoinSplits are allowed, so funds still in Sprout can no longer be spent normally.",
    sources: [SOURCES.timeline, SOURCES.zebra],
  },
  {
    title: "Part of every fee is set aside",
    body: "60% of each block's transaction fees go into a reserve and miners keep 40%. From block 8,939,664, blocks start reissuing a small part of that reserve on top of the normal reward.",
    sources: [SOURCES.zip235, SOURCES.zebra],
  },
  {
    title: "More shielded capacity, lighter sync",
    body: "Per-block limits on Orchard, Ironwood and Sapling activity more than double Orchard throughput (2.9 to 6.6 transactions per second) and cut the worst-case spam a light wallet has to download by about 37%.",
    sources: [SOURCES.zebra],
  },
  {
    title: "What stays the same",
    body: "The four-year halving schedule, the 21 million ZEC cap and the transaction format. NU7 adds no new transaction format.",
    sources: [SOURCES.zebra, SOURCES.timeline],
  },
];

async function initialTip(): Promise<InitialTip> {
  try {
    const hb = await getScannerHeartbeat("mainnet");
    return { tip: hb?.tip ?? null, seenAt: hb?.seenAt.toISOString() ?? null };
  } catch {
    // The countdown still renders (with the planned date) if the database is down.
    return { tip: null, seenAt: null };
  }
}

async function testedServices() {
  try {
    const { rows } = await getBoard("mainnet");
    const now = new Date();
    return rows
      .map(({ service, cells, readiness }) => {
        const views = [cellView(cells.ironwood_ua, now), cellView(cells.full_ua, now), cellView(cells.transparent, now)];
        const tier = strongestTier(views);
        const dates = views.filter((v) => (v.tier === "verified" || v.tier === "community") && v.dateIso).map((v) => v.dateIso!);
        const latest = dates.sort().at(-1);
        return { service, readiness, tier, latest, label: views.find((v) => v.dateIso === latest)?.dateLabel };
      })
      .filter((r) => r.tier === "verified" || r.tier === "community");
  } catch {
    return [];
  }
}

export async function Nu7View() {
  const [initial, tested] = await Promise.all([initialTip(), testedServices()]);
  const testHref = canCreateTests("mainnet") ? "/test" : "/testnet/test";

  return (
    <div className="space-y-16">
      <section className="relative isolate grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-12 lg:pt-16">
        <div aria-hidden="true" className="zp-bleed pointer-events-none -top-10 bottom-0 -z-10">
          <div className="zp-dots absolute inset-0" />
          <div className="zp-hero-glow absolute inset-0 hidden lg:block" />
        </div>
        <div className="space-y-8">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Zcash network upgrade · NU7</p>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Ready for NU7?</h1>
            <p className="mt-6 max-w-[60ch] text-pretty text-lg text-muted">
              Zcash&apos;s next network upgrade activates at block <span className="tabular-nums text-foreground">{H}</span>, planned for
              around {NU7_PLANNED_DATE}. Blocks get three times faster and old Sprout funds stop being spendable. Here is what to check,
              depending on how you hold ZEC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#what-to-do"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-[#18181b] transition-[filter] duration-150 hover:brightness-105"
            >
              What do I need to do? <ArrowDown aria-hidden="true" className="size-4" />
            </a>
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-2"
            >
              Check a service <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <p className="text-xs text-subtle">Every claim on this page links to its source.</p>
        </div>
        <Nu7Countdown initial={initial} />
      </section>

      <section id="what-to-do" aria-labelledby="what-to-do-title" className="space-y-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Before block {H}</p>
          <h2 id="what-to-do-title" className="mt-2 text-2xl font-semibold tracking-tight">
            What do I need to do?
          </h2>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => (
            <li key={r.id} id={r.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2">
                  <r.icon aria-hidden="true" className="size-5 text-accent-ink" />
                </span>
                {r.urgent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                    <Clock aria-hidden="true" className="size-3.5" /> Before activation
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{r.title}</h3>
              <div className="mt-2 space-y-2 text-sm text-muted">
                {r.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              <div className="mt-auto pt-4">
                {r.action}
                {r.note && <p className="mt-1 text-xs text-subtle">{r.note}</p>}
                <Cite sources={r.sources} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="changes-title" className="zp-band space-y-6 py-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">In plain words</p>
          <h2 id="changes-title" className="mt-2 text-2xl font-semibold tracking-tight">
            What NU7 changes
          </h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANGES.map((c, i) => (
            <li key={c.title} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-8 place-items-center rounded-full border border-line-strong font-mono text-xs font-semibold tabular-nums text-accent-ink">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted">{c.body}</p>
              <div className="mt-auto">
                <Cite sources={c.sources} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="board-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Can I Shield and NU7</p>
          <h2 id="board-title" className="text-2xl font-semibold tracking-tight">
            Before you withdraw after the upgrade
          </h2>
          <p className="text-muted">
            These services have been tested on mainnet. Every result here was recorded before NU7, and we plan to retest them after
            activation. Until then, treat them as the last known behaviour.
          </p>
          {tested.length > 0 ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {tested.map(({ service, readiness, label }) => {
                const v = READINESS_VISUAL[readiness];
                return (
                  <li key={service.id}>
                    <Link
                      href={`/services/${service.slug}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className="font-medium">{service.name}</span>
                      <span className="flex items-center gap-4 text-sm">
                        <StatusLabel icon={v.icon} tone={v.tone} label={v.label} />
                        {label && <span className="text-xs text-subtle">{label}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">The board couldn&apos;t be loaded right now.</p>
          )}
          <InternalAction href="/">See the full board</InternalAction>
        </div>
        <aside aria-label="What the board shows" className="space-y-4">
          {[
            { icon: ShieldCheck, title: "Shielded or not", body: "Which pool a service's withdrawal actually landed in, with a txid and a viewing key anyone can check." },
            { icon: Clock, title: "Time to chain", body: "How long a tested withdrawal took to reach a block. With 25-second blocks, we expect this to drop." },
            { icon: Wallet, title: "Deposits, next", body: "We are adding deposit checks, so you can also see whether a service credits a deposit sent the way you send it." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-4">
              <p className="inline-flex items-center gap-2 font-semibold">
                <f.icon aria-hidden="true" className="size-4 text-accent-ink" /> {f.title}
              </p>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
          <Link
            href={testHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-btn px-6 text-sm font-semibold text-btn-fg transition-opacity duration-150 hover:opacity-90"
          >
            Help retest: run a test <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </aside>
      </section>

      <section aria-labelledby="sources-title" className="space-y-3 border-t border-line pt-8">
        <h2 id="sources-title" className="text-sm font-semibold">
          Sources
        </h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.values(SOURCES).map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted underline-offset-4 hover:text-foreground hover:underline">
                {s.label} <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-subtle">
          Can I Shield is independent and not part of any upgrade team. Read 29 October 2026; if a source and this page disagree, the
          source wins.
        </p>
      </section>
    </div>
  );
}
