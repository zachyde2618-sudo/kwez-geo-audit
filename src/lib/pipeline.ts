import { randomUUID } from "node:crypto";
import { API_KEY_NAMES, hasKey } from "@/config";
import { CATEGORIES, CHECKS } from "@/lib/checks/catalogue";
import { snapshotPages } from "@/lib/checks/cat8";
import { runCheck } from "@/lib/checks/registry";
import type { CheckContext, PageSnapshot, PreviousAudit } from "@/lib/checks/types";
import { crawlSite } from "@/lib/crawler/crawl";
import type { CrawlData } from "@/lib/crawler/types";
import type { AuditRecord } from "@/lib/schemas/audit";
import type { AuditInput } from "@/lib/schemas/input";
import { computeScore } from "@/lib/scoring";
import { listAudits, loadAudit, saveAudit } from "@/lib/storage";

/** In-memory registry of running audits. Survives Next dev hot reloads via globalThis. */
const g = globalThis as unknown as { __kwezJobs?: Map<string, AbortController> };
const jobs: Map<string, AbortController> = (g.__kwezJobs ??= new Map());

export function isRunning(id: string): boolean {
  return jobs.has(id);
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

/** Create, persist and start an audit in the background. Returns the record. */
export async function startAudit(input: AuditInput): Promise<AuditRecord> {
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
      progress(`Crawled ${ctx.data.crawl.pages.length} page(s)`);
    } catch (err) {
      if (signal.aborted) throw err;
      ctx.data.crawlError = err instanceof Error ? err.message : String(err);
      progress(`Crawl failed: ${ctx.data.crawlError}`);
    }
    ctx.data.previous = await loadPrevious(record);
    // Later phases insert LLM and external stages here.

    for (const cat of CATEGORIES) {
      signal.throwIfAborted();
      progress(`Running checks: ${cat.name}…`);
      for (const meta of CHECKS.filter((c) => c.categoryId === cat.id)) {
        signal.throwIfAborted();
        record.results.push(await runCheck(meta, ctx));
      }
    }
    record.score = computeScore(record.results);
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
