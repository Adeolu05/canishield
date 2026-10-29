// Live NU7 share cards (PNG), drawn from the same snapshot as the page.
// Satori: flexbox and absolute positioning only, every multi-child div needs display:flex.
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MARK_CHECK, MARK_SHIELD } from "./brand";
import { NU7_HEIGHT, NU7_PLANNED_DATE, formatRemaining, nu7State } from "./nu7";
import type { Nu7Snapshot } from "./nu7-data";

export const CARD_FORMATS = {
  wide: { width: 1200, height: 630, label: "Wide", use: "X, LinkedIn, Facebook" },
  square: { width: 1080, height: 1080, label: "Square", use: "Instagram feed" },
  story: { width: 1080, height: 1920, label: "Story", use: "Instagram, WhatsApp status, TikTok" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export const isCardFormat = (f: string | null): f is CardFormat => !!f && f in CARD_FORMATS;

const BG = "#0b0a08";
const GOLD = "#f4b728";
const INK = "#f3eee3";
const DIM = "#8f877a";
const LINE = "#2a2620";

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 400; style: "normal" | "italic" }[]> | undefined;
function loadFonts() {
  const dir = join(process.cwd(), "assets", "fonts");
  fonts ??= Promise.all([
    readFile(join(dir, "InterTight-Bold.ttf")).then((data) => ({ name: "Inter Tight", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "InterTight-Medium.ttf")).then((data) => ({ name: "Inter Tight", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(dir, "InstrumentSerif-Italic.ttf")).then((data) => ({ name: "Serif", data, weight: 400 as const, style: "italic" as const })),
    readFile(join(dir, "JetBrainsMono-Medium.ttf")).then((data) => ({ name: "Mono", data, weight: 500 as const, style: "normal" as const })),
  ]);
  return fonts;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const UTC_ETA = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d={MARK_SHIELD} fill="#F4B728" />
      <path d={MARK_CHECK} fill="none" stroke="#18181B" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Blocks every 75 px before the gold line, every 25 px after: the NU7 change, to scale. */
function Rail({ width, live }: { width: number; live: boolean }) {
  const act = Math.round(width * (live ? 0.3 : 0.58));
  const before: number[] = [];
  for (let x = act - 54; x > 0; x -= 75) before.push(x);
  const after: number[] = [];
  for (let x = act + 20; x < width - 10; x += 25) after.push(x);
  return (
    <div style={{ display: "flex", position: "relative", width, height: 70 }}>
      <div style={{ position: "absolute", left: 0, top: 34, width, height: 2, background: LINE }} />
      {before.map((x) => (
        <div key={`b${x}`} style={{ position: "absolute", left: x - 11, top: 24, width: 22, height: 22, borderRadius: 5, border: "2px solid #4a4438", background: "#15130f" }} />
      ))}
      {after.map((x, i) => (
        <div
          key={`a${x}`}
          style={{ position: "absolute", left: x - 7, top: 28, width: 14, height: 14, borderRadius: 4, border: `2px solid ${GOLD}`, background: "rgba(244,183,40,0.2)", opacity: Math.max(0.3, 1 - i * 0.03) }}
        />
      ))}
      <div style={{ position: "absolute", left: act - 1, top: 0, width: 3, height: 70, background: GOLD, borderRadius: 2, boxShadow: "0 0 24px 4px rgba(244,183,40,0.5)" }} />
    </div>
  );
}

const TODO_BEFORE = [
  ["Wallet apps", "update yours"],
  ["Old Sprout funds", "move them out"],
  ["Exchanges", "check they pay shielded"],
  ["Nodes", "Zebra 7.0.0"],
];
const TODO_AFTER = [
  ["Wallet apps", "run the NU7 version"],
  ["Sprout", "frozen now"],
  ["Exchanges", "check they pay shielded"],
  ["Nodes", "Zebra 7.0.0 or later"],
];

export async function nu7Card(format: CardFormat, snap: Nu7Snapshot, now = Date.now()) {
  const { width, height } = CARD_FORMATS[format];
  const wide = format === "wide";
  const story = format === "story";
  const pad = wide ? 56 : story ? 90 : 80;
  const state = nu7State(snap.tip, null, NU7_HEIGHT, snap.spacingS);
  const upcoming = state.phase === "upcoming";
  const live = state.phase === "live";
  const remaining = upcoming && snap.etaMs ? snap.etaMs - now : null;

  const big = upcoming ? fmt(state.blocksLeft) : live ? fmt(NU7_HEIGHT) : fmt(NU7_HEIGHT);
  const bigLabel = upcoming ? (state.blocksLeft === 1 ? "block to go" : "blocks to go") : live ? "activation block" : "activation block";
  const detail = upcoming
    ? remaining !== null && remaining > 0
      ? `About ${formatRemaining(remaining)} · expected ${UTC_ETA.format(snap.etaMs!)} UTC`
      : "Any moment now"
    : live
      ? "Blocks now every 25 seconds"
      : `Planned for around ${NU7_PLANNED_DATE}`;
  const [t1, t2] = live ? ["NU7 is", "live."] : ["Ready for", "NU7?"];
  const scanner = snap.tip ? `Live from our Zcash scanner · block ${fmt(snap.tip)}` : `Activates at block ${fmt(NU7_HEIGHT)}`;
  const glow = `radial-gradient(ellipse ${Math.round(width * 0.6)}px ${Math.round(height * 0.45)}px at 72% ${story ? "40%" : "58%"}, rgba(244,183,40,0.16), rgba(11,10,8,0))`;

  const brand = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: wide ? 26 : 36, fontWeight: 700 }}>
        <Mark size={wide ? 36 : 48} />
        <span>Can I Shield?</span>
      </div>
      {wide && <div style={{ display: "flex", fontFamily: "Mono", fontSize: 19, color: DIM }}>canishield.vercel.app/nu7</div>}
    </div>
  );
  const eyebrow = (size: number) => (
    <div style={{ display: "flex", fontFamily: "Mono", fontSize: size, letterSpacing: 4, color: GOLD }}>ZCASH NETWORK UPGRADE · NU7</div>
  );
  const serif = (size: number) => ({ fontFamily: "Serif", fontStyle: "italic" as const, fontWeight: 400, color: GOLD, fontSize: size, letterSpacing: 0 });
  const number = (size: number, align: "flex-start" | "flex-end", labelSize: number, detailSize: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, gap: 6 }}>
      <div style={{ display: "flex", fontSize: size, fontWeight: 700, color: GOLD, lineHeight: 1, letterSpacing: -size * 0.03 }}>{big}</div>
      <div style={{ display: "flex", fontSize: labelSize, fontWeight: 500 }}>{bigLabel}</div>
      <div style={{ display: "flex", fontSize: detailSize, color: DIM }}>{detail}</div>
    </div>
  );
  const footer = (urlSize: number, lineSize: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", fontFamily: "Mono", fontSize: urlSize, color: INK }}>canishield.vercel.app/nu7</div>
      <div style={{ display: "flex", fontFamily: "Mono", fontSize: lineSize, color: DIM }}>{scanner}</div>
    </div>
  );
  const todo = (title: number, item: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", fontFamily: "Mono", fontSize: title, letterSpacing: 3, color: DIM }}>{live ? "NOW" : "BEFORE IT LANDS"}</div>
      {(live ? TODO_AFTER : TODO_BEFORE).map(([who, what], i) => (
        <div key={who} style={{ display: "flex", alignItems: "baseline", gap: 18, fontSize: item }}>
          <span style={{ fontFamily: "Mono", color: GOLD, fontSize: item * 0.75 }}>{`0${i + 1}`}</span>
          <span style={{ fontWeight: 700 }}>{who}</span>
          <span style={{ color: DIM }}>{what}</span>
        </div>
      ))}
    </div>
  );
  const frame = { width, height, display: "flex", flexDirection: "column" as const, justifyContent: "space-between", padding: pad, background: BG, backgroundImage: glow, color: INK, fontFamily: "Inter Tight" };

  const element = wide ? (
    <div style={frame}>
      {brand}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {eyebrow(17)}
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 700, letterSpacing: -3, lineHeight: 0.95 }}>
            <span>{t1}</span>
            <span style={serif(112)}>{t2}</span>
          </div>
        </div>
        {number(112, "flex-end", 28, 20)}
      </div>
      <Rail width={width - pad * 2} live={live} />
      <div style={{ display: "flex", fontFamily: "Mono", fontSize: 16, color: DIM }}>{scanner}</div>
    </div>
  ) : story ? (
    <div style={frame}>
      {brand}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {eyebrow(26)}
        <div style={{ display: "flex", flexDirection: "column", fontSize: 170, fontWeight: 700, letterSpacing: -6, lineHeight: 0.95 }}>
          <span>{t1}</span>
          <span style={serif(240)}>{t2}</span>
        </div>
      </div>
      {number(250, "flex-start", 48, 32)}
      <Rail width={width - pad * 2} live={live} />
      {todo(24, 40)}
      {footer(34, 22)}
    </div>
  ) : (
    <div style={frame}>
      {brand}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {eyebrow(22)}
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 118, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
          <span>{t1}</span>
          <span style={{ ...serif(138), marginLeft: 26 }}>{t2}</span>
        </div>
      </div>
      {number(190, "flex-start", 40, 28)}
      <Rail width={width - pad * 2} live={live} />
      {footer(30, 20)}
    </div>
  );

  return new ImageResponse(element, {
    width,
    height,
    fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  });
}
