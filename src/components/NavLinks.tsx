"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/#how", label: "How it works", current: () => false, hideOnPhone: true },
  { href: "/audits", label: "Past audits", current: (p: string) => p.startsWith("/audits"), hideOnPhone: false },
];

/** Site menu: two links and the one filled button that opens the tool. The current page is marked. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  const onNew = path === "/audit";
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold">
      {LINKS.map((l) => {
        const on = l.current(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`${l.hideOnPhone ? "hidden sm:inline-block" : ""} whitespace-nowrap rounded-full px-3 py-2 ${on ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-paper-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
      <Link
        href="/audit"
        aria-current={onNew ? "page" : undefined}
        className={`btn ml-1 inline-flex min-h-10 items-center whitespace-nowrap rounded-input px-4 py-2 ${onNew ? "bg-accent-soft text-accent-strong" : "bg-accent text-accent-ink hover:bg-accent-strong"}`}
      >
        New audit
      </Link>
    </nav>
  );
}
