import { config } from "@/config";
import { classifyRole } from "@/lib/crawler/extract";
import type { CrawlData, PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import { ev, isResult, needCrawl, okPages, relPath } from "./helpers";
import { judgementResult, llmCheck } from "./llm";
import type { CheckImpl, PageSnapshot } from "./types";
import { unable } from "./types";

const DAY = 86_400_000;
const monthsAgo = (iso: string) => (Date.now() - Date.parse(iso)) / (30.44 * DAY);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The most recent trustworthy date for a page: content dates first (schema, meta, <time>,
 * sitemap lastmod), and the Last-Modified header only when it isn't simply "now".
 */
export function freshestDate(page: PageData, crawl: CrawlData): { date: string; source: string } | null {
  const content = page.dates.filter((d) => d.source !== "Last-Modified header");
  const lastmod = crawl.sitemap.urls.find((u) => u.loc.replace(/\/+$/, "") === page.finalUrl.replace(/\/+$/, ""))?.lastmod;
  const candidates = [...content.map((d) => ({ date: d.date, source: d.source }))];
  if (lastmod && !Number.isNaN(Date.parse(lastmod))) candidates.push({ date: new Date(lastmod).toISOString(), source: "sitemap lastmod" });
  if (!candidates.length) {
    const lm = page.dates.find((d) => d.source === "Last-Modified header");
    if (lm && Date.now() - Date.parse(lm.date) > DAY) candidates.push({ date: lm.date, source: lm.source });
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function snapshotPages(crawl: CrawlData): PageSnapshot[] {
  return crawl.pages.map((p) => ({
    url: p.finalUrl,
    title: p.title,
    status: p.status,
    htmlBytes: p.htmlBytes,
    textHash: p.textHash,
    freshestDate: freshestDate(p, crawl)?.date ?? null,
  }));
}

function publishedDate(p: PageData): string | null {
  const pub = p.dates.find((d) => /datePublished|published_time/.test(d.source)) ?? p.dates.find((d) => d.source === "<time datetime>") ?? p.dates.find((d) => d.source !== "Last-Modified header");
  return pub?.date ?? null;
}

const c82: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const limit = config.thresholds.staleContentMonths;
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  const stale: string[] = [];
  let dated = 0;
  for (const p of pages.filter((p) => p.role !== "post" && p.role !== "blog")) {
    const f = freshestDate(p, c);
    if (!f) continue;
    dated++;
    const m = monthsAgo(f.date);
    if (m > limit) {
      stale.push(p.finalUrl);
      evidence.push(ev.measure(`Last updated: ${relPath(p.finalUrl)}`, `${fmtDate(f.date)} (${Math.round(m)} months ago, from ${f.source})`, p.finalUrl));
    } else if (evidence.length < 4) {
      evidence.push(ev.measure(`Last updated: ${relPath(p.finalUrl)}`, `${fmtDate(f.date)} (from ${f.source})`, p.finalUrl));
    }
  }
  if (stale.length) problems.push(`${stale.length} page(s) haven't been updated in over ${limit} months`);

  const posts = pages.filter((p) => p.role === "post").map((p) => ({ p, d: publishedDate(p) })).filter((x): x is { p: PageData; d: string } => !!x.d);
  if (posts.length) {
    const newest = posts.sort((a, b) => b.d.localeCompare(a.d))[0];
    dated++;
    evidence.push(ev.measure("Newest dated post", `${fmtDate(newest.d)}: ${relPath(newest.p.finalUrl)}`, newest.p.finalUrl));
    if (monthsAgo(newest.d) > limit) problems.push(`your newest post is from ${fmtDate(newest.d)}`);
  }

  const years = pages.map((p) => p.copyrightYear).filter((y): y is number => !!y);
  const thisYear = new Date().getFullYear();
  if (years.length) {
    const y = Math.max(...years);
    evidence.push(ev.measure("Footer copyright year", String(y)));
    if (y < thisYear - 1) problems.push(`the footer still says © ${y}`);
  }

  if (!dated && !years.length) return unable("Not checked: no page dates, post dates or copyright year were found.", "Add visible \"last updated\" dates and dateModified in your schema markup so freshness can be checked.");
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Parts of your site look out of date: ${problems.join("; ")}.`,
      requiredChange: `Review and refresh pages older than ${limit} months, update the footer year, and show a "last updated" date (with dateModified in schema) on key pages.`,
      pages: stale,
    };
  }
  return { status: "pass", evidence };
};

const c83: CheckImpl = (ctx) => {
  const c = ctx.data.crawl;
  const recommendation = "Set a quarterly content review: check prices, team, services and FAQs, and publish at least one useful article or update a month.";
  if (!c || !c.pages.length) return unable("A maintenance schedule can't be seen from outside the business.", recommendation, { method: "manual" });
  const dates = new Map<string, string>();
  for (const p of okPages(c).filter((p) => p.role === "post")) {
    const d = publishedDate(p);
    if (d) dates.set(p.finalUrl, d);
  }
  for (const u of c.sitemap.urls) {
    if (u.lastmod && classifyRole(u.loc) === "post" && !dates.has(u.loc) && !Number.isNaN(Date.parse(u.lastmod))) dates.set(u.loc, new Date(u.lastmod).toISOString());
  }
  if (!dates.size) return unable("A maintenance schedule can't be seen from outside the business, and there are no dated posts to infer one from.", recommendation, { method: "manual" });
  const sorted = [...dates.entries()].sort((a, b) => b[1].localeCompare(a[1]));
  const lastYear = sorted.filter(([, d]) => monthsAgo(d) <= 12);
  const evidence: Evidence[] = [
    ev.measure("Dated posts found", `${sorted.length} (from post pages and sitemap lastmod); ${lastYear.length} in the last 12 months`),
    ...sorted.slice(0, 3).map(([u, d]) => ev.measure("Post date", `${fmtDate(d)}: ${relPath(u)}`, u)),
  ];
  const notes = ["Inferred from your publishing cadence; a schedule itself can't be seen from outside."];
  if (lastYear.length >= 3) return { status: "pass", evidence, notes, method: "automated" };
  if (monthsAgo(sorted[0][1]) > 12) {
    return { status: "fail", evidence, issue: `Nothing new has been published since ${fmtDate(sorted[0][1])}.`, requiredChange: recommendation, notes, method: "automated" };
  }
  return unable("Too few dated posts to infer a regular schedule.", recommendation, { evidence, notes, method: "manual" });
};

const c84: CheckImpl = (ctx) => {
  const prev = ctx.data.previous;
  if (!prev) return unable("Not checked: there's no earlier audit of this domain to compare with. Re-run the audit later to check this.", "When you update a page, change the content itself (facts, examples, answers), not just the date.", { method: "manual" });
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const now = snapshotPages(c);
  const before = new Map(prev.snapshots.map((s) => [s.url, s]));
  const dateOnly: PageSnapshot[] = [];
  const real: PageSnapshot[] = [];
  for (const s of now) {
    const b = before.get(s.url);
    if (!b || !s.freshestDate || !b.freshestDate || s.freshestDate === b.freshestDate) continue;
    if (s.textHash === b.textHash) dateOnly.push(s);
    else real.push(s);
  }
  const evidence: Evidence[] = [ev.measure("Compared with audit", `${prev.id} from ${fmtDate(prev.createdAt)}; ${now.filter((s) => before.has(s.url)).length} pages in both`)];
  for (const s of dateOnly.slice(0, 5)) evidence.push(ev.measure(`Date changed, text identical: ${relPath(s.url)}`, `${fmtDate(before.get(s.url)!.freshestDate!)} → ${fmtDate(s.freshestDate!)}`, s.url));
  for (const s of real.slice(0, 3)) evidence.push(ev.measure(`Date and text changed: ${relPath(s.url)}`, `${fmtDate(before.get(s.url)!.freshestDate!)} → ${fmtDate(s.freshestDate!)}`, s.url));
  if (dateOnly.length) {
    return {
      status: "fail",
      evidence,
      issue: `${dateOnly.length} page(s) show a new date but the content hasn't changed since the last audit.`,
      requiredChange: "Only change a page's date when you've genuinely updated its content: new facts, prices, examples or answers.",
      pages: dateOnly.map((s) => s.url),
      method: "automated",
    };
  }
  if (real.length) return { status: "pass", evidence, method: "automated" };
  return unable("No pages changed their date since the last audit, so there's nothing to compare yet.", "", { evidence, method: "automated" });
};

/** 8.1 is L+E: the AI checks on-site accuracy and consistency now; external verification is added in Phase 5. */
const c81: CheckImpl = (ctx) => {
  const r = judgementResult(ctx, "8.1");
  return { ...r, notes: [...(r.notes ?? []), "Checked for accuracy and consistency across your own pages. Comparison with external listings is added in build phase 5."] };
};

export const cat8: Record<string, CheckImpl> = { "8.1": c81, "8.2": c82, "8.3": c83, "8.4": c84, "8.5": llmCheck("8.5") };
