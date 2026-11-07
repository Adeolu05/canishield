// Link-preview images (1200×630), in the site's own look: dark surfaces, Geist,
// the gold mark. Satori supports flexbox only; every multi-child div needs display:flex.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import icons from "./service-icons.json";
import { BRAND, MARK_CHECK, MARK_SHIELD } from "./brand";

export const OG_SIZE = { width: 1200, height: 630 };

// Dark-theme tokens from src/app/globals.css.
const C = {
  bg: "#0b0b0c",
  surface: "#131315",
  line: "#27272a",
  fg: "#f4f4f5",
  muted: "#a1a1aa",
  subtle: "#9a9aa3",
  accent: "#F4B728",
};

const TONE_HEX: Record<string, string> = {
  ok: "#4ade80",
  shield: "#93c5fd",
  warn: "#fdba74",
  bad: "#fda4af",
  info: "#a5b4fc",
  listed: "#a1a1aa",
  neutral: "#a1a1aa",
};

type Font = { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" };
let fonts: Promise<Font[]> | undefined;
/** Geist from assets/fonts (traced into these functions by next.config). A failed read falls back to the default font. */
async function loadFonts(): Promise<Font[]> {
  const dir = join(process.cwd(), "assets", "fonts");
  fonts ??= Promise.all([
    readFile(join(dir, "Geist-Regular.ttf")).then((data): Font => ({ name: "Geist", data, weight: 400, style: "normal" })),
    readFile(join(dir, "Geist-Medium.ttf")).then((data): Font => ({ name: "Geist", data, weight: 500, style: "normal" })),
    readFile(join(dir, "Geist-SemiBold.ttf")).then((data): Font => ({ name: "Geist", data, weight: 600, style: "normal" })),
    readFile(join(dir, "GeistMono-Medium.ttf")).then((data): Font => ({ name: "Geist Mono", data, weight: 500, style: "normal" })),
  ]).catch(() => {
    fonts = undefined;
    return [];
  });
  return fonts;
}

const ICONS: Record<string, string> = icons;
/** A service's logo as a data URL, read from public/service-icons; undefined when it has none. */
async function iconDataUrl(slug: string): Promise<string | undefined> {
  const src = ICONS[slug];
  if (!src) return undefined;
  try {
    const bytes = await readFile(join(process.cwd(), "public", src));
    return `data:${src.endsWith(".svg") ? "image/svg+xml" : "image/png"};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Long details are cut at a word boundary so a card never overflows. */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, s.lastIndexOf(" ", max - 1)).replace(/[;,:\s]+$/, "")}…`);

function Mark() {
  return (
    <svg width="48" height="48" viewBox="0 0 32 32">
      <path d={MARK_SHIELD} fill={C.accent} />
      <path d={MARK_CHECK} fill="none" stroke="#18181B" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Frame({ network, children }: { network: "mainnet" | "testnet"; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: C.bg,
        color: C.fg,
        fontFamily: "Geist, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, letterSpacing: -0.6 }}>
            {/* Display name in link previews; Satori needs explicit spacing between spans. */}
            <span>Can I</span>
            <span style={{ color: C.accent, marginLeft: 9 }}>Shield?</span>
          </div>
          {network === "testnet" && (
            <div style={{ display: "flex", marginLeft: 8, padding: "5px 14px", borderRadius: 10, background: "#33280b", color: "#fcd34d", fontSize: 22 }}>
              Testnet
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 20, color: C.subtle }}>{BRAND.url.replace("https://", "")}</div>
      </div>
      {children}
      <div style={{ display: "flex", fontSize: 22, color: C.subtle }}>{BRAND.description}</div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 20, fontWeight: 500, color: C.accent, letterSpacing: 3, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

/** The board's card: a headline and a few short lines. */
export async function ogImage({
  eyebrow,
  title,
  lines,
  network,
}: {
  eyebrow: string;
  title: string;
  lines: { text: string; tone?: string }[];
  network: "mainnet" | "testnet";
}) {
  return new ImageResponse(
    (
      <Frame network={network}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.8 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", fontSize: 30, color: l.tone ? TONE_HEX[l.tone] : C.muted }}>
                {l.text}
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

export interface EvidenceRow {
  label: string;
  status: string;
  tone: string;
  detail?: string;
}

/** A service's card: its logo and name, then one panel per kind of evidence, like the service page. */
export async function serviceCard({
  network,
  slug,
  kind,
  name,
  rows,
}: {
  network: "mainnet" | "testnet";
  slug: string;
  kind: string;
  name: string;
  rows: EvidenceRow[];
}) {
  const [icon, loaded] = await Promise.all([iconDataUrl(slug), loadFonts()]);
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return new ImageResponse(
    (
      <Frame network={network}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {icon ? (
              // Logos are drawn for light backgrounds, so they sit on white, as on the site.
              <div style={{ display: "flex", width: 84, height: 84, borderRadius: 19, background: "#ffffff", border: `1px solid ${C.line}`, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders <img>, not next/image */}
                <img src={icon} width={84} height={84} alt="" style={{ objectFit: "contain" }} />
              </div>
            ) : (
              <div style={{ display: "flex", width: 84, height: 84, borderRadius: 19, background: "#1b1b1e", border: `1px solid ${C.line}`, alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 600, color: C.muted }}>
                {letter}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Eyebrow>{kind}</Eyebrow>
              <div style={{ display: "flex", fontSize: 62, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.6 }}>{clip(name, 28)}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", padding: "18px 26px", borderRadius: 18, background: C.surface, border: `1px solid ${C.line}` }}
              >
                <div style={{ display: "flex", width: 250, fontFamily: "Geist Mono, monospace", fontSize: 17, fontWeight: 500, color: C.subtle, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {r.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 29, fontWeight: 600, color: TONE_HEX[r.tone] ?? C.fg }}>{r.status}</div>
                  {r.detail && <div style={{ display: "flex", fontSize: 21, color: C.muted }}>{clip(r.detail, 64)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: loaded },
  );
}
