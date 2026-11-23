"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { auditedOn } from "@/lib/format";
import type { AuditRecord } from "@/lib/schemas/audit";
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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-14">
      <div className="flex items-center gap-5">
        <EyeLoader size={64} label={null} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Auditing {audit.domain}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight">
            <span aria-live="polite">{latest}</span>
          </h1>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {audit.results.length} of 72 checks done. You can leave this page and come back; the audit keeps running.
        {pollError && <span className="text-partial"> Lost contact with the server, retrying…</span>}
      </p>
      <div className="mt-4 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full bg-linear-to-r from-brand to-accent transition-all duration-500" style={{ width: `${(audit.results.length / 72) * 100}%` }} />
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
      <h1 className="text-2xl font-bold tracking-tight">{audit.status === "cancelled" ? "Audit cancelled" : "The audit didn't finish"}</h1>
      <p className="mt-2 text-ink-soft">{audit.error ?? `The audit of ${audit.domain} was stopped before it finished.`}</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-white">Start a new audit</Link>
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
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      <section aria-labelledby="results-title" className="rounded-3xl border border-line bg-card p-6 sm:p-10">
        <div className="grid items-center gap-8 md:grid-cols-[auto_1fr] md:gap-12">
          <ScoreGauge score={s.overall} />
          <div className="space-y-4 text-center md:text-left">
            <div>
              <p className="text-sm font-medium text-accent">GEO Visibility Score</p>
              <h1 id="results-title" className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight break-words">{name}</h1>
              <p className="mt-1 text-sm text-ink-soft">
                {audit.domain} · <time dateTime={audit.createdAt}>audited {auditedOn(audit.createdAt)}</time>
              </p>
              <AiCostLine audit={audit} />
              <AuditActions id={audit.id} favourite={favourite} />
            </div>
            <AiReviewWarning audit={audit} />
            <p className="font-mono text-sm" data-testid="score-line">{formatScoreLine(s)}</p>
            {s.notInBuild > 0 && (
              <p className="text-xs text-ink-soft">
                {s.notInBuild} check{s.notInBuild === 1 ? " isn't" : "s aren't"} available in this version yet, so {s.notInBuild === 1 ? "it isn't" : "they aren't"} counted.
              </p>
            )}
            {s.band && <p className="text-ink-soft max-w-prose">{BAND_SUMMARY[s.band]}</p>}
            {s.provisional && (
              <p role="note" className="rounded-xl bg-partial-soft px-4 py-3 text-sm text-partial text-left">
                <strong>Provisional score.</strong> Only {s.coveragePct}% of checks could be assessed, so this score may change a lot. Adding API keys and company details fills in the gaps.
              </p>
            )}
            <ul className="flex flex-wrap justify-center md:justify-start gap-2 text-sm" aria-label="Check results">
              <li className="rounded-full bg-pass-soft px-3 py-1 text-pass">{counts.pass} pass</li>
              <li className="rounded-full bg-partial-soft px-3 py-1 text-partial">{counts.partial} partial</li>
              <li className="rounded-full bg-fail-soft px-3 py-1 text-fail">{counts.fail} fail</li>
              <li className="rounded-full bg-unable-soft px-3 py-1 text-unable">{counts.unable} unable to verify</li>
            </ul>
          </div>
        </div>
      </section>

      <nav aria-label="Report sections" className="no-print -mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
        <a href="#categories" className="hover:text-accent">Categories</a>
        <a href="#todo" className="hover:text-accent">To-do list ({todo.length})</a>
        <a href="#visibility" className="hover:text-accent">AI visibility</a>
        <a href="#evidence" className="hover:text-accent">Full evidence report</a>
      </nav>

      <section id="categories" aria-labelledby="categories-title" className="scroll-mt-20">
        <SectionHeading id="categories-title" title="Category breakdown" sub="Click a category to see its checks." />
        <div className="rounded-2xl border border-line bg-card p-2 sm:p-3">
          <CategoryBars score={s} />
        </div>
      </section>

      <section id="todo" aria-labelledby="todo-title" className="scroll-mt-20">
        <SectionHeading id="todo-title" title="Your to-do list" sub={`${todo.length} fix${todo.length === 1 ? "" : "es"}, most valuable first. “Kwez can fix this” items are ones we can do for you.`} />
        <TodoList items={todo} />
      </section>

      <section id="visibility" aria-labelledby="visibility-title" className="scroll-mt-20">
        <SectionHeading id="visibility-title" title="AI visibility" sub="How often AI assistants mention this business when asked questions by people who don't know it." />
        <VisibilityPlaceholder audit={audit} />
      </section>

      <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-20">
        <SectionHeading id="evidence-title" title="Full evidence report" sub="All 72 checks, with the evidence behind each result." />
        <EvidenceReport results={audit.results} score={s} />
      </section>
    </div>
  );
}

function SectionHeading({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-2xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
  );
}

/** Model, token use and estimated cost of the AI review (estimates from config prices, not invoices). */
function AiCostLine({ audit }: { audit: AuditRecord }) {
  const ai = audit.extras.aiReview as { model: string; calls: number; tokensUsed: number } | undefined;
  if (!ai)
    return audit.extras.webSearch ? (
      <p className="mt-1 text-xs text-ink-soft">
        <WebSearchLine audit={audit} />
      </p>
    ) : null;
  const usd = audit.costs.filter((c) => c.provider === "anthropic").reduce((t, c) => t + c.usd, 0);
  return (
    <p className="mt-1 text-xs text-ink-soft" data-testid="ai-cost">
      AI review: {ai.model}, {ai.calls} request{ai.calls === 1 ? "" : "s"}, {ai.tokensUsed.toLocaleString("en-GB")} tokens, about ${usd.toFixed(2)}
      <WebSearchLine audit={audit} />
    </p>
  );
}

function WebSearchLine({ audit }: { audit: AuditRecord }) {
  const w = audit.extras.webSearch as { provider: string; searches: unknown[]; relevantResults: number; sites: string[] } | undefined;
  if (!w) return null;
  return (
    <>
      <br />
      Web search ({w.provider === "serper" ? "Google via Serper" : "Brave"}): {w.searches.length} searches, {w.relevantResults} result{w.relevantResults === 1 ? "" : "s"} about this business on {w.sites.length} site{w.sites.length === 1 ? "" : "s"}
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
    <div role="alert" className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-sm text-left text-fail">
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
  const r = audit.results.find((x) => x.id === "9.10");
  const reason = !audit.input.options.runVisibility
    ? "AI visibility tests were switched off for this audit. Turn them on in the form's options to see how often ChatGPT, Gemini, Perplexity and Claude mention this business."
    : r?.issue || "AI visibility results will appear here.";
  return <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-ink-soft">{reason}</p>;
}
