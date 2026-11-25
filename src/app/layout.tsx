import type { Metadata } from "next";
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
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
            <BrandLogo />
            <NavLinks />
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="no-print border-t border-line text-sm text-ink-soft">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-6 sm:px-6">
            <EyeMark size={40} />
            <Wordmark />
            <p className="ml-auto hidden text-right leading-snug sm:block">
              GEO Audit
              <br />
              For UK businesses
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
