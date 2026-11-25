"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "New audit", current: (p: string) => p === "/" },
  { href: "/audits", label: "Past audits", current: (p: string) => p.startsWith("/audits") },
];

/** The two destinations. The current one is marked for screen readers and drawn in the accent. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="flex gap-1 text-sm font-semibold">
      {LINKS.map((l) => {
        const on = l.current(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-2 ${on ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-paper-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
