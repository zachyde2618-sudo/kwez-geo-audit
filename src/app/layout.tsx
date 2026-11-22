import type { Metadata } from "next";
import Link from "next/link";
import { Bitter, Geist, Geist_Mono } from "next/font/google";
import { BrandLogo, EyeMark } from "@/components/Brand";
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
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} ${bitter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
            <BrandLogo />
            <nav className="flex gap-1 text-sm font-medium text-ink-soft">
              <Link href="/" className="rounded-full px-3 py-1.5 hover:bg-accent-soft hover:text-accent-strong">New audit</Link>
              <Link href="/audits" className="rounded-full px-3 py-1.5 hover:bg-accent-soft hover:text-accent-strong">Past audits</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="no-print border-t border-line text-xs text-ink-soft">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 flex items-center gap-3">
            <EyeMark size={22} />
            <span>
              <span className="font-semibold text-ink">Kwez</span> GEO Audit · Generative Engine Optimisation for UK businesses
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
