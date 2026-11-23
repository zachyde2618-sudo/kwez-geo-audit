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

/** Remove an audit's file (and its favourite mark). Returns false if it didn't exist. */
export async function deleteAuditFile(id: string): Promise<boolean> {
  if (!isValidAuditId(id)) return false;
  await setFavourite(id, false);
  try {
    await fs.unlink(fileFor(id));
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

// Favourites live in their own file so a running audit saving its progress can't overwrite them.
// The leading underscore keeps it from being read as an audit (ids are [a-z0-9-]).
const favouritesFile = () => path.join(config.storage.auditsDir, "_favourites.json");
let favouritesLock: Promise<unknown> = Promise.resolve();

export async function loadFavourites(): Promise<Set<string>> {
  try {
    const ids = JSON.parse(await fs.readFile(favouritesFile(), "utf8")) as unknown;
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && isValidAuditId(x)) : []);
  } catch {
    return new Set();
  }
}

export function setFavourite(id: string, on: boolean): Promise<void> {
  // Serialise read-modify-write so two quick clicks can't lose an update.
  const run = favouritesLock.then(async () => {
    const favs = await loadFavourites();
    if (on === favs.has(id)) return;
    if (on) favs.add(id);
    else favs.delete(id);
    await fs.mkdir(config.storage.auditsDir, { recursive: true });
    const tmp = `${favouritesFile()}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify([...favs]), "utf8");
    await fs.rename(tmp, favouritesFile());
  });
  favouritesLock = run.catch(() => {});
  return run;
}

export async function listAudits(): Promise<AuditSummary[]> {
  let files: string[];
  try {
    files = await fs.readdir(config.storage.auditsDir);
  } catch {
    return [];
  }
  const favourites = await loadFavourites();
  const out: AuditSummary[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const rec = await loadAudit(f.slice(0, -5)).catch(() => null);
    if (!rec) continue;
    out.push({
      favourite: favourites.has(rec.id),
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
