import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_ENV_VARS } from "@/config";
import { DELETE, PATCH } from "@/app/api/audits/[id]/route";
import { POST as RERUN } from "@/app/api/audits/[id]/rerun/route";
import { auditedOn } from "@/lib/format";
import { isRunning, newAuditRecord, startAudit } from "@/lib/pipeline";
import { parseAuditInput } from "@/lib/schemas/input";
import { listAudits, loadAudit, loadFavourites, saveAudit, setFavourite } from "@/lib/storage";
import { startFixtureServer } from "../fixtures/server.mjs";

/** Past audits: favourites, delete (including while running), run again, and dates. */

let server: { url: string; close: () => Promise<void> };
const saved: Record<string, string | undefined> = {};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => new Request("http://test", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

async function savedAudit(companyName = "Bright Spark Electrical") {
  const rec = newAuditRecord(parseAuditInput({ url: server.url, companyName, town: "Leeds", people: [{ fullName: "Jo Bloggs" }] }, true));
  rec.status = "complete";
  await saveAudit(rec);
  return rec;
}

beforeAll(async () => {
  for (const k of API_KEY_ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.BOT_UA_PROBES = "false";
  server = await startFixtureServer();
}, 60_000);
beforeEach(() => {
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-manage-"));
});
afterAll(async () => {
  await server?.close();
  for (const k of API_KEY_ENV_VARS) if (saved[k] !== undefined) process.env[k] = saved[k];
});

describe("favourites", () => {
  it("marks and unmarks an audit, and the list reports it", async () => {
    const a = await savedAudit();
    const b = await savedAudit("Volt Leeds");
    expect((await PATCH(json({ favourite: true }), ctx(a.id))).status).toBe(200);
    const list = await listAudits();
    expect(list).toHaveLength(2); // the favourites file isn't mistaken for an audit
    expect(list.find((x) => x.id === a.id)!.favourite).toBe(true);
    expect(list.find((x) => x.id === b.id)!.favourite).toBe(false);
    await PATCH(json({ favourite: false }), ctx(a.id));
    expect((await loadFavourites()).size).toBe(0);
  });

  it("keeps every update when several arrive at once", async () => {
    const ids = await Promise.all([1, 2, 3, 4, 5].map((n) => savedAudit(`Business ${n}`).then((r) => r.id)));
    await Promise.all(ids.map((id) => setFavourite(id, true)));
    expect((await loadFavourites()).size).toBe(5);
  });

  it("survives the audit itself being re-saved (favourites live in their own file)", async () => {
    const a = await savedAudit();
    await setFavourite(a.id, true);
    await saveAudit({ ...a, updatedAt: new Date().toISOString() });
    expect((await listAudits())[0].favourite).toBe(true);
  });

  it("rejects bad requests", async () => {
    const a = await savedAudit();
    expect((await PATCH(json({ favourite: "yes" }), ctx(a.id))).status).toBe(400);
    expect((await PATCH(json({ favourite: true }), ctx("2026-01-01-nothere1"))).status).toBe(404);
  });
});

describe("delete", () => {
  it("removes the audit and its favourite mark", async () => {
    const a = await savedAudit();
    await setFavourite(a.id, true);
    expect((await DELETE(new Request("http://test"), ctx(a.id))).status).toBe(204);
    expect(await loadAudit(a.id)).toBeNull();
    expect((await loadFavourites()).has(a.id)).toBe(false);
    expect((await DELETE(new Request("http://test"), ctx(a.id))).status).toBe(404);
    expect((await DELETE(new Request("http://test"), ctx("../etc/passwd"))).status).toBe(404);
  });

  it("cancels a running audit and it doesn't come back", async () => {
    const rec = await startAudit(parseAuditInput({ url: server.url, companyName: "Bright Spark Electrical" }, true));
    expect(isRunning(rec.id)).toBe(true);
    expect((await DELETE(new Request("http://test"), ctx(rec.id))).status).toBe(204);
    expect(isRunning(rec.id)).toBe(false);
    await new Promise((r) => setTimeout(r, 1500)); // a late progress save would re-create the file
    expect(existsSync(path.join(process.env.AUDITS_DIR!, `${rec.id}.json`))).toBe(false);
    expect(readdirSync(process.env.AUDITS_DIR!).filter((f) => f.endsWith(".json"))).toEqual([]);
  }, 30_000);
});

describe("run again", () => {
  it("starts a new audit with the same details and keeps the old one", async () => {
    const a = await savedAudit();
    const res = await RERUN(new Request("http://test", { method: "POST" }), ctx(a.id));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).not.toBe(a.id);
    const fresh = await loadAudit(id);
    expect(fresh!.input).toEqual(a.input);
    expect(await loadAudit(a.id)).not.toBeNull();
    await DELETE(new Request("http://test"), ctx(id)); // stop the background run
  }, 30_000);

  it("returns 404 for an unknown audit", async () => {
    expect((await RERUN(new Request("http://test", { method: "POST" }), ctx("2026-01-01-nothere1"))).status).toBe(404);
  });
});

describe("dates", () => {
  it("shows the date and time the audit was run, in UK time", () => {
    expect(auditedOn("2026-11-22T14:09:00.000Z")).toBe("22 Nov 2026 at 14:09");
    expect(auditedOn("2026-07-01T08:30:00.000Z")).toBe("1 Jul 2026 at 09:30"); // BST
  });
});
