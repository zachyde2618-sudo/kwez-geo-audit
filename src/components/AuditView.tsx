"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { auditedOn } from "@/lib/format";
import type { AuditRecord } from "@/lib/schemas/audit";
import type { VisibilityData } from "@/lib/visibility/run";
import { formatScoreLine } from "@/lib/scoring";
import { buildTodo } from "@/lib/todo";
import { AuditActions } from "./AuditActions";
import { EyeLoader } from "./Brand";
import { CategoryBars } from "./CategoryBars";
import { EvidenceReport } from "./EvidenceReport";
import { ScoreGauge } from "./ScoreGauge";
import { TodoList } from "./TodoList";

const ACTIVE = new Set(["queued", "running"]);

export function AuditView({ id, initial, favourite = false }: { id: string; initial: AuditRecord; favourite?: boolean }) {
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
  return <Results audit={audit} favourite={favourite} />;
}

function Progress({ audit, onCancel, cancelling, pollError }: { audit: AuditRecord; onCancel: () => void; cancelling: boolean; pollError: boolean }) {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [audit.progress.length]);
  const latest = audit.progress.at(-1)?.message ?? "Starting…";
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="flex items-center gap-5">
        <EyeLoader size={64} label={null} />
        <div className="min-w-0">
          <h1 className="text-2xl">Auditing {audit.domain}</h1>
          <p className="mt-2 break-words text-lg" aria-live="polite">
            {latest}
          </p>
        </div>
      </div>
      <p className="mt-6 text-sm text-ink-soft">
        {audit.results.length} of 72 checks done. You can leave this page and come back; the audit keeps running.
        {pollError && <span className="text-partial"> Lost contact with the server, retrying…</span>}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Checks done" aria-valuemin={0} aria-valuemax={72} aria-valuenow={audit.results.length}>
        <div className="bar-fill h-full rounded-full bg-accent" style={{ transform: `scaleX(${audit.results.length / 72})` }} />
      </div>
      <ol ref={logRef} className="mt-6 max-h-80 space-y-1.5 overflow-y-auto rounded-card border border-line bg-card p-4 font-mono text-xs">
        {audit.progress.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-ink-soft">{new Date(p.at).toLocaleTimeString("en-GB")}</span>
            <span>{p.message}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onCancel} disabled={cancelling} aria-busy={cancelling || undefined} className="mt-6 min-h-10 whitespace-nowrap rounded-input border border-muted bg-paper-3 px-5 py-2 text-sm font-semibold hover:border-fail hover:text-fail">
        {cancelling ? "Cancelling…" : "Cancel audit"}
      </button>
    </div>
  );
}

function Ended({ audit }: { audit: AuditRecord }) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-14">
      <h1 className="text-2xl font-bold tracking-tight">{audit.status === "cancelled" ? "Audit cancelled" : "The audit didn't finish"}</h1>
      <p className="mt-2 text-ink-soft">{audit.error ?? `The audit of ${audit.domain} was stopped before it finished.`}</p>
      <Link href="/audit" className="btn mt-6 inline-flex min-h-10 items-center whitespace-nowrap rounded-input bg-accent px-5 py-2 font-semibold text-accent-ink hover:bg-accent-strong">Start a new audit</Link>
    </div>
  );
}

const BAND_SUMMARY: Record<string, string> = {
  "Low visibility": "AI assistants are unlikely to find or recommend this business yet.",
  Developing: "AI assistants can find this business, but clear gaps are holding it back.",
  Good: "This business is well placed for AI discovery, with some improvements left.",
  Excellent: "This business is in strong shape for AI discovery.",
};

