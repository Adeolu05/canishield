import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeCheck, Braces, Clock, FileText, KeyRound, ScanSearch, Send, Users } from "lucide-react";
import type { AddressType, Pool, Report, Test } from "@zecproof/db";
import type { Readiness } from "@/lib/evidence";
import { LISTED_CLAIM, STALE_AFTER_DAYS, reportDate, testDate } from "@/lib/evidence";
import { ADDRESS_TYPE_LABEL, POOL_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, canCreateTests, outcomeReportsEnabled, type NetworkId } from "@/lib/network";
import { READINESS_ORDER, READINESS_VISUAL, cellView, shortDate, strongestTier, type Tone } from "@/lib/present";
import { acceptedOutcomes, getBoard } from "@/lib/queries";
import type { ReadMode } from "@/lib/read-mode";
import { latestAcross, weekLabel } from "@/lib/outcome-record";
import { OUTCOME_RESULT_LABEL } from "@/lib/outcome";
import { LatestOutcomes } from "@/components/outcome-record";
import { Nu7Strip } from "@/components/nu7-live";
import { LivePausedLink } from "@/components/live-paused";
import { depositsEnabled, publishedDeposits, type PublishedDeposit } from "@/lib/deposit-checks";
import { DEPOSIT_ADDRESS_LABEL, DEPOSIT_RESULT_LABEL, DEPOSIT_SERVICE_KINDS, roundedDuration } from "@/lib/deposit-core";
import type { DepositCellView } from "./board-client";
import { getNu7Snapshot } from "@/lib/nu7-data";
import { SITE_URL } from "@/lib/site";
import { RESEARCH_CLAIM, inactiveLast, isInactive, researchLabel, researchSource, resolutionFor, type ClaimLine } from "@/lib/research";
import { FORM_CHECK_METHOD } from "@/lib/form-check";
import {
  EVIDENCE_KIND_LABEL,
  describeResearch,
  formCheckTie,
  latestDate,
  pickLatest,
  plainStatus,
  whereToShield,
  zecHubListing,
  type EvidenceKind,
} from "@/lib/plain";
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

interface EvidenceCard {
  kind: EvidenceKind;
  at: Date;
  tie: number;
  serviceName: string;
  serviceSlug: string;
  detail: string;
  txid?: string;
  block?: number | null;
  explorerName?: string | null;
  addressType?: AddressType;
  pool?: Pool;
}

function weekDate(weekOf: string): Date {
  return new Date(`${weekOf}T00:00:00Z`);
}

/** Every check we made, newest first. Listings and research are claims, not evidence. */
function collectEvidence(
  servicesById: Map<string, { name: string; slug: string }>,
  verified: Test[],
  reports: Report[],
  deposits: PublishedDeposit[],
  outcomes: { serviceName: string; serviceSlug: string; result: keyof typeof OUTCOME_RESULT_LABEL; weekOf: string }[],
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  for (const test of verified) {
    const service = servicesById.get(test.serviceId);
    const pool = test.receivedPool;
    if (!service || !pool || !test.receivedTxid) continue;
    cards.push({
      kind: "onchain",
      at: testDate(test),
      tie: 0,
      serviceName: service.name,
      serviceSlug: service.slug,
      detail: `Sent to a ${ADDRESS_TYPE_LABEL[test.addressType].toLowerCase()}. The payment landed in the ${POOL_LABEL[pool].toLowerCase()} pool.`,
      txid: test.receivedTxid,
      block: test.receivedHeight,
      explorerName: test.explorerName,
      addressType: test.addressType,
      pool,
    });
  }
  for (const report of reports) {
    if (report.tier !== "community") continue;
    const service = servicesById.get(report.serviceId);
    if (!service) continue;
    const form = report.method === FORM_CHECK_METHOD;
    const sent = form ? " The address was pasted into the withdrawal form and nothing was sent." : "";
    const what =
      report.outcome === "address_rejected"
        ? `A ${report.addressType ? ADDRESS_TYPE_LABEL[report.addressType].toLowerCase() : "address"} was refused.${sent}`
        : report.outcome === "form_accepted"
          ? `A ${report.addressType ? ADDRESS_TYPE_LABEL[report.addressType].toLowerCase() : "address"} was accepted by the form.${sent} This is not proof of a payment.`
          : `Reported outcome: ${report.outcome}. Not an on-chain proof.`;
    cards.push({
      kind: form ? "form_check" : "community",
      at: reportDate(report),
      tie: formCheckTie(report.addressType, report.outcome),
      serviceName: service.name,
      serviceSlug: service.slug,
      detail: what,
    });
  }
  for (const deposit of deposits) {
    if (!deposit.result || (!deposit.blockTime && !deposit.reviewedAt)) continue;
    cards.push({
      kind: "deposit",
      at: deposit.reviewedAt ?? deposit.blockTime!,
      tie: 0,
      serviceName: deposit.serviceName,
      serviceSlug: deposit.serviceSlug,
      detail: `${DEPOSIT_RESULT_LABEL[deposit.result]}. This is a deposit from a shielded wallet, not a withdrawal. The transaction id is not published.`,
    });
  }
  for (const outcome of outcomes) {
    cards.push({
      kind: "exit",
      at: weekDate(outcome.weekOf),
      tie: 0,
      serviceName: outcome.serviceName,
      serviceSlug: outcome.serviceSlug,
      detail: `Exit report: ${OUTCOME_RESULT_LABEL[outcome.result].title}, ${weekLabel(outcome.weekOf)}. A reviewed report, not an on-chain proof.`,
    });
  }
  return cards;
}

