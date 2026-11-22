import { reviewablePages } from "@/lib/llm/chunk";
import type { Evidence } from "@/lib/schemas/check";
import { freshestDate } from "./cat8";
import { ev, isResult, needCrawl, relPath } from "./helpers";
import { judgementResult, llmCheck, scopeEvidence, withAiPart } from "./llm";
import type { CheckImpl } from "./types";
import { unable } from "./types";

/** Sentences containing a statistic: percentages, money, or counts of meaningful things. */
const STAT =
  /[^.!?]{0,120}(\b\d[\d,.]*\s?(%|per ?cent\b)|£\s?\d[\d,.]*(k|m|bn)?\b|\b\d[\d,]{1,}\+?\s+(customers|clients|homes|households|jobs|projects|installations|businesses|people|respondents|reviews|properties|chargers|cases|patients|students|users)\b|\b(average|median|typically|on average)\b[^.!?]{0,60}\d)[^.!?]{0,120}[.!?]?/gi;

const c72auto: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const found: { text: string; url: string }[] = [];
  for (const p of reviewablePages(c.pages)) {
    for (const m of p.mainText.matchAll(STAT)) {
      const text = m[0].trim();
      if (text.length > 15 && !found.some((f) => f.text === text)) found.push({ text, url: p.finalUrl });
    }
  }
  const evidence: Evidence[] = [ev.measure("Statistics found", `${found.length} sentence(s) containing figures (percentages, prices, counts or averages)`)];
  for (const f of found.slice(0, 4)) evidence.push(ev.snippet(`Figure on ${relPath(f.url)}`, f.text, f.url));
  if (found.length >= 3) return { status: "pass", evidence };
  return {
    status: "fail",
    evidence,
    issue: found.length ? `Only ${found.length} statistic(s) appear across your pages.` : "Your pages contain no statistics.",
    requiredChange: "Add relevant statistics with context, e.g. \"Most three-bedroom rewires we did in 2026 took 5–7 days\", and explain what they mean for the customer.",
  };
};

const DAY = 86_400_000;

/** 7.6: the pages the AI identified as original data must have a publication date within 12 months. */
const c76: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const review = ctx.data.llm;
  const j = review?.judgements["7.1"];
  if (!review || !j) return unable(`Not checked: needs the AI review to identify original data${ctx.data.llmError ? ` (${ctx.data.llmError})` : " (ANTHROPIC_API_KEY not configured)"}.`);
  const base = judgementResult(ctx, "7.1");
  if (base.status === "unable") return { ...base, issue: base.issue?.replace("Not checked:", "Not checked (depends on 7.1):") };
  const scope = scopeEvidence(review, j);
  if (base.status === "fail") {
    return {
      status: "fail",
      evidence: [scope, ev.note("Original data (check 7.1)", "none found")],
      issue: "You don't publish original data, so there's nothing new for AI to pick up each year.",
      requiredChange: "Publish new original data at least once a year, such as an annual summary of prices, timings or trends from your own jobs.",
      method: "llm",
    };
  }
  const urls = [...new Set(j.verdict!.quotes.map((q) => q.url))];
  const dated = urls
    .map((u) => ({ u, page: c.pages.find((p) => p.finalUrl === u) }))
    .map(({ u, page }) => ({ u, d: page ? freshestDate(page, c) : null }))
    .filter((x): x is { u: string; d: { date: string; source: string } } => !!x.d)
    .sort((a, b) => b.d.date.localeCompare(a.d.date));
  const evidence: Evidence[] = [scope, ...urls.map((u) => ev.url("Page with original data (check 7.1)", u))];
  if (!dated.length) return unable("Not checked: the pages with original data have no visible or machine-readable date.", "Show a publication date on research pages and add datePublished to their schema markup.", { evidence, method: "llm" });
  const newest = dated[0];
  const months = (Date.now() - Date.parse(newest.d.date)) / (30.44 * DAY);
  evidence.push(ev.measure("Newest original data", `${newest.d.date.slice(0, 10)} (${Math.round(months)} months ago, from ${newest.d.source}) on ${relPath(newest.u)}`, newest.u));
  if (months <= 12) return { status: "pass", evidence, method: "llm" };
  return {
    status: "fail",
    evidence,
    issue: `Your newest original data is from ${newest.d.date.slice(0, 10)}, more than a year ago.`,
    requiredChange: "Publish new original data at least once a year, and date it clearly.",
    pages: [newest.u],
    method: "llm",
  };
};

export const cat7: Record<string, CheckImpl> = {
  "7.1": llmCheck("7.1"),
  "7.2": withAiPart("7.2", c72auto),
  "7.3": llmCheck("7.3"),
  "7.4": llmCheck("7.4"),
  "7.5": llmCheck("7.5"),
  "7.6": c76,
};
