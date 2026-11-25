import { randomUUID } from "node:crypto";
import { API_KEY_NAMES, config, hasKey } from "@/config";
import { CATEGORIES, CHECKS } from "@/lib/checks/catalogue";
import { snapshotPages } from "@/lib/checks/cat8";
import { getImplementation, runCheck } from "@/lib/checks/registry";
import type { CheckContext, PageSnapshot, PreviousAudit } from "@/lib/checks/types";
import { crawlSite, ROLE_LABEL } from "@/lib/crawler/crawl";
import type { CrawlData } from "@/lib/crawler/types";
import { LlmClient } from "@/lib/llm/client";
import { runSiteReview, type SiteReview } from "@/lib/llm/review";
import { gatherExternal } from "@/lib/external/gather";
import { runExternalReview, type ExternalData } from "@/lib/llm/external";
import { runVisibility } from "@/lib/visibility/run";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput, type AuditInput } from "@/lib/schemas/input";
import { takeToken } from "@/lib/limits";
import { computeScore } from "@/lib/scoring";
import { deleteAuditFile, listAudits, loadAudit, saveAudit } from "@/lib/storage";

/** In-memory registry of running audits. Survives Next dev hot reloads via globalThis. */
const g = globalThis as unknown as { __kwezJobs?: Map<string, AbortController> };
const jobs: Map<string, AbortController> = (g.__kwezJobs ??= new Map());

export function isRunning(id: string): boolean {
  return jobs.has(id);
}

/** Delete an audit. A running audit is cancelled first and given a moment to stop saving. */
export async function deleteAudit(id: string): Promise<boolean> {
  if (cancelAudit(id)) {
    for (let i = 0; i < 50 && jobs.has(id); i++) await new Promise((r) => setTimeout(r, 100));
  }
  return deleteAuditFile(id);
}

/** Start a fresh audit with the same details as an earlier one. Returns the new record, or null. */
export async function rerunAudit(id: string): Promise<AuditRecord | null> {
  const old = await loadAudit(id);
  if (!old) return null;
  return startAudit(parseAuditInput(old.input, config.crawler.allowLocalTargets));
}

export function cancelAudit(id: string): boolean {
  const ctl = jobs.get(id);
  if (!ctl) return false;
  ctl.abort(new Error("Cancelled by user"));
  return true;
}