function LatestEvidence({
  piece,
  onchain,
  rejected,
  base,
  now,
}: {
  piece: EvidenceCard | null;
  onchain: EvidenceCard | null;
  rejected: AddressType[];
  base: string;
  now: Date;
}) {
  if (!piece) {
    return (
      <aside className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Latest evidence</p>
        <p className="mt-4">No check on this board yet. The first one will appear here, labelled by how it was made.</p>
      </aside>
    );
  }
  const href = `${base}/services/${piece.serviceSlug}`;
  const row = "flex items-baseline justify-between gap-4 py-2";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle";
  const showOlderProof = onchain && piece.kind !== "onchain";
  return (
    <aside aria-labelledby="latest-evidence" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 [box-shadow:var(--shadow-card),var(--shadow-glow)] lg:[box-shadow:var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="latest-evidence" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
          Latest evidence
        </h2>
        <span className="text-xs text-subtle">
          <RelativeTime iso={piece.at.toISOString()} fallback={shortDate(piece.at, now)} />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium text-muted">{EVIDENCE_KIND_LABEL[piece.kind]}</p>
      {piece.kind === "onchain" && piece.addressType && piece.pool && (
        <div className="mt-4">
          <ProofTrace serviceName={piece.serviceName} proof={{ addressType: piece.addressType, pool: piece.pool }} rejected={rejected} />
        </div>
      )}
      <dl className="mt-4 divide-y divide-dashed divide-line-strong/60 border-y border-dashed border-line-strong/60 text-sm">
        <div className={row}>
          <dt className={label}>Service</dt>
          <dd>
            <Link href={href} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
              <ServiceIcon slug={piece.serviceSlug} name={piece.serviceName} />
              {piece.serviceName}
            </Link>
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>What we found</dt>
          <dd className="max-w-[18rem] text-right">{piece.detail}</dd>
        </div>
        {piece.kind === "onchain" && piece.txid && (
          <div className={row}>
            <dt className={label}>Txid</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono text-xs tabular-nums" title={piece.txid}>
                {shortTxid(piece.txid)}
              </span>
              <CopyButton value={piece.txid} label="txid" />
            </dd>
          </div>
        )}
        {piece.kind === "onchain" && piece.block != null && (
          <div className={row}>
            <dt className={label}>Block</dt>
            <dd className="font-mono text-xs tabular-nums">{piece.block.toLocaleString("en-US")}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        {piece.kind === "onchain" ? (
          <span className="inline-flex items-center gap-1 text-ok">
            <BadgeCheck aria-hidden="true" className="size-4" />
            {piece.explorerName ? `Confirmed on ${piece.explorerName}` : "Verified on-chain"}
          </span>
        ) : (
          <span className="text-subtle">Not an on-chain proof.</span>
        )}
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-accent-ink underline-offset-4 hover:underline">
          View the service <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {showOlderProof && onchain && (
        <p className="mt-4 border-t border-dashed border-line-strong/60 pt-4 text-xs text-subtle">
          Latest on-chain proof:{" "}
          <Link href={`${base}/services/${onchain.serviceSlug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
            {onchain.serviceName}
          </Link>
          , {shortDate(onchain.at, now)}. {onchain.detail}
        </p>
      )}
      {piece.kind === "onchain" && piece.txid && piece.pool && (
        <div className="mt-4 border-t border-dashed border-line-strong/60 pt-4">
          <ShareProof
            url={`${SITE_URL}${href}`}
            text={`${piece.serviceName} → landed in ${POOL_LABEL[piece.pool]}. Verified on-chain${piece.block != null ? `, block ${piece.block.toLocaleString("en-US")}` : ""}.`}
          />
        </div>
      )}
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

const DEPOSIT_VISUAL = {
  credited: { tone: "ok", icon: "check-circle" },
  held_for_review: { tone: "warn", icon: "clock" },
  not_credited_24h: { tone: "bad", icon: "x-circle" },
  wallet_refused: { tone: "bad", icon: "x-circle" },
} as const;

/** The newest published deposit per service, preferring results from after NU7. */
function depositCells(deposits: PublishedDeposit[], now: Date): Map<string, DepositCellView> {
  const best = new Map<string, PublishedDeposit>();
  for (const d of deposits) {
    const cur = best.get(d.serviceId);
    const newer = (x: PublishedDeposit) => (x.reviewedAt?.getTime() ?? 0);
    if (!cur || (d.afterNu7 && !cur.afterNu7) || (d.afterNu7 === cur.afterNu7 && newer(d) > newer(cur))) best.set(d.serviceId, d);
  }
  const out = new Map<string, DepositCellView>();
  for (const [id, d] of best) {
    if (!d.result) continue;
    const v = DEPOSIT_VISUAL[d.result];
    const time = d.creditedAt && d.blockTime ? roundedDuration(d.creditedAt.getTime() - d.blockTime.getTime()) : null;
    const tier = d.destinationChecked === false ? "Source checked on-chain (private)" : "On-chain checked (private)";
    out.set(id, {
      tone: v.tone,
      icon: v.icon,
      label: DEPOSIT_RESULT_LABEL[d.result],
      detail: [`${DEPOSIT_ADDRESS_LABEL[d.addressType]} address`, time, d.afterNu7 === false ? "before NU7" : null].filter(Boolean).join(" · "),
      title: `${tier} · from ${d.wallet}${d.blockTime ? ` · ${shortDate(d.blockTime, now)}` : ""}`,
    });
  }
  return out;
}

export async function BoardView({ network, dynamic = true }: { network: NetworkId; dynamic?: boolean }) {
  // dynamic: false lets the homepage use ISR. Live scanner and exchange status stay client-fetched.
  const mode: ReadMode = { dynamic };
  // NU7 is a mainnet event (testnet activated it on 4 Oct). Started alongside the board query;
  // getNu7Snapshot never throws; on a database problem the strip shows the planned date.
  const nu7Promise = network === "mainnet" ? getNu7Snapshot(mode) : null;
  const depositsPromise = publishedDeposits(network, undefined, mode).catch(() => [] as PublishedDeposit[]);
  // Exit outcomes are a mainnet record; a database problem only hides the strip.
  const outcomesPromise = network === "mainnet" ? acceptedOutcomes(network, undefined, mode).catch(() => []) : Promise.resolve([]);
  const { rows, counts, total, research, visible, verified } = await getBoard(network, mode);
  const researchBy = Map.groupBy(research, (r) => r.serviceId);
  const base = basePath(network);
  const testsOpen = canCreateTests(network);
  const now = new Date();
  const depositList = await depositsPromise;
  const outcomeRows = await outcomesPromise;
  const deposits = depositCells(depositList, now);
  const outcomeDates = Map.groupBy(outcomeRows, (o) => o.serviceId);

  const tested: TestedRowView[] = [];
  const untested: UntestedRowView[] = [];
  let verifiedCount = 0;
  const reportsByService = Map.groupBy(visible, (r) => r.serviceId);
  const serviceById = new Map(rows.map((r) => [r.service.id, { name: r.service.name, slug: r.service.slug }]));
  for (const { service, cells, readiness } of rows) {
    const c = {
      ironwood_ua: cellView(cells.ironwood_ua, now),
      full_ua: cellView(cells.full_ua, now),
      transparent: cellView(cells.transparent, now),
    };
    const common = { id: service.id, slug: service.slug, name: service.name, kind: service.kind, href: `${base}/services/${service.slug}` };
    const strongest = strongestTier(Object.values(c));
    if (strongest === "verified") verifiedCount++;
    const deposit = deposits.get(service.id);
    const serviceReports = reportsByService.get(service.id) ?? [];
    const listings = serviceReports.filter((r) => r.tier === "listing");
    const community = serviceReports.filter((r) => r.tier === "community");
    const ownTests = verified.filter((t) => t.serviceId === service.id);
    const serviceResearch = researchBy.get(service.id) ?? [];
    const status = plainStatus({
      readiness,
      ownCheckedAt: latestDate([
        ...ownTests.map(testDate),
        ...community.map(reportDate),
        ...depositList.filter((d) => d.serviceId === service.id).map((d) => d.reviewedAt ?? d.blockTime),
        ...(outcomeDates.get(service.id) ?? []).map((o) => new Date(`${o.weekOf}T00:00:00Z`)),
      ]),
      listingReadAt: latestDate(listings.map(reportDate)),
      researchReadAt: latestDate(serviceResearch.map((r) => r.readAt)),
      zecHub: zecHubListing(listings),
      researchSentence: describeResearch(serviceResearch, serviceReports),
      now,
    });
    if (strongest === "verified" || strongest === "community" || deposit) {
      tested.push({
        ...common,
        readiness,
        cells: c,
        deposit,
        depositNotApplicable: !(DEPOSIT_SERVICE_KINDS as readonly string[]).includes(service.kind),
        summary: status.line,
        checked: status.checked,
      });
    } else {
      // One line per source. ZecHub: the UA claim if listed, else the t-address claim.
      const claims: ClaimLine[] = [];
      const listed = [cells.ironwood_ua, cells.full_ua, cells.transparent].find((x) => x.tier === "listing");
      if (listed && listed.tier === "listing") {
        const source = c.ironwood_ua.source ?? c.transparent.source ?? "a listing";
        claims.push({ kind: "listing", label: LISTED_CLAIM[listed.report.outcome].label, source, title: `Unverified listing per ${source}, read ${shortDate(listed.date, now)}`, inactive: false });
      }
      const found = researchBy.get(service.id) ?? [];
      for (const r of found) {
        const source = researchSource(r.source).name;
        const resolved = resolutionFor(r, visible);
        claims.push({
          kind: "research",
          label: researchLabel(r, visible),
          source: resolved ? `${source}, read ${shortDate(r.readAt, now)}; resolved ${shortDate(resolved.date, now)}` : source,
          title: `Per ${source}, read ${shortDate(r.readAt, now)} from the official page${resolved ? `. Resolved ${shortDate(resolved.date, now)}: ${resolved.text}` : ""}`,
          inactive: !!RESEARCH_CLAIM[r.claim].inactive,
        });
      }
      untested.push({
        ...common,
        testHref: testsOpen ? `${base}/test?service=${service.id}` : null,
        claims,
        inactive: isInactive(found),
        summary: status.line,
        checked: status.checked,
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
  const nu7 = await nu7Promise;
  const latestOutcomes = latestAcross(outcomeRows, 4);
  const evidence = collectEvidence(serviceById, verified, visible, depositList, outcomeRows);
  const latest = pickLatest(evidence);
  const latestOnchain = pickLatest(evidence.filter((e) => e.kind === "onchain"));
  const rejectedForTrace =
    latest?.kind === "onchain" && latest.addressType
      ? [
          ...new Set(
            visible
              .filter(
                (r) =>
                  r.tier === "community" &&
                  r.outcome === "address_rejected" &&
                  r.addressType &&
                  r.addressType !== latest.addressType &&
                  serviceById.get(r.serviceId)?.slug === latest.serviceSlug,
              )
              .map((r) => r.addressType!),
          ),
        ]
      : [];
  const where = whereToShield(
    rows.map((r) => {
      const listings = (reportsByService.get(r.service.id) ?? []).filter((x) => x.tier === "listing");
      return {
        name: r.service.name,
        slug: r.service.slug,
        readiness: r.readiness,
        zecHub: zecHubListing(listings),
        listingReadAt: latestDate(listings.map(reportDate)),
      };
    }),
  );
  const walletLink = (slug: string, fallback: string) => {
    const row = rows.find((r) => r.service.slug === slug);
    if (!row) return fallback;
    return (
      <Link href={`${base}/services/${row.service.slug}`} className="font-medium text-foreground underline underline-offset-4">
        {row.service.name}
      </Link>
    );
  };

  return (
    <BoardSearchProvider>
      <div className="space-y-12">
        {nu7 && (
          <div className="relative z-10 -mb-4">
            <Nu7Strip initial={nu7} />
          </div>
        )}
        {network === "mainnet" && (
          <section aria-labelledby="where-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <h2 id="where-title" className="text-lg font-semibold tracking-tight">
              Where can I get shielded ZEC?
            </h2>
            <div className="mt-3 max-w-[68ch] space-y-3 text-sm leading-6 text-muted">
              {where.verified.length === 0 ? (
                <p>No service on this board has a verified shielded withdrawal. We have not checked a shielded payment from any exchange or wallet.</p>
              ) : (
                <p>
                  Shielded withdrawals we have checked on-chain:{" "}
                  {where.verified.map((s, i) => (
                    <span key={s.slug}>
                      {i > 0 ? ", " : ""}
                      <Link href={`${base}/services/${s.slug}`} className="font-medium text-foreground underline underline-offset-4">
                        {s.name}
                      </Link>
                      {s.current ? "" : " (an older shielded pool, not the current one)"}
                    </span>
                  ))}
                  .
                </p>
              )}
              {where.listed.length > 0 && (
                <div>
                  <p>ZecHub lists these as allowing a shielded withdrawal. CanIShield has not tested them, so this is not a verification:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {where.listed.map((s) => (
                      <li key={s.slug}>
                        <Link href={`${base}/services/${s.slug}`} className="font-medium text-foreground underline underline-offset-4">
                          {s.name}
                        </Link>
                        {s.kind === "unified"
                          ? " is listed as accepting shielded and unified withdrawals."
                          : " is listed as allowing shielded z-address deposits and withdrawals. The pool is not stated."}
                        {s.readAt ? ` Listing read ${shortDate(s.readAt, now)}.` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p>
                <span className="font-medium text-foreground">A way that still works:</span> withdraw to a normal transparent address (a t-address), then shield the coins in a wallet such as {walletLink("zodl", "Zodl")} or {walletLink("zingo", "Zingo")}. That second step is in your own wallet. It does not mean the exchange sent shielded ZEC.
              </p>
            </div>
          </section>
        )}
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
                We show how each answer was checked. An on-chain result includes a transaction id and a viewing key. A form check is a
                screenshot. Anything we have not tested is labelled as someone else&apos;s claim.
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
            <div className="space-y-2">
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
              {network === "mainnet" && <LivePausedLink />}
            </div>
          </div>
          <LatestEvidence piece={latest} onchain={latestOnchain} rejected={rejectedForTrace} base={base} now={now} />
        </section>

        <ReadinessBar counts={counts} total={total} tested={tested.length} />

        <TestedMatrix rows={tested} showDeposit={depositsEnabled(network) || deposits.size > 0} />

        <LatestOutcomes rows={latestOutcomes} reportOpen={outcomeReportsEnabled()} />

        <UntestedList
          rows={inactiveLast(untested)}
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
