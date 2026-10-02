// Proof trace: service → address type → pool lane, drawn once on load.
// Pure SVG + CSS (globals.css: .zp-draw / .zp-pop / .zp-fade); with reduced
// motion it renders the final state. The whole trace has a text description.
import type { AddressType, Pool } from "@zecproof/db";
import { ADDRESS_TYPE_LABEL, POOL_LABEL } from "@/lib/labels";
import { OUTCOME_VISUAL, type Tone } from "@/lib/present";

const TONE_VAR: Record<Tone, string> = {
  ok: "var(--ok-fg)",
  shield: "var(--shield-fg)",
  warn: "var(--warn-fg)",
  bad: "var(--bad-fg)",
  info: "var(--info-fg)",
  listed: "var(--listed-fg)",
  neutral: "var(--subtle)",
};

/** Lanes top to bottom: shielded first. Address-type rows line up with them. */
const LANES: { pool: Pool; y: number }[] = [
  { pool: "ironwood", y: 38 },
  { pool: "sapling", y: 82 },
  { pool: "transparent", y: 126 },
];
const TYPE_Y: Record<AddressType, number> = { ironwood_ua: 38, full_ua: 82, transparent: 126 };
const SHORT_TYPE: Record<AddressType, string> = { ironwood_ua: "Ironwood UA", full_ua: "Full UA", transparent: "t-address" };

const SERVICE = { x: 14, y: 82 };
const TYPE_X = 134;
const LANE_X0 = 222;
const LANE_X1 = 316;

const curve = (x0: number, y0: number, x1: number, y1: number) => {
  const mid = (x0 + x1) / 2;
  return `C ${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
};

export interface TraceInput {
  serviceName: string;
  proof: { addressType: AddressType; pool: Pool };
  rejected: AddressType[];
}

const SPOKEN_TYPE: Record<AddressType, string> = { ...ADDRESS_TYPE_LABEL, transparent: "t-address" };

/** Plain-language version of the whole trace, in the order it is drawn (top to bottom). */
export function describeTrace({ serviceName, proof, rejected }: TraceInput) {
  const parts = [...rejected].sort((a, b) => TYPE_Y[a] - TYPE_Y[b]).map((t) => `${SPOKEN_TYPE[t]} rejected`);
  parts.push(`${SPOKEN_TYPE[proof.addressType]} paid, landed in the ${POOL_LABEL[proof.pool]} pool`);
  return `${serviceName}: ${parts.join("; ")}.`;
}

export function ProofTrace(input: TraceInput) {
  const { serviceName, proof, rejected } = input;
  const tone = TONE_VAR[OUTCOME_VISUAL[proof.pool].tone];
  const bad = TONE_VAR.bad;
  const yT = TYPE_Y[proof.addressType];
  const yL = LANES.find((l) => l.pool === proof.pool)!.y;
  const name = serviceName.length > 12 ? `${serviceName.slice(0, 11)}…` : serviceName;
  const drawMs = 1100;
  const shown = [...new Set([...rejected, proof.addressType])].sort((a, b) => TYPE_Y[a] - TYPE_Y[b]);

  return (
    <svg viewBox="0 0 320 146" role="img" aria-labelledby="trace-title trace-desc" className="h-auto w-full overflow-visible">
      <title id="trace-title">Proof trace</title>
      <desc id="trace-desc">{describeTrace(input)}</desc>

      {/* Pool lanes. */}
      {LANES.map((l) => {
        const landed = l.pool === proof.pool;
        return (
          <g key={l.pool}>
            {landed && (
              <rect
                x={LANE_X0 - 6}
                y={l.y - 26}
                width={LANE_X1 - LANE_X0 + 10}
                height={36}
                rx={8}
                fill={tone}
                fillOpacity="0.12"
                className="zp-fade"
                style={{ ["--zp-delay" as string]: "1200ms" }}
              />
            )}
            <text
              x={LANE_X0}
              y={l.y - 9}
              fontSize="13"
              fill={landed ? tone : "var(--subtle)"}
              fontWeight={landed ? 600 : 400}
              className="font-sans"
            >
              {POOL_LABEL[l.pool]}
            </text>
            <line x1={LANE_X0} y1={l.y} x2={LANE_X1} y2={l.y} stroke={landed ? tone : "var(--line-strong)"} strokeOpacity={landed ? 0.9 : 0.55} strokeWidth={landed ? 2 : 1.25} strokeDasharray={landed ? undefined : "3 4"} />
          </g>
        );
      })}

      {/* Service node. */}
      <text x={2} y={SERVICE.y - 14} fontSize="13" fontWeight={600} fill="var(--fg)" className="font-sans">
        {name}
      </text>
      <circle cx={SERVICE.x} cy={SERVICE.y} r="5.5" fill="var(--fg)" />

      {/* Address-type nodes and labels. */}
      {shown.map((t) => (
        <g key={t}>
          <text x={TYPE_X} y={TYPE_Y[t] - 10} fontSize="13" textAnchor="middle" fill="var(--muted)" className="font-sans">
            {SHORT_TYPE[t]}
          </text>
          <circle cx={TYPE_X} cy={TYPE_Y[t]} r="4.5" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.75" />
        </g>
      ))}

      {/* Rejected address types: short stubs ending in ✕. */}
      {rejected.map((t, i) => {
        const y = TYPE_Y[t];
        const delay = 120 + i * 140;
        return (
          <g key={`r-${t}`}>
            <path
              d={`M ${SERVICE.x + 5} ${SERVICE.y} ${curve(SERVICE.x + 5, SERVICE.y, TYPE_X - 4, y)} L ${TYPE_X + 22} ${y}`}
              pathLength={1}
              fill="none"
              stroke={bad}
              strokeOpacity="0.8"
              strokeWidth="2"
              strokeLinecap="round"
              className="zp-draw"
              style={{ ["--zp-dur" as string]: "620ms", ["--zp-delay" as string]: `${delay}ms` }}
            />
            <g className="zp-pop" style={{ ["--zp-delay" as string]: `${delay + 600}ms` }} stroke={bad} strokeWidth="2.5" strokeLinecap="round">
              <line x1={TYPE_X + 26} y1={y - 5} x2={TYPE_X + 36} y2={y + 5} />
              <line x1={TYPE_X + 36} y1={y - 5} x2={TYPE_X + 26} y2={y + 5} />
            </g>
          </g>
        );
      })}

      {/* The proof: service → address type → the pool it really landed in. */}
      <path
        d={`M ${SERVICE.x + 5} ${SERVICE.y} ${curve(SERVICE.x + 5, SERVICE.y, TYPE_X - 4, yT)} L ${TYPE_X + 4} ${yT} ${curve(TYPE_X + 4, yT, LANE_X0, yL)} L ${LANE_X1 - 8} ${yL}`}
        pathLength={1}
        fill="none"
        stroke={tone}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="zp-draw"
        style={{ ["--zp-dur" as string]: `${drawMs}ms`, ["--zp-delay" as string]: "200ms" }}
      />
      <circle
        cx={LANE_X1 - 8}
        cy={yL}
        r="6.5"
        fill={tone}
        className="zp-pop"
        style={{ ["--zp-delay" as string]: `${200 + drawMs - 60}ms` }}
      />
    </svg>
  );
}