function Results({ audit, favourite }: { audit: AuditRecord; favourite: boolean }) {
  const s = audit.score!;
  const todo = useMemo(() => buildTodo(audit.results), [audit.results]);
  const counts = s.categories.reduce(
    (acc, c) => ({ pass: acc.pass + c.counts.pass, partial: acc.partial + c.counts.partial, fail: acc.fail + c.counts.fail, unable: acc.unable + c.counts.unable }),
    { pass: 0, partial: 0, fail: 0, unable: 0 },
  );

  // "Check 1.7" links: open the category and the check before scrolling to it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#check-"]');
      if (!a) return;
      const el = document.getElementById(a.getAttribute("href")!.slice(1)) as HTMLDetailsElement | null;
      if (!el) return;
      e.preventDefault();
      let p: HTMLElement | null = el;
      while (p) {
        if (p instanceof HTMLDetailsElement) p.open = true;
        p = p.parentElement;
      }
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const name = audit.input.companyName || audit.domain;
  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-8 sm:px-6 sm:py-12">
      <section aria-labelledby="results-title" className="grid items-start gap-x-12 gap-y-8 md:grid-cols-[auto_minmax(0,1fr)]">
        <figure className="m-0 justify-self-center md:sticky md:top-24">
          <ScoreGauge score={s.overall} />
          <figcaption className="mt-1 text-center text-sm text-ink-soft">GEO Visibility Score</figcaption>
        </figure>
        <div className="min-w-0 space-y-6">
          <div>
            <h1 id="results-title" className="text-3xl sm:text-4xl">{name}</h1>
            <dl className="mt-4 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-ink-soft">Website</dt>
              <dd className="m-0 break-words">{audit.domain}</dd>
              <dt className="text-ink-soft">Audited</dt>
              <dd className="m-0">
                <time dateTime={audit.createdAt}>{auditedOn(audit.createdAt)}</time>
              </dd>
              <AiCostLine audit={audit} />
            </dl>
            <AuditActions id={audit.id} favourite={favourite} />
          </div>
          <AiReviewWarning audit={audit} />
          <div className="space-y-3 border-t border-line pt-5">
            <p className="text-sm font-semibold tabular-nums text-ink-2" data-testid="score-line">{formatScoreLine(s)}</p>
            {s.notInBuild > 0 && (
              <p className="text-xs text-ink-soft">
                {s.notInBuild} check{s.notInBuild === 1 ? " isn't" : "s aren't"} available in this version yet, so {s.notInBuild === 1 ? "it isn't" : "they aren't"} counted.
              </p>
            )}
            {s.band && <p className="max-w-prose text-lg">{BAND_SUMMARY[s.band]}</p>}
          </div>
          {s.provisional && (
            <p role="note" className="rounded-input bg-partial-soft px-4 py-3 text-sm text-partial">
              <strong>Provisional score.</strong> Only {s.coveragePct}% of checks could be assessed, so this score may change a lot. Adding API keys and company details fills in the gaps.
            </p>
          )}
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Check results">
            <li className="rounded-full bg-pass-soft px-3 py-1 text-pass">{counts.pass} pass</li>
            <li className="rounded-full bg-partial-soft px-3 py-1 text-partial">{counts.partial} partial</li>
            <li className="rounded-full bg-fail-soft px-3 py-1 text-fail">{counts.fail} fail</li>
            <li className="rounded-full bg-unable-soft px-3 py-1 text-unable">{counts.unable} unable to verify</li>
          </ul>
        </div>
      </section>

      <SectionNav todoCount={todo.length} />

      <section id="categories" aria-labelledby="categories-title" className="scroll-mt-4">
        <div className="mb-5">
          <h2 id="categories-title" className="text-2xl">Category breakdown</h2>
          <p className="mt-2 text-sm text-ink-soft">Click a category to see its checks.</p>
        </div>
        <div className="rounded-card border border-line bg-card p-2 sm:p-3">
          <CategoryBars score={s} />
        </div>
      </section>

      <section id="todo" aria-labelledby="todo-title" className="scroll-mt-4">
        <div className="mb-5">
          <h2 id="todo-title" className="text-2xl">Your to-do list</h2>
          <p className="mt-2 text-sm text-ink-soft">{`${todo.length} fix${todo.length === 1 ? "" : "es"}, most valuable first. “Kwez can fix this” items are ones we can do for you.`}</p>
        </div>
        <TodoList items={todo} />
      </section>

      <section id="visibility" aria-labelledby="visibility-title" className="scroll-mt-4">
        <div className="mb-5">
          <h2 id="visibility-title" className="text-2xl">AI visibility</h2>
          <p className="mt-2 text-sm text-ink-soft">How often AI assistants mention this business when asked questions by people who don&rsquo;t know it.</p>
        </div>
        <VisibilityPlaceholder audit={audit} />
      </section>

      <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-4">
        <div className="mb-5">
          <h2 id="evidence-title" className="text-2xl">Full evidence report</h2>
          <p className="mt-2 text-sm text-ink-soft">All 72 checks, with the evidence behind each result.</p>
        </div>
        <EvidenceReport results={audit.results} score={s} />
      </section>
    </div>
  );
}


/** Model, token use and estimated cost of the AI review (estimates from config prices, not invoices). */
function AiCostLine({ audit }: { audit: AuditRecord }) {
  const ai = audit.extras.aiReview as { model: string; calls: number; tokensUsed: number } | undefined;
  const usd = audit.costs.filter((c) => c.provider === "anthropic").reduce((t, c) => t + c.usd, 0);
  return (
    <>
      {ai && (
        <>
          <dt className="text-ink-soft">AI review</dt>
          <dd className="m-0" data-testid="ai-cost">
            {ai.model}, {ai.calls} request{ai.calls === 1 ? "" : "s"}, {ai.tokensUsed.toLocaleString("en-GB")} tokens, about ${usd.toFixed(2)}
          </dd>
        </>
      )}
      <WebSearchLine audit={audit} />
    </>
  );
}

function WebSearchLine({ audit }: { audit: AuditRecord }) {
  const w = audit.extras.webSearch as { provider: string; searches: unknown[]; relevantResults: number; sites: string[] } | undefined;
  if (!w) return null;
  return (
    <>
      <dt className="text-ink-soft">Web search</dt>
      <dd className="m-0">
        {w.provider === "serper" ? "Google via Serper" : "Brave"}, {w.searches.length} searches, {w.relevantResults} result{w.relevantResults === 1 ? "" : "s"} about this business on {w.sites.length} site{w.sites.length === 1 ? "" : "s"}
      </dd>
    </>
  );
}

