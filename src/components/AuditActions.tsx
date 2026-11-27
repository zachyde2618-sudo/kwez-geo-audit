"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeLoader } from "./Brand";
import { ReportShare, type ReportShareProps } from "./ReportShare";
import { useHydrated } from "./useHydrated";

/** Favourite, run-again, PDF and send buttons on an audit's results page. */
export function AuditActions({ id, favourite: initialFavourite, report }: { id: string; favourite: boolean; report?: Omit<ReportShareProps, "id"> }) {
  const router = useRouter();
  const ready = useHydrated();
  const [favourite, setFavourite] = useState(initialFavourite);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !favourite;
    setFavourite(next);
    const res = await fetch(`/api/audits/${id}`, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favourite: next }) }).catch(() => null);
    if (!res?.ok) {
      setFavourite(!next);
      setError("Couldn't save the favourite.");
    }
  }

  async function rerun() {
    setStarting(true);
    setError("");
    const res = await fetch(`/api/audits/${id}/rerun`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.id) router.push(`/audits/${data.id}`);
    else {
      setStarting(false);
      setError(data.error ?? "Couldn't start the audit again.");
    }
  }

  return (
    <div className="no-print mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
      <button
        onClick={toggle}
        disabled={!ready}
        aria-pressed={favourite}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${favourite ? "border-brand/40 bg-accent-soft text-accent-strong" : "border-line text-ink-soft hover:border-accent hover:text-accent"}`}
      >
        <span aria-hidden className={favourite ? "text-brand" : ""}>{favourite ? "★" : "☆"}</span>
        {favourite ? "Favourite" : "Add to favourites"}
      </button>
      <button
        onClick={rerun}
        disabled={!ready || starting}
        title="Start a new audit with the same details; this one is kept"
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {starting ? <EyeLoader size={16} label={null} /> : <span aria-hidden>↻</span>}
        {starting ? "Starting…" : "Run again"}
      </button>
      {report && <ReportShare id={id} {...report} />}
      {error && <span role="alert" className="text-sm text-fail">{error}</span>}
    </div>
  );
}
