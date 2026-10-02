"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./logo";
import { ScannerPill } from "./scanner-pill";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";

// Board stays highlighted on mainnet service pages, Testnet on testnet ones.
const NAV = [
  { href: "/", label: "Board", match: (p: string) => p === "/" || p.startsWith("/services/") },
  { href: "/testnet", label: "Testnet", match: (p: string) => p.startsWith("/testnet") },
  { href: "/api/results.json", label: "API", match: () => false },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <Link href="/" aria-label="ZecProof home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm max-sm:[&>a:last-child]:hidden">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? (pathname === item.href ? "page" : "true") : undefined}
                className={`relative rounded-md px-2 py-1 transition-colors duration-150 ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
                {active && <span aria-hidden="true" className="absolute inset-x-2 -bottom-[15px] h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ScannerPill />
          <CommandPalette />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
