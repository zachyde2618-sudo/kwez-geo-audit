"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auditedOn } from "@/lib/format";
import type { AuditSummary } from "@/lib/schemas/audit";
import { EyeLoader } from "./Brand";
import { ScoreGauge } from "./ScoreGauge";
import { useHydrated } from "./useHydrated";


const STATUS: Record<string, string> = { queued: "Queued", running: "Running…", cancelled: "Cancelled", error: "Didn't finish" };

export function PastAudits({ initial }: { initial: AuditSummary[] }) {
  const router = useRouter();
  const ready = useHydrated();
  const [audits, setAudits] = useState(initial);
  const [filter, setFilter] = useState<"all" | "favourites">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const favCount = audits.filter((a) => a.favourite).length;
  const shown = filter === "favourites" ? audits.filter((a) => a.favourite) : audits;

  async function toggleFavourite(a: AuditSummary) {
    const favourite = !a.favourite;
    setAudits((xs) => xs.map((x) => (x.id === a.id ? { ...x, favourite } : x)));
    const res = await fetch(`/api/audits/${a.id}`, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favourite }) }).catch(() => null);
    if (!res?.ok) {
      setAudits((xs) => xs.map((x) => (x.id === a.id ? { ...x, favourite: !favourite } : x)));
      setError("Couldn't save that favourite. Check the app is running and try again.");
    }
  }

  async function remove(a: AuditSummary) {
    setBusy(a.id);
    setError("");
    const res = await fetch(`/api/audits/${a.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    setConfirming(null);
    if (res?.ok || res?.status === 404) setAudits((xs) => xs.filter((x) => x.id !== a.id));
    else setError("Couldn't delete that audit. Try again.");
  }

  async function rerun(a: AuditSummary) {
    setBusy(a.id);
    setError("");
    const res = await fetch(`/api/audits/${a.id}/rerun`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.id) router.push(`/audits/${data.id}`);
    else {
      setBusy(null);
      setError(data.error ?? "Couldn't start the audit again. Try again.");
    }
  }

  return (
    <>
      <div className="mt-6 flex items-center gap-2" role="tablist" aria-label="Show">
        {(
          [
            ["all", `All (${audits.length})`],
            ["favourites", `★ Favourites (${favCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === key ? "bg-ink text-paper" : "text-ink-soft hover:bg-accent-soft hover:text-accent-strong"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-input bg-fail-soft px-4 py-2.5 text-sm text-fail">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {filter === "favourites" ? "No favourites yet. Click the star next to an audit to keep it here." : "No audits left."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-card">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 sm:px-4 py-3">
              <button
                onClick={() => toggleFavourite(a)}
                disabled={!ready}
                aria-pressed={a.favourite}
                aria-label={`${a.favourite ? "Remove" : "Add"} ${a.companyName || a.domain} ${a.favourite ? "from" : "to"} favourites`}
                title={a.favourite ? "Remove from favourites" : "Add to favourites"}
                className={`grid size-9 shrink-0 place-items-center rounded-full text-xl leading-none hover:bg-accent-soft ${a.favourite ? "text-brand" : "text-muted hover:text-brand"}`}
              >
                {a.favourite ? "★" : "☆"}
              </button>
              <Link href={`/audits/${a.id}`} className="flex min-w-0 flex-1 items-center gap-4 rounded-input px-2 py-1 hover:bg-paper/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.companyName || a.domain}</span>
                  <span className="block break-words text-xs text-ink-soft">
                    {a.domain}
                    <br />
                    <time dateTime={a.createdAt}>Audited {auditedOn(a.createdAt)}</time>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-right">
                  <span className="hidden text-xs text-ink-soft sm:block">{a.status === "complete" ? `${a.coveragePct}% of checks assessed` : STATUS[a.status] ?? a.status}</span>
                  {a.status === "complete" ? (
                    <ScoreGauge score={a.overall ?? null} mini label={`Score for ${a.companyName || a.domain}`} />
                  ) : (
                    <span className="text-xs text-ink-soft sm:hidden">{STATUS[a.status] ?? a.status}</span>
                  )}
                </span>
              </Link>
              {confirming === a.id ? (
                <span className="flex shrink-0 items-center gap-1.5 text-sm">
                  <span className="hidden sm:inline text-ink-soft">Delete?</span>
                  <button onClick={() => remove(a)} disabled={busy === a.id} className="min-h-9 whitespace-nowrap rounded-input bg-fail px-3 py-1.5 font-semibold text-accent-ink">
                    {busy === a.id ? "Deleting…" : "Delete"}
                  </button>
                  <button onClick={() => setConfirming(null)} className="rounded-input px-2 py-1.5 text-ink-soft hover:text-ink">
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => rerun(a)}
                    disabled={!ready || busy === a.id}
                    title="Start a new audit with the same details"
                    className="inline-flex items-center gap-1.5 rounded-input border border-line px-2.5 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-60"
                  >
                    {busy === a.id ? <EyeLoader size={16} label={null} /> : <span aria-hidden>↻</span>}
                    <span className="hidden sm:inline">Run again</span>
                    <span className="sr-only sm:hidden">Run again</span>
                  </button>
                  <button
                    onClick={() => setConfirming(a.id)}
                    disabled={!ready}
                    aria-label={`Delete the audit of ${a.companyName || a.domain} from ${auditedOn(a.createdAt)}`}
                    title="Delete"
                    className="grid size-9 place-items-center rounded-input text-ink-soft hover:bg-fail-soft hover:text-fail"
                  >
                    <svg aria-hidden viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 9v5M11.5 9v5" />
                    </svg>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
