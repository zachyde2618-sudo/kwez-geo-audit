import { randomUUID } from "node:crypto";
import { API_KEY_NAMES, hasKey } from "@/config";
import { CATEGORIES, CHECKS } from "@/lib/checks/catalogue";
import { runCheck } from "@/lib/checks/registry";
import type { CheckContext } from "@/lib/checks/types";
import type { AuditRecord } from "@/lib/schemas/audit";
import type { AuditInput } from "@/lib/schemas/input";
import { computeScore } from "@/lib/scoring";
import { loadAudit, saveAudit } from "@/lib/storage";

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
    // Later phases insert stages here: discover → fetch → LLM → external.
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
