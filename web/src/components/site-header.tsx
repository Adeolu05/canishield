"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/", label: "Board", match: (p: string) => !p.startsWith("/testnet") && !p.startsWith("/test") },
  { href: "/testnet", label: "Testnet", match: (p: string) => p.startsWith("/testnet") },
  { href: "/api/results.json", label: "API", match: () => false },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="ZecProof home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-2.5 py-1.5 transition-colors ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
                {active && <span aria-hidden="true" className="absolute inset-x-2.5 -bottom-[13px] h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
