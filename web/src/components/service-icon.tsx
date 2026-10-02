// A service's logo, from our own origin (web/public/service-icons, listed in
// service-icons.json by `npm run fetch:icons -w @zecproof/db`). Without one, a
// monogram of the same size, so rows never shift. Decorative: the name is
// always printed next to it.
import Image from "next/image";
import manifest from "@/lib/service-icons.json";

const ICONS: Record<string, string> = manifest;

export const serviceIconSrc = (slug: string): string | undefined => ICONS[slug];

export function ServiceIcon({ slug, name, size = 20, className = "" }: { slug: string; name: string; size?: number; className?: string }) {
  const src = ICONS[slug];
  const box = `inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%] border border-line ${className}`;
  if (src) {
    return (
      // Logos are drawn for light backgrounds, so they sit on white in both themes.
      <span aria-hidden="true" className={`${box} bg-white`} style={{ width: size, height: size }}>
        <Image src={src} alt="" width={size} height={size} unoptimized className="size-full object-contain" />
      </span>
    );
  }
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`${box} bg-surface-2 font-semibold leading-none text-muted`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {letter}
    </span>
  );
}
