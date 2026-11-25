import type { ReactNode } from "react";

/**
 * Shared layout for the privacy policy, terms of use and disclaimer.
 * Text in [square brackets] is a placeholder for Kwez to fill in.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="legal mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-ink-soft">Last updated {updated}</p>
      <div role="note" className="mt-6 rounded-card border border-line bg-paper-3 p-4 text-sm">
        <p className="font-semibold">Draft template</p>
        <p className="mt-1 text-ink-soft">
          This page is a starting point written for Kwez, not legal advice. Text in [square brackets] still needs filling in, and a
          UK solicitor should review it before the app is offered to clients or the public.
        </p>
      </div>
      <div className="mt-8 space-y-4 leading-relaxed">{children}</div>
    </article>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-lg font-bold tracking-tight">{children}</h2>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-6">{children}</ul>;
}
