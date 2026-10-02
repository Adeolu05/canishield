import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeCheck, Braces, Clock, FileText, KeyRound, ScanSearch, Send, Users } from "lucide-react";
import type { Readiness } from "@/lib/evidence";
import { LISTED_CLAIM, STALE_AFTER_DAYS } from "@/lib/evidence";
import { ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, canCreateTests, type NetworkId } from "@/lib/network";
import { OUTCOME_VISUAL, READINESS_ORDER, READINESS_VISUAL, cellView, shortDate, strongestTier, type Tone } from "@/lib/present";
import { getBoard, getLatestProof, getServiceDetail } from "@/lib/queries";
import { readinessOf } from "@/lib/evidence";
import { verdictFor } from "@/lib/present";
import { SITE_URL } from "@/lib/site";
import { ProofTrace } from "@/components/proof-trace";
import { ShareProof } from "@/components/share";
import { ServiceIcon } from "@/components/service-icon";
import { CyclingHeadline } from "@/components/cycling-headline";
import { ScannerWord } from "@/components/scanner-word";
import { CopyButton } from "@/components/copy-button";
import { RelativeTime } from "@/components/live";
import { StatusIcon, StatusLabel, TONE_TEXT } from "@/components/status";
import { BoardSearch, BoardSearchProvider, TestedMatrix, UntestedList, type TestedRowView, type UntestedRowView } from "./board-client";

const BAR_FILL: Record<Tone, string> = {
  ok: "bg-[var(--ok-fg)]",
  shield: "bg-[var(--shield-fg)]",
  warn: "bg-[var(--warn-fg)]",
  bad: "bg-[var(--bad-fg)]",
  info: "bg-[var(--info-fg)]",
  listed: "bg-line-strong",
  neutral: "bg-line",
};