export function newAuditRecord(input: AuditInput): AuditRecord {
  const now = new Date().toISOString();
  return {
    id: `${now.slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    domain: new URL(input.url).hostname.replace(/^www\./, ""),
    input,
    progress: [{ at: now, message: "Audit queued" }],
    results: [],
    costs: [],
    keysConfigured: API_KEY_NAMES.filter((k) => hasKey(k)),
    extras: {},
  };
}

/** Thrown when starting another audit now would go over the limits in `config.security`. */
export class AuditLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

/** Create, persist and start an audit in the background. Returns the record. */
export async function startAudit(input: AuditInput): Promise<AuditRecord> {
  // Every audit spends money on API calls, so cap how many run at once and per hour.
  if (jobs.size >= config.security.maxConcurrentAudits) {
    throw new AuditLimitError(`${jobs.size === 1 ? "An audit is" : `${jobs.size} audits are`} already running. Please wait for one to finish, then try again.`, 30);
  }
  const wait = takeToken("audits:start", config.security.auditsPerHour, 3_600_000);
  if (wait) {
    throw new AuditLimitError(`The limit of ${config.security.auditsPerHour} audits an hour has been reached. Try again in about ${Math.ceil(wait / 60)} minutes.`, wait);
  }
  const record = newAuditRecord(input);
  await saveAudit(record);
  const ctl = new AbortController();
  jobs.set(record.id, ctl);
  void executeAudit(record, ctl.signal).finally(() => jobs.delete(record.id));
  return record;
}

/** Runs the whole pipeline. Exported for tests (runs in the foreground there). */
export async function executeAudit(record: AuditRecord, signal: AbortSignal): Promise<AuditRecord> {
  let saveChain = Promise.resolve();
  const persist = () => {
    record.updatedAt = new Date().toISOString();
    const snapshot = JSON.parse(JSON.stringify(record)) as AuditRecord;
    saveChain = saveChain.then(() => saveAudit(snapshot)).catch(() => {});
    return saveChain;
  };
  const progress = (message: string) => {
    record.progress.push({ at: new Date().toISOString(), message });
    void persist();
  };

  record.status = "running";
  progress(`Starting audit of ${record.domain}`);

  const ctx: CheckContext = { input: record.input, signal, progress, data: {} };

  try {
    // Stage 1–2: discover and fetch
    try {
      ctx.data.crawl = await crawlSite(record.input, signal, progress);
      record.extras.crawlSummary = crawlSummary(ctx.data.crawl);
      record.extras.pageSnapshots = snapshotPages(ctx.data.crawl);
      const mix = new Map<string, number>();
      for (const pg of ctx.data.crawl.pages) mix.set(ROLE_LABEL[pg.role], (mix.get(ROLE_LABEL[pg.role]) ?? 0) + 1);
      progress(`Crawled ${ctx.data.crawl.pages.length} page(s): ${[...mix].map(([k, v]) => `${v} ${k}`).join(", ")}`);
    } catch (err) {
      if (signal.aborted) throw err;
      ctx.data.crawlError = err instanceof Error ? err.message : String(err);
      progress(`Crawl failed: ${ctx.data.crawlError}`);
    }
    ctx.data.previous = await loadPrevious(record);

    // One AI client for the whole audit, so the site review and web search share the token budget.
    const client = hasKey("ANTHROPIC_API_KEY")
      ? new LlmClient({
          onCost: (c) => {
            record.costs.push(c);
            void persist();
          },
        })
      : undefined;

    // Hold back part of the token budget for the later AI stages (web search judgements and
    // the visibility tests), released stage by stage.
    const R = config.llm.reserveShare;
    const willSearch = hasKey("SEARCH_API_KEY");
    const willAsk = record.input.options.runVisibility;
    client?.reserveShare((willSearch ? R.externalReview : 0) + (willAsk ? R.visibility : 0));

    // Stage 3: AI review of page text (LLM-judged checks). Skipped without a key or pages.
    if (client && ctx.data.crawl?.pages.length) {
      signal.throwIfAborted();
      try {
        ctx.data.llm = await runSiteReview({ crawl: ctx.data.crawl, input: record.input, client, signal, progress, concurrency: config.llm.concurrency });
        record.extras.aiReview = aiReviewSummary(ctx.data.llm);
        const usd = record.costs.filter((c) => c.provider === "anthropic").reduce((t, c) => t + c.usd, 0);
        progress(`AI review complete: ${ctx.data.llm.calls} request(s), ${ctx.data.llm.tokensUsed.toLocaleString("en-GB")} tokens, about $${usd.toFixed(2)}`);
      } catch (err) {
        if (signal.aborted) throw err;
        ctx.data.llmError = err instanceof Error ? err.message : String(err);
        progress(`AI review failed: ${ctx.data.llmError}`);
      }
    }
    client?.reserveShare(willAsk ? R.visibility : 0);

    // Stage 4: web search for third-party evidence (category 9, 6.2). Skipped without a search key.
    if (willSearch) {
      signal.throwIfAborted();
      const ext: ExternalData = {};
      try {
        const g = await gatherExternal({ input: record.input, signal, progress, client, fetchPages: config.search.fetchPages });
        const { mentions, reviews, ...gathered } = g;
        Object.assign(ext, { gathered, mentions, reviews });
        const fresh = g.searches.filter((x) => !x.cached && !x.error).length;
        const failed = g.searches.filter((x) => x.error).length;
        record.costs.push({
          provider: g.provider,
          purpose: `Web search: ${g.searches.length} searches (${g.searches.filter((x) => x.cached).length} from cache${failed ? `, ${failed} failed` : ""})`,
          inputTokens: 0,
          outputTokens: 0,
          usd: Math.round(fresh * config.search.usdPerQuery[g.provider] * 10_000) / 10_000,
        });
        if (client) {
          ext.model = client.model;
          ext.judgements = await runExternalReview({ data: ext, input: record.input, siteReview: ctx.data.llm, crawl: ctx.data.crawl, client, signal });
        }
        record.extras.webSearch = webSearchSummary(ext);
      } catch (err) {
        if (signal.aborted) throw err;
        ext.searchError = err instanceof Error ? err.message : String(err);
        progress(`Web search failed: ${ext.searchError}`);
      }
      ctx.data.external = ext;
      void persist();
    }

    client?.reserveShare(0);

    // Stage 5: AI visibility tests: ask Claude customers' questions (9.10–9.13).
    if (record.input.options.runVisibility && client) {
      signal.throwIfAborted();
      try {
        ctx.data.visibility = await runVisibility({ input: record.input, client, signal, progress });
        record.extras.visibility = ctx.data.visibility;
      } catch (err) {
        if (signal.aborted) throw err;
        ctx.data.visibilityError = err instanceof Error ? err.message : String(err);
        progress(`AI visibility tests failed: ${ctx.data.visibilityError}`);
      }
      void persist();
    }

    for (const cat of CATEGORIES) {
      signal.throwIfAborted();
      progress(`Running checks: ${cat.name}…`);
      for (const meta of CHECKS.filter((c) => c.categoryId === cat.id)) {
        signal.throwIfAborted();
        record.results.push(await runCheck(meta, ctx));
      }
    }
    record.score = computeScore(record.results, undefined, { notInBuild: new Set(CHECKS.filter((c) => !getImplementation(c.id)).map((c) => c.id)) });
    record.status = "complete";
    record.completedAt = new Date().toISOString();
    progress("Audit complete");
  } catch (err) {
    if (signal.aborted) {
      record.status = "cancelled";
      progress("Audit cancelled");
    } else {
      record.status = "error";
      record.error = err instanceof Error ? err.message : String(err);
      progress(`Audit failed: ${record.error}`);
    }
  }
  await persist();
  return record;
}

async function loadPrevious(record: AuditRecord): Promise<PreviousAudit | undefined> {
  const prior = (await listAudits()).find((a) => a.domain === record.domain && a.id !== record.id && a.status === "complete" && a.createdAt < record.createdAt);
  if (!prior) return undefined;
  const rec = await loadAudit(prior.id);
  const snapshots = rec?.extras.pageSnapshots as PageSnapshot[] | undefined;
  return rec && snapshots ? { id: rec.id, createdAt: rec.createdAt, snapshots } : undefined;
}

/** Compact, JSON-safe crawl summary saved with the audit (no page bodies). */
export function crawlSummary(c: CrawlData) {
  return {
    origin: c.origin,
    robots: { url: c.robots.url, status: c.robots.status, mode: c.robots.parsed.mode, body: c.robots.body.slice(0, 5000) },
    sitemap: { sources: c.sitemap.sources, urlCount: c.sitemap.urls.length, error: c.sitemap.error },
    llmsTxt: c.llmsTxt,
    pages: c.pages.map((p) => ({ url: p.finalUrl, status: p.status, role: p.role, depth: p.depth, title: p.title, htmlBytes: p.htmlBytes, ttfbMs: p.ttfbMs, words: p.wordCount })),
    skippedByRobots: c.skippedByRobots,
    failedFetches: c.failedFetches,
    documents: c.documents.length,
    assets: c.assets.map((a) => ({ url: a.url, kind: a.kind, status: a.status, bytes: a.bytes, thirdParty: a.thirdParty })),
    botProbes: c.botProbes,
    renders: c.renders,
    renderError: c.renderError,
  };
}

/** What the AI saw and concluded, saved with the audit for transparency (quotes are verified). */
export function webSearchSummary(ext: ExternalData) {
  const g = ext.gathered;
  if (!g) return undefined;
  const about = g.results.filter((r) => r.about === "yes" && r.kind !== "social");
  return {
    provider: g.provider,
    searches: g.searches.map((s) => ({ purpose: s.purpose, query: s.query, count: s.count, cached: s.cached, error: s.error })),
    classifiedBy: g.classifiedBy,
    classifyError: g.classifyError,
    relevantResults: about.length,
    sites: [...new Set(about.map((r) => r.host))],
    judgements: Object.values(ext.judgements ?? {}).map((j) => ({ id: j.id, status: j.verdict?.status ?? "error", error: j.error })),
  };
}

export function aiReviewSummary(r: SiteReview) {
  return {
    model: r.model,
    calls: r.calls,
    tokensUsed: r.tokensUsed,
    reviewedPages: r.reviewedPages,
    skippedPages: r.skippedPages,
    judgements: Object.values(r.judgements).map((j) => ({ id: j.id, status: j.verdict?.status ?? "error", error: j.error, incomplete: j.incomplete, chunks: j.chunks, finding: j.verdict?.finding, quotes: j.verdict?.quotes })),
  };
}

/** Load an audit; if it claims to be running but no job exists (server restarted), mark it interrupted. */
export async function getAudit(id: string): Promise<AuditRecord | null> {
  const rec = await loadAudit(id);
  if (rec && (rec.status === "running" || rec.status === "queued") && !isRunning(id)) {
    rec.status = "error";
    rec.error = "The audit was interrupted (the server restarted). Please run it again.";
    await saveAudit(rec);
  }
  return rec;
}
