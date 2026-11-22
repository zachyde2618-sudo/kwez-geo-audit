import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kwez GEO Audit",
  description: "How visible is your business to AI assistants? A GEO audit by Kwez.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="inline-grid place-items-center size-7 rounded-lg bg-accent text-white text-sm font-bold">K</span>
              <span>Kwez <span className="text-ink-soft font-normal">GEO Audit</span></span>
            </Link>
            <nav className="flex gap-5 text-sm text-ink-soft">
              <Link href="/" className="hover:text-ink">New audit</Link>
              <Link href="/audits" className="hover:text-ink">Past audits</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="no-print border-t border-line text-xs text-ink-soft">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">Kwez GEO Audit · Generative Engine Optimisation for UK businesses</div>
        </footer>
      </body>
    </html>
  );
}