function ReadinessBar({ counts, total, tested }: { counts: Record<Readiness, number>; total: number; tested: number }) {
  const shown = READINESS_ORDER.filter((k) => k !== "shielded_other" || counts[k] > 0);
  const summary = shown.map((k) => `${counts[k]} ${READINESS_VISUAL[k].label.toLowerCase()}`).join(", ");
  return (
    <section aria-labelledby="readiness-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="readiness-title" className="text-lg font-semibold tracking-tight">
          <span className="tabular-nums">{tested}</span> of <span className="tabular-nums">{total}</span> services tested
        </h2>
        <p className="text-xs text-subtle">Ironwood readiness, from on-chain and community evidence</p>
      </div>
      <div role="img" aria-label={`Ironwood readiness: ${summary}`} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {shown
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <span
              key={k}
              title={`${READINESS_VISUAL[k].label}: ${counts[k]}`}
              className={`h-full ${BAR_FILL[READINESS_VISUAL[k].tone]}`}
              style={{ width: `${(counts[k] / Math.max(total, 1)) * 100}%` }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {shown.map((k) => (
          <li key={k} className="inline-flex items-center gap-2">
            <StatusIcon icon={READINESS_VISUAL[k].icon} className={`size-4 ${TONE_TEXT[READINESS_VISUAL[k].tone]}`} />
            <span className="text-muted">{READINESS_VISUAL[k].label}</span>
            <span className="font-semibold tabular-nums">{counts[k]}</span>
          </li>
        ))}
      </ul>
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs font-medium text-subtle transition-colors duration-150 hover:text-foreground">
          What do these mean?
        </summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {shown.map((k) => (
            <div key={k}>
              <dt className="font-medium">{READINESS_VISUAL[k].label}</dt>
              <dd className="text-xs text-subtle">{READINESS_VISUAL[k].meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

const shortTxid = (txid: string) => `${txid.slice(0, 10)}…${txid.slice(-8)}`;

async function LatestProof({ network }: { network: NetworkId }) {
  const proof = await getLatestProof(network);
  const base = basePath(network);
  const pool = proof?.test.receivedPool;
  const txid = proof?.test.receivedTxid;
  if (!proof || !pool || !txid) {
    return (
      <aside className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Latest proof</p>
        <p className="mt-4">No verified payment on this board yet. The first one will appear here with its txid.</p>
      </aside>
    );
  }
  const { test, service } = proof;
  const v = OUTCOME_VISUAL[pool];
  // The same service's other address types that a form refused: drawn as stubs ending in ✕.
  const detail = await getServiceDetail(network, service.slug);
  const visible = detail ? [...detail.communityReports, ...detail.listings] : [];
  const rejected = [
    ...new Set(
      (detail?.communityReports ?? [])
        .filter((r) => r.outcome === "address_rejected" && r.addressType && r.addressType !== test.addressType)
        .map((r) => r.addressType!),
    ),
  ];
  const verdict = verdictFor(readinessOf(detail?.tests ?? [], visible), detail?.tests ?? [], visible);
  const pageUrl = `${SITE_URL}${base}/services/${service.slug}`;
  const height = test.receivedHeight?.toLocaleString("en-US");
  const shareText = `${service.name} → ${verdict.title.toLowerCase()}. Verified on-chain, block ${height}.`;
  const when = test.receivedAt ?? test.updatedAt;
  const row = "flex items-baseline justify-between gap-4 py-2";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle";
  return (
    <aside aria-labelledby="latest-proof" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 [box-shadow:var(--shadow-card),var(--shadow-glow)] lg:[box-shadow:var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="latest-proof" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
          Latest proof
        </h2>
        <span className="text-xs text-subtle">
          <RelativeTime iso={when.toISOString()} fallback={shortDate(when)} />
        </span>
      </div>
      <div className="mt-4">
        <ProofTrace serviceName={service.name} proof={{ addressType: test.addressType, pool }} rejected={rejected} />
      </div>
      <dl className="mt-4 divide-y divide-dashed divide-line-strong/60 border-y border-dashed border-line-strong/60 text-sm">
        <div className={row}>
          <dt className={label}>Service</dt>
          <dd>
            <Link href={`${base}/services/${service.slug}`} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
              <ServiceIcon slug={service.slug} name={service.name} />
              {service.name}
            </Link>
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Sent to</dt>
          <dd>{ADDRESS_TYPE_LABEL[test.addressType]}</dd>
        </div>
        <div className={row}>
          <dt className={label}>Result</dt>
          <dd>
            <StatusLabel icon={v.icon} tone={v.tone} label={v.label} />
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Txid</dt>
          <dd className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums" title={txid}>
              {shortTxid(txid)}
            </span>
            <CopyButton value={txid} label="txid" />
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Block</dt>
          <dd className="font-mono text-xs tabular-nums">{test.receivedHeight?.toLocaleString("en-US")}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-ok">
          <BadgeCheck aria-hidden="true" className="size-4" />
          {test.explorerName ? `Confirmed on ${test.explorerName}` : "Verified on-chain"}
        </span>
        <Link
          href={`${base}/services/${service.slug}`}
          className="inline-flex items-center gap-1 font-medium text-accent-ink underline-offset-4 hover:underline"
        >
          View evidence <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <div className="mt-4 border-t border-dashed border-line-strong/60 pt-4">
        <ShareProof url={pageUrl} text={shareText} />
      </div>
    </aside>
  );
}

const STEPS = [
  {
    icon: KeyRound,
    title: "Fresh address",
    body: "We derive a brand-new address of the type being tested, used once and never shown anywhere else.",
  },
  {
    icon: Send,
    title: "Service pays it",
    body: "A tester withdraws a small amount from the service to that address, exactly as any user would.",
  },
  {
    icon: ScanSearch,
    title: "Scanner proves the pool",
    body: "Our scanner finds the payment on-chain and records the pool it landed in, with a txid anyone can check.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="zp-band space-y-6 py-12">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Method</p>
        <h2 id="how-title" className="mt-2 text-2xl font-semibold tracking-tight">
          How verification works
        </h2>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full border border-line-strong font-mono text-xs font-semibold tabular-nums text-accent-ink">
                {i + 1}
              </span>
              <step.icon aria-hidden="true" className="size-4 text-subtle" />
            </div>
            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Names the headline cycles through, best known first; anything else on the board follows.
const POPULAR = ["binance", "trust-wallet", "coinbase", "kraken", "gemini", "okx", "kucoin", "robinhood", "zingo"];
const CHIPS = ["binance", "coinbase", "kraken", "trust-wallet"];

function Legend() {
  const item = "inline-flex items-center gap-2";
  return (
    <section aria-labelledby="legend-title" className="space-y-2 text-xs text-muted">
      <h2 id="legend-title" className="font-semibold text-foreground">
        Reading the icons
      </h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        <li className={item}>
          <StatusLabel icon="shield-check" tone="ok" label="Ironwood" className="font-normal" />
        </li>
        <li className={item}>
          <StatusLabel icon="eye" tone="warn" label="Transparent" className="font-normal" /> landed in public view
        </li>
        <li className={item}>
          <StatusLabel icon="x-circle" tone="bad" label="Address rejected" className="font-normal" />
        </li>
        <li className={item}>
          <StatusLabel icon="file-text" tone="listed" label="Listed: …" className="font-normal" /> someone else&apos;s claim
        </li>
      </ul>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        <li className={item}>
          <BadgeCheck aria-hidden="true" className="size-4 text-ok" /> on-chain verified
        </li>
        <li className={item}>
          <Users aria-hidden="true" className="size-4 text-info" /> community reported
        </li>
        <li className={item}>
          <FileText aria-hidden="true" className="size-4 text-listed" /> unverified listing
        </li>
        <li className={item}>
          <Clock aria-hidden="true" className="size-4 text-stale" /> stale: older than {STALE_AFTER_DAYS} days
        </li>
        <li className="text-subtle">Hover or focus a tier icon for its date and review state.</li>
      </ul>
    </section>
  );
}

export async function BoardView({ network }: { network: NetworkId }) {
  const { rows, counts, total } = await getBoard(network);
  const base = basePath(network);
  const testsOpen = canCreateTests(network);
  const now = new Date();

  const tested: TestedRowView[] = [];
  const untested: UntestedRowView[] = [];
  let verifiedCount = 0;
  for (const { service, cells, readiness } of rows) {
    const c = {
      ironwood_ua: cellView(cells.ironwood_ua, now),
      full_ua: cellView(cells.full_ua, now),
      transparent: cellView(cells.transparent, now),
    };
    const common = { id: service.id, slug: service.slug, name: service.name, kind: service.kind, href: `${base}/services/${service.slug}` };
    const strongest = strongestTier(Object.values(c));
    if (strongest === "verified") verifiedCount++;
    if (strongest === "verified" || strongest === "community") {
      tested.push({ ...common, readiness, cells: c });
    } else {
      // One phrase per service: the UA claim if listed, else the t-address claim.
      const claim = [cells.ironwood_ua, cells.full_ua, cells.transparent].find((x) => x.tier === "listing");
      untested.push({
        ...common,
        testHref: `${base}/test?service=${service.id}`,
        listing:
          claim && claim.tier === "listing"
            ? { label: LISTED_CLAIM[claim.report.outcome].label, source: c.ironwood_ua.source ?? c.transparent.source ?? "a listing", readOn: shortDate(claim.date, now) }
            : null,
      });
    }
  }

  const unit = NETWORKS[network].unit;
  const bySlug = new Map(rows.map((r) => [r.service.slug, r.service.name]));
  const headlineNames = [
    ...POPULAR.filter((slug) => bySlug.has(slug)).map((slug) => bySlug.get(slug)!),
    ...rows.map((r) => r.service.name).filter((n) => !POPULAR.some((p) => bySlug.get(p) === n)),
  ].slice(0, 8);
  const chips = CHIPS.filter((slug) => bySlug.has(slug)).map((slug) => ({ slug, name: bySlug.get(slug)! }));
  const exportHref = `/api/results.json${network === "testnet" ? "?network=testnet" : ""}`;

  return (
    <BoardSearchProvider>
      <div className="space-y-12">
        <section className="relative isolate grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-12 lg:pt-16">
          {/* Full-bleed backdrop: a faint dot grid fading downward and, in dark mode on wide
              screens, the gold glow behind the receipt. Decoration only; under everything. */}
          <div aria-hidden="true" className="zp-bleed pointer-events-none -top-10 bottom-0 -z-10">
            <div className="zp-dots absolute inset-0" />
            <div className="zp-hero-glow absolute inset-0 hidden lg:block" />
          </div>
          <div className="space-y-8">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
                {network === "mainnet" ? "Zcash · Ironwood readiness" : "Testnet · rehearsal board"}
              </p>
              <div className="mt-4">
                <CyclingHeadline unit={unit} names={headlineNames} />
              </div>
              <p className="mt-6 max-w-[65ch] text-pretty text-lg text-muted">
                Every result carries its proof: a txid and a published viewing key you can check yourself. Claims we haven&apos;t
                tested are labelled as someone else&apos;s.
              </p>
            </div>
            <div className="max-w-xl space-y-4">
              <BoardSearch placeholder="Search Binance, Zingo, Trust Wallet…" />
              {chips.length > 0 && (
                <ul aria-label="Popular services" className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`${base}/services/${c.slug}`}
                        className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-4 text-xs font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={testsOpen ? `${base}/test` : "/testnet/test"}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-[#18181b] transition-[filter] duration-150 hover:brightness-105"
              >
                {testsOpen ? "Run a test" : "Try a test on testnet"} <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-2"
              >
                How verification works <ArrowDown aria-hidden="true" className="size-4" />
              </a>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
              <span>
                <span className="tabular-nums">{total}</span> services tracked
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="tabular-nums">{verifiedCount}</span> verified on-chain
              </span>
              <span aria-hidden="true">·</span>
              <ScannerWord network={network} />
            </p>
          </div>
          <LatestProof network={network} />
        </section>

        <ReadinessBar counts={counts} total={total} tested={tested.length} />

        <TestedMatrix rows={tested} />

        <UntestedList
          rows={untested}
          note={network === "mainnet" && !testsOpen ? "Mainnet tests aren't open yet; the flow can be tried on testnet" : undefined}
        />

        <HowItWorks />

        <Legend />

        <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
          <Braces aria-hidden="true" className="size-4" />
          Reuse this data:
          <a href={exportHref} className="font-mono text-foreground underline underline-offset-4">
            {exportHref}
          </a>
        </p>
      </div>
    </BoardSearchProvider>
  );
}
