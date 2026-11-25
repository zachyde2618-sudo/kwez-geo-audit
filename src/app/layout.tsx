import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Semi_Condensed, Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { BrandLogo, EyeMark, Wordmark } from "@/components/Brand";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Bold geometric sans for the "kwez" wordmark and headings (brand board, 2026). */
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });
/** Condensed caps for the pink tagline and small labels. */
const barlow = Barlow_Semi_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Kwez GEO Audit",
  description: "How visible is your business to AI assistants? A GEO audit by Kwez.",
  icons: { icon: [{ url: "/brand/kwez-eye.svg", type: "image/svg+xml" }, { url: "/brand/eye-96.png" }], apple: "/brand/eye-192.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${barlow.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Marks that scripts run, so motion that starts hidden (the score dial) is only hidden when it can be shown again. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="visually-hidden focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper">
          Skip to content
        </a>
        <header className="no-print sticky top-0 z-20 border-b border-line bg-paper">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <BrandLogo />
            <NavLinks />
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="no-print border-t border-line bg-paper-3 text-sm text-ink-soft">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
            <div>
              <Link href="/" aria-label="Kwez, home" className="inline-flex items-center gap-2">
                <EyeMark size={52} />
                <Wordmark />
              </Link>
              <p className="mt-4 max-w-[34ch]">Helping UK businesses get found, trusted and recommended by AI assistants.</p>
            </div>
            <nav aria-label="The tool">
              <p className="font-semibold text-ink">The tool</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/audit" className="hover:text-accent">New audit</Link></li>
                <li><Link href="/audits" className="hover:text-accent">Past audits</Link></li>
              </ul>
            </nav>
            <nav aria-label="Learn more">
              <p className="font-semibold text-ink">Learn more</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/#how" className="hover:text-accent">How it works</Link></li>
                <li><Link href="/#checks" className="hover:text-accent">What we check</Link></li>
                <li><Link href="/#faq" className="hover:text-accent">Questions</Link></li>
              </ul>
            </nav>
          </div>
          <div className="border-t border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs sm:px-6">
              <p>&copy; 2026 Kwez. Generative Engine Optimisation for UK businesses.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
