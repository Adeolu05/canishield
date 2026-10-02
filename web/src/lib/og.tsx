// Link-preview images (1200×630). Satori supports flexbox only.
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const TONE_HEX: Record<string, string> = {
  ok: "#4ade80",
  shield: "#93c5fd",
  warn: "#fdba74",
  bad: "#fda4af",
  info: "#a5b4fc",
  listed: "#a1a1aa",
  neutral: "#a1a1aa",
};

function Mark() {
  return (
    <svg width="56" height="56" viewBox="0 0 32 32">
      <path d="M16 2.5 4.5 6.8v8.4c0 7.2 4.8 12.6 11.5 14.3 6.7-1.7 11.5-7.1 11.5-14.3V6.8L16 2.5Z" fill="#F4B728" />
      <path d="M10.5 11.5h11l-9.3 9h9.3" fill="none" stroke="#18181B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ogImage({
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
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#0b0b0c",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            Zec<span style={{ color: "#F4B728" }}>Proof</span>
          </div>
          {network === "testnet" && (
            <div style={{ display: "flex", marginLeft: 12, padding: "6px 14px", borderRadius: 10, background: "#33280b", color: "#fcd34d", fontSize: 22 }}>
              Testnet
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 24, color: "#F4B728", letterSpacing: 3, textTransform: "uppercase" }}>{eyebrow}</div>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", fontSize: 32, color: l.tone ? TONE_HEX[l.tone] : "#a1a1aa" }}>
                {l.text}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#9a9aa3" }}>
          On-chain evidence of shielded Zcash support · txids and viewing keys anyone can re-check
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
