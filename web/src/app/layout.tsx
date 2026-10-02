import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { InlineScript } from "@/components/inline-script";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.ZECPROOF_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ZecProof — Can I send shielded ZEC to…?", template: "%s · ZecProof" },
  description:
    "On-chain evidence of which exchanges, wallets and services actually support shielded Zcash (Ironwood) — with txids and viewing keys anyone can re-check.",
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
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs text-subtle sm:px-6">
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
          </div>
        </footer>
      </body>
    </html>
  );
}
