"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuditRecord } from "@/lib/schemas/audit";
import { EvidenceReport } from "./EvidenceReport";

const ACTIVE = new Set(["queued", "running"]);

export function AuditView({ id, initial }: { id: string; initial: AuditRecord }) {
  const [audit, setAudit] = useState(initial);
  const [cancelling, setCancelling] = useState(false);
  const [pollError, setPollError] = useState(false);

  useEffect(() => {
    if (!ACTIVE.has(audit.status)) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/audits/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        setAudit(await res.json());
        setPollError(false);
      } catch {
        setPollError(true);
        setAudit((a) => ({ ...a })); // re-arm the timer
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [audit, id]);

  async function cancel() {
    setCancelling(true);
    await fetch(`/api/audits/${id}/cancel`, { method: "POST" }).catch(() => {});
  }

  if (ACTIVE.has(audit.status)) return <Progress audit={audit} onCancel={cancel} cancelling={cancelling} pollError={pollError} />;
  if (audit.status !== "complete") return <Ended audit={audit} />;
  return <Results audit={audit} />;
}

function Progress({ audit, onCancel, cancelling, pollError }: { audit: AuditRecord; onCancel: () => void; cancelling: boolean; pollError: boolean }) {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [audit.progress.length]);
  const latest = audit.progress.at(-1)?.message ?? "Starting…";
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-14">
      <p className="text-sm font-medium text-accent">Auditing {audit.domain}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight flex items-center gap-3">
        <span className="size-3 rounded-full bg-accent animate-pulse" aria-hidden />
        <span aria-live="polite">{latest}</span>
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        {audit.results.length} of 72 checks done. You can leave this page and come back; the audit keeps running.
        {pollError && <span className="text-partial"> Lost contact with the server, retrying…</span>}
      </p>
      <div className="mt-4 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(audit.results.length / 72) * 100}%` }} />
      </div>
      <ol ref={logRef} className="mt-6 max-h-80 overflow-y-auto rounded-2xl border border-line bg-card p-4 font-mono text-xs space-y-1.5">
        {audit.progress.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-ink-soft">{new Date(p.at).toLocaleTimeString("en-GB")}</span>
            <span>{p.message}</span>
          </li>
        ))}
      </ol>
      <button onClick={onCancel} disabled={cancelling} className="mt-6 rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-medium hover:border-fail hover:text-fail disabled:opacity-60">
        {cancelling ? "Cancelling…" : "Cancel audit"}
      </button>
    </div>
  );
}

function Ended({ audit }: { audit: AuditRecord }) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">{audit.status === "cancelled" ? "Audit cancelled" : "The audit didn't finish"}</h1>
      <p className="mt-2 text-ink-soft">{audit.error ?? `The audit of ${audit.domain} was stopped before it finished.`}</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-white">Start a new audit</Link>
    </div>
  );
}

function Results({ audit }: { audit: AuditRecord }) {
  const s = audit.score!;
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
      <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <p className="text-sm text-ink-soft">
          {audit.domain} · {new Date(audit.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          GEO Visibility Score: {s.overall ?? "—"}
          <span className="text-ink-soft font-normal"> / 100</span>
        </h1>
        <p className="mt-1 text-ink-soft">
          {s.band ?? "Not scored"} · based on {s.coveragePct}% of checks
        </p>
        {s.provisional && (
          <p className="mt-4 rounded-xl bg-partial-soft px-4 py-3 text-sm text-partial">
            This score is provisional: only {s.coveragePct}% of checks could be assessed. Add API keys or more company details and re-run for a fuller picture.
          </p>
        )}
      </section>
      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-4">Full evidence report</h2>
        <EvidenceReport results={audit.results} score={s} />
      </section>
    </div>
  );
}