/** Explain plainly when the AI review failed, since it takes ~20 checks down with it. */
function AiReviewWarning({ audit }: { audit: AuditRecord }) {
  const ai = audit.extras.aiReview as { calls: number; judgements?: { error?: string }[] } | undefined;
  const firstError = ai?.judgements?.find((j) => j.error)?.error;
  if (!ai || !firstError || ai.calls > 0) return null;
  const affected = ai.judgements!.filter((j) => j.error).length;
  const authProblem = /\b401\b|authentication|invalid bearer|x-api-key|api key/i.test(firstError);
  const credit = /credit balance|billing/i.test(firstError);
  return (
    <div role="alert" className="rounded-input border border-fail/30 bg-fail-soft px-4 py-3 text-sm text-left text-fail">
      <p>
        <strong>The AI review didn&rsquo;t run, so {affected} checks couldn&rsquo;t be assessed.</strong>{" "}
        {authProblem
          ? "Anthropic rejected the API key. Check ANTHROPIC_API_KEY is just the key (it starts with sk-ant-), restart the app and run the audit again."
          : credit
            ? "The Anthropic account is out of credit. Top it up in the Anthropic Console, then run the audit again."
            : "Run the audit again; if it keeps failing, check the Anthropic API key and account."}
      </p>
      <p className="mt-1 break-words font-mono text-xs opacity-80">{firstError.slice(0, 200)}</p>
    </div>
  );
}

function VisibilityPlaceholder({ audit }: { audit: AuditRecord }) {
  const v = audit.extras.visibility as VisibilityData | undefined;
  if (v?.answers?.length) return <VisibilityResults v={v} name={audit.input.companyName || audit.domain} />;
  const r = audit.results.find((x) => x.id === "9.10");
  const reason = !audit.input.options.runVisibility
    ? "AI visibility tests were switched off for this audit. Turn them on in the form's options to see whether AI assistants recommend this business."
    : r?.issue || "AI visibility results will appear here.";
  return <p className="rounded-card border border-dashed border-line bg-card p-6 text-sm text-ink-soft">{reason}</p>;
}

function VisibilityResults({ v, name }: { v: VisibilityData; name: string }) {
  const answered = v.answers.filter((a) => !a.error);
  const hits = answered.filter((a) => a.mentioned).length;
  const pct = answered.length ? Math.round((hits / answered.length) * 100) : 0;
  return (
    <div className="rounded-card border border-line bg-card">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-5 py-4">
        <p className="text-3xl font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
          {hits}/{answered.length}
        </p>
        <p className="text-sm text-ink-soft">
          {v.label} named <span className="font-semibold text-ink">{name}</span> in {pct}% of answers to {v.promptSource === "supplied" ? "your example questions" : "questions a new customer might ask"} (with web search on).
        </p>
      </div>
      <ul className="divide-y divide-line">
        {v.answers.map((a, i) => (
          <li key={i} className="flex gap-3 px-5 py-3 text-sm">
            <span aria-hidden className={`mt-0.5 shrink-0 font-semibold ${a.error ? "text-unable" : a.mentioned ? "text-pass" : "text-fail"}`}>
              {a.error ? "–" : a.mentioned ? "✓" : "✗"}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">&ldquo;{a.prompt}&rdquo;</span>
              <span className="block text-ink-soft">
                {a.error
                  ? `Not answered (${a.error}).`
                  : a.mentioned
                    ? a.recommended ? "Recommended." : "Named, but not recommended."
                    : a.others.length ? `Named instead: ${a.others.slice(0, 5).join(", ")}${a.others.length > 5 ? "…" : ""}` : "Not named. No specific businesses recommended."}
                <span className="sr-only">{a.error ? "" : a.mentioned ? " (named)" : " (not named)"}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SECTIONS = [
  ["categories", "Categories"],
  ["todo", "To-do list"],
  ["visibility", "AI visibility"],
  ["evidence", "Full evidence report"],
] as const;

/** The report's section bar: sticks under the header and marks the section being read. */
function SectionNav({ todoCount }: { todoCount: number }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const onScroll = () => {
      // The section whose top has passed a line just under the sticky bars is the one being read.
      const line = 160;
      let found: string | null = null;
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) found = id;
      }
      setCurrent(found);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav aria-label="Report sections" className="no-print sticky top-16 z-10 border-y border-line bg-paper">
      <div className="flex gap-x-1 overflow-x-auto py-1.5 text-sm font-semibold text-ink-soft">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={current === id ? "location" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-2 ${current === id ? "bg-accent-soft text-accent-strong" : "hover:bg-paper-2 hover:text-ink"}`}
          >
            {label}
            {id === "todo" && <span className="tabular-nums"> ({todoCount})</span>}
          </a>
        ))}
      </div>
    </nav>
  );
}
