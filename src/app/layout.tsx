import type { Metadata } from "next";
import { Bitter, Geist, Geist_Mono } from "next/font/google";
import { BrandLogo, EyeMark } from "@/components/Brand";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Slab serif close to the Kwez wordmark, for headings. */
const bitter = Bitter({ variable: "--font-bitter", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Kwez GEO Audit",
  description: "How visible is your business to AI assistants? A GEO audit by Kwez.",
  icons: { icon: "/brand/eye-96.png", apple: "/brand/eye-192.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} ${bitter.variable} h-full antialiased`} suppressHydrationWarning>
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
            <EyeMark size={24} />
            <p className="leading-snug">
              <span className="font-semibold text-ink">Kwez</span> GEO Audit
              <br />
              Generative Engine Optimisation for UK businesses
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
