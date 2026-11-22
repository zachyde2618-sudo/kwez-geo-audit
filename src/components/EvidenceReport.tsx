import { CATEGORIES, CHECK_BY_ID } from "@/lib/checks/catalogue";
import type { CheckResult, Evidence } from "@/lib/schemas/check";
import type { ScoreSummary } from "@/lib/scoring";
import { StatusChip } from "./StatusChip";

const METHOD_LABEL = { automated: "Automated", llm: "AI judgement", external: "External source", manual: "Needs inside knowledge" } as const;

export function EvidenceReport({ results, score }: { results: CheckResult[]; score?: ScoreSummary }) {
  return (
    <div className="space-y-3">
      {CATEGORIES.map((cat) => {
        const catResults = results.filter((r) => CHECK_BY_ID.get(r.id)?.categoryId === cat.id);
        const cs = score?.categories.find((c) => c.categoryId === cat.id);
        let lastGroup: string | undefined;
        return (
          <details key={cat.id} id={`category-${cat.id}`} className="group rounded-2xl border border-line bg-card scroll-mt-20">
            <summary className="flex cursor-pointer items-center gap-4 p-4 sm:p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">{cat.id}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold leading-snug">{cat.name}</span>
                <span className="block text-xs text-ink-soft mt-0.5">
                  {catResults.length} checks · weight {cat.weight}
                  {cs && ` · ${cs.counts.pass} pass, ${cs.counts.partial} partial, ${cs.counts.fail} fail, ${cs.counts.unable} unable to verify`}
                </span>
              </span>
              <span className="font-mono text-lg tabular-nums">{cs?.score == null ? "—" : Math.round(cs.score)}</span>
              <span aria-hidden className="text-ink-soft transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <ul className="border-t border-line divide-y divide-line">
              {catResults.map((r) => {
                const meta = CHECK_BY_ID.get(r.id)!;
                const header = meta.group && meta.group !== lastGroup ? meta.group : null;
                lastGroup = meta.group;
                return (
                  <li key={r.id}>
                    {header && <div className="bg-paper px-5 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{header}</div>}
                    <CheckRow result={r} />
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

function CheckRow({ result: r }: { result: CheckResult }) {
  const meta = CHECK_BY_ID.get(r.id)!;
  return (
    <details className="group/check">
      <summary className="flex cursor-pointer items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-paper/60">
        <span className="w-9 shrink-0 pt-0.5 font-mono text-xs text-ink-soft">{r.id}</span>
        <span className="flex-1 min-w-0 text-sm leading-snug">
          {meta.title}
          {r.status !== "pass" && r.issue && <span className="block text-ink-soft text-xs mt-1">{r.issue}</span>}
        </span>
        <StatusChip status={r.status} />
      </summary>
      <div className="px-4 sm:px-5 pb-5 sm:pl-[4.25rem] space-y-3 text-sm">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
          <div><dt className="inline">Method: </dt><dd className="inline text-ink">{METHOD_LABEL[r.method]}</dd></div>
          <div><dt className="inline">Weight: </dt><dd className="inline text-ink">{meta.weight}</dd></div>
          <div><dt className="inline">Impact: </dt><dd className="inline text-ink">{r.impact}</dd></div>
          <div><dt className="inline">Effort: </dt><dd className="inline text-ink">{r.effort}</dd></div>
        </dl>
        {r.requiredChange && (
          <p><span className="font-medium">{r.status === "unable" ? "Recommendation: " : "What to change: "}</span>{r.requiredChange}</p>
        )}
        {r.notes.map((n, i) => (
          <p key={i} className="rounded-lg bg-accent-soft/60 px-3 py-2 text-xs">{n}</p>
        ))}
        <EvidenceList evidence={r.evidence} />
      </div>
    </details>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="text-xs text-ink-soft italic">No evidence collected.</p>;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Evidence</p>
      <ul className="space-y-1.5">
        {evidence.map((e, i) => (
          <li key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
            <span className="font-medium">{e.label}: </span>
            {e.kind === "snippet" ? <q className="italic">{e.value}</q> : <span className="font-mono break-all">{e.value}</span>}
            {e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-accent underline break-all">{e.url}</a>
            )}
            {e.verification && (
              <span className={`ml-2 inline-block rounded px-1.5 py-0.5 ${e.verification === "verified_externally" ? "bg-pass-soft text-pass" : "bg-unable-soft text-unable"}`}>
                {e.verification === "verified_externally" ? "Verified externally" : "Could not be independently checked"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
