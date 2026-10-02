// QR code drawn on the server from uqr's module matrix: crisp, no client JS.
// Always dark modules on a white quiet zone, so phone cameras read it in dark mode too.
import { encode } from "uqr";

export function QrCode({ value, label, size = 184 }: { value: string; label: string; size?: number }) {
  const { data, size: n } = encode(value, { ecc: "M", border: 0 });
  const quiet = 4;
  const total = n + quiet * 2;
  let path = "";
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#18181b" />
    </svg>
  );
}
