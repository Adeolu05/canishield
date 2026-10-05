import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { InlineScript } from "@/components/inline-script";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import { SITE_URL } from "@/lib/site";
import { canCreateTests } from "@/lib/network";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ZecProof · Can I send shielded ZEC to…?", template: "%s · ZecProof" },
  description:
    "On-chain evidence of which exchanges, wallets and services actually support shielded Zcash (Ironwood), with txids and viewing keys anyone can re-check.",
  openGraph: { siteName: "ZecProof", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before first paint (no flash). */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-btn px-4 py-2 text-sm text-btn-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <SiteHeader mainnetTests={canCreateTests("mainnet")} />
        {/* Full-bleed backgrounds inside main use 100vw; clip them here (not on body,
            which would hand the overflow to the viewport) so nothing scrolls sideways. */}
        <div className="flex-1 overflow-x-clip">
          <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
            {children}
          </main>
        </div>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-7xl space-y-2 px-4 py-6 text-xs text-subtle sm:px-6">
            <p>
              ZecProof results (verified tests and community reports) are licensed{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/" className="underline underline-offset-2 hover:text-foreground" rel="license noreferrer" target="_blank">
                CC BY 4.0
              </a>
              .
            </p>
            <p>
              Unverified listings are adapted from the ZecHub Wiki (ZecHub contributors) and stay under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline underline-offset-2 hover:text-foreground" rel="license noreferrer" target="_blank">
                CC BY-SA 4.0
              </a>
              . ZecProof&apos;s code is MIT.
            </p>
            <p>
              Wallet and exchange claims marked &ldquo;per community research (orb)&rdquo;:{" "}
              <a href="https://x.com/ArtofOrb" className="underline underline-offset-2 hover:text-foreground" rel="noreferrer" target="_blank">
                Community research by orb
              </a>{" "}
              ·{" "}
              <a href="https://zec-os.com" className="underline underline-offset-2 hover:text-foreground" rel="noreferrer" target="_blank">
                zec-os.com
              </a>
              . Read from official pages; not tested by ZecProof.
            </p>
            <p>ZecProof is independent and not affiliated with the services listed. Names and logos belong to their owners.</p>
            <p>
              Built by David Peluola ·{" "}
              <a href="https://x.com/0xdavee_" className="underline underline-offset-2 hover:text-foreground" rel="me noreferrer" target="_blank">
                X @0xdavee_
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
