import { CRITERIA } from "@/lib/llm/rubrics";
import type { Judgement, SiteReview } from "@/lib/llm/review";
import type { CheckStatus, Evidence } from "@/lib/schemas/check";
import { ev, isResult, listSome, needCrawl, relPath } from "./helpers";
import type { CheckContext, CheckImpl, RawCheckResult } from "./types";
import { unable } from "./types";

/** Evidence describing what the AI looked at (always included, so verdicts are traceable). */
export function scopeEvidence(review: Pick<SiteReview, "model">, j: Judgement, external = false): Evidence {
  const pages = j.reviewedPages.map((u) => (external ? u : relPath(u)));
  return ev.measure(`AI review (${review.model})`, `${pages.length} ${external ? "third-party source(s)" : "page(s)"} reviewed: ${listSome(pages, 6)}`);
}

export function quoteEvidence(j: Judgement, external = false): Evidence[] {
  return (j.verdict?.quotes ?? []).map((q) => ev.snippet(`Quoted from ${external ? q.url : relPath(q.url)}`, q.quote, q.url));
}

/** Why there is no AI judgement for a check, as an Unable to Verify result. */
function noJudgement(ctx: CheckContext): RawCheckResult {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  return unable(`Not checked: the AI review did not run${ctx.data.llmError ? ` (${ctx.data.llmError})` : ""}.`);
}

/**
 * Turn the AI judgement for a criterion into a check result. The model supplies the status,
 * the finding and verified quotes; the required change is fixed text owned by the code.
 */
export function judgementResult(ctx: CheckContext, id: string): RawCheckResult {
  const ext = ctx.data.external;
  const isExternal = !!ext?.judgements?.[id];
  const review = isExternal ? { model: ext!.model ?? "AI" } : ctx.data.llm;
  const j = isExternal ? ext!.judgements![id] : ctx.data.llm?.judgements[id];
  if (!review || !j) return noJudgement(ctx);
  const criterion = CRITERIA[id];
  if (j.error) return unable(`Not checked: the AI review could not complete (${j.error}).`, "Re-run the audit; if it keeps failing, check the ANTHROPIC_API_KEY and the token budget in src/config.ts.", { method: "llm" });
  const v = j.verdict!;
  const notes = j.incomplete ? [`Part of the AI review failed (${j.incomplete}), but the result from the remaining pages is conclusive.`] : [];
  const evidence = [scopeEvidence(review, j, isExternal), ...quoteEvidence(j, isExternal)];
  if (v.status === "not_applicable") {
    const na = criterion.notApplicable;
    if (na.status === "unable") return unable(na.issue, "", { evidence, method: "llm", notes });
    return {
      status: na.status,
      evidence: [...evidence, ...(v.finding ? [ev.note("AI finding", v.finding)] : [])],
      issue: na.issue,
      requiredChange: na.status === "pass" ? "" : criterion.fix,
      method: "llm",
      notes,
    };
  }
  const status: CheckStatus = v.status;
  return {
    status,
    evidence,
    issue: status === "pass" ? "" : v.finding,
    requiredChange: status === "pass" ? "" : criterion.fix,
    pages: status === "pass" ? [] : [...new Set(v.quotes.map((q) => q.url))],
    method: "llm",
    notes: status === "pass" && v.finding ? [`AI finding: ${v.finding}`, ...notes] : notes,
  };
}

/** A check that is purely an AI judgement. */
export const llmCheck = (id: string): CheckImpl => (ctx) => judgementResult(ctx, id);

const SEVERITY: Record<CheckStatus, number> = { fail: 3, partial: 2, pass: 1, unable: 0 };

/**
 * Combine the automated (A) and AI (L) parts of an "A+L" check: the worse of the two
 * decides. If one part couldn't run, the other stands alone with a note saying so.
 */
export function combineParts(auto: RawCheckResult, ai: RawCheckResult): RawCheckResult {
  if (ai.status === "unable") return { ...auto, notes: [...(auto.notes ?? []), `AI review part not assessed: ${ai.issue ?? "unavailable"}`] };
  if (auto.status === "unable") return { ...ai, notes: [...(ai.notes ?? []), `Automated part not assessed: ${auto.issue ?? "unavailable"}`] };
  const worst = SEVERITY[auto.status] >= SEVERITY[ai.status] ? auto.status : ai.status;
  const failing = [auto, ai].filter((r) => r.status !== "pass");
  return {
    status: worst,
    evidence: [...(auto.evidence ?? []), ...(ai.evidence ?? [])],
    issue: failing.map((r) => r.issue).filter(Boolean).join(" "),
    requiredChange: [...new Set(failing.map((r) => r.requiredChange).filter(Boolean))].join(" "),
    pages: [...new Set([...(auto.pages ?? []), ...(ai.pages ?? [])])],
    notes: [...(auto.notes ?? []), ...(ai.notes ?? [])],
    method: auto.method,
  };
}

/** Wrap an automated check so its AI part (same ID) is combined in when available. */
export function withAiPart(id: string, auto: CheckImpl): CheckImpl {
  return async (ctx) => {
    const a = await auto(ctx);
    if (!ctx.data.llm) {
      const why = ctx.data.llmError ?? "ANTHROPIC_API_KEY not configured";
      return { ...a, notes: [...(a.notes ?? []), `AI review part not run (${why}), so only the automated part was assessed.`] };
    }
    return combineParts(a, judgementResult(ctx, id));
  };
}
