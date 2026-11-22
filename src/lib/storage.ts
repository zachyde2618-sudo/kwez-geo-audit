import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/config";
import type { AuditRecord, AuditSummary } from "@/lib/schemas/audit";

const ID_RE = /^[a-z0-9-]{8,64}$/;

export function isValidAuditId(id: string): boolean {
  return ID_RE.test(id);
}

function fileFor(id: string): string {
  if (!isValidAuditId(id)) throw new Error("Invalid audit id");
  return path.join(config.storage.auditsDir, `${id}.json`);
}

export async function saveAudit(record: AuditRecord): Promise<void> {
  await fs.mkdir(config.storage.auditsDir, { recursive: true });
  const target = fileFor(record.id);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
  await fs.rename(tmp, target); // atomic replace
}

export async function loadAudit(id: string): Promise<AuditRecord | null> {
  if (!isValidAuditId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(fileFor(id), "utf8")) as AuditRecord;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function listAudits(): Promise<AuditSummary[]> {
  let files: string[];
  try {
    files = await fs.readdir(config.storage.auditsDir);
  } catch {
    return [];
  }
  const out: AuditSummary[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const rec = await loadAudit(f.slice(0, -5)).catch(() => null);
    if (!rec) continue;
    out.push({
      id: rec.id,
      domain: rec.domain,
      companyName: rec.input.companyName,
      createdAt: rec.createdAt,
      status: rec.status,
      overall: rec.score?.overall ?? null,
      coveragePct: rec.score?.coveragePct ?? null,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
