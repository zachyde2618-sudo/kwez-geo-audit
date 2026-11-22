import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_NAMES, config } from "@/config";
import { CHECK_BY_ID } from "@/lib/checks/catalogue";
import { setLlmTransportForTests } from "@/lib/llm/client";
import { CRITERIA, SITE_CRITERIA } from "@/lib/llm/rubrics";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput } from "@/lib/schemas/input";
import { startFixtureServer } from "../fixtures/server.mjs";
import { fakeMessage, scriptedTransport, criteriaInPrompt, userText } from "./llm-helpers";

/**
 * End-to-end audit of the fixture site with the AI review enabled, using a fake transport
 * (no network calls to Anthropic). Checks the pipeline wiring, quote verification, cost
 * logging and the rule that every LLM verdict is backed by verbatim evidence.
 */

let server: { url: string; close: () => Promise<void> };
const saved: Record<string, string | undefined> = {};

const input = () =>
  parseAuditInput(
    { url: server.url, companyName: "Bright Spark Electrical", industry: "Domestic electricians", town: "Leeds", services: ["House rewires", "EV charger installation"] },
    true,
  );

beforeAll(async () => {
  for (const k of API_KEY_NAMES) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = "test-key-not-used";
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-llm-e2e-"));
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.BOT_UA_PROBES = "false";
  server = await startFixtureServer();
}, 60_000);

afterAll(async () => {
  setLlmTransportForTests(null);
  await server?.close();
  for (const k of API_KEY_NAMES) if (saved[k] !== undefined) process.env[k] = saved[k];
  else delete process.env[k];
});

describe("e2e: AI review with valid model output", () => {
  let audit: AuditRecord;
  let calls: ReturnType<typeof scriptedTransport>["calls"];

  beforeAll(async () => {
    // worst-mode criteria report a problem, best-mode report the good thing; both must quote.
    const s = scriptedTransport((id) => (CRITERIA[id].mode === "worst" ? "fail" : "pass"));
    calls = s.calls;
    setLlmTransportForTests(s.transport);
    audit = await executeAudit(newAuditRecord(input()), new AbortController().signal);
  }, 120_000);

  it("runs every site criterion through the judge model and completes", () => {
    expect(audit.status).toBe("complete");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.every((c) => c.model === "claude-sonnet-5-5")).toBe(true);
    const judged = new Set(calls.flatMap((c) => criteriaInPrompt(userText(c))));
    expect([...judged].sort()).toEqual([...SITE_CRITERIA].sort());
  });

  it("logs a cost entry for every request", () => {
    expect(audit.costs).toHaveLength(calls.length);
    expect(audit.costs.every((c) => c.provider === "anthropic" && c.usd > 0)).toBe(true);
    expect(audit.progress.some((p) => /AI review complete/.test(p.message))).toBe(true);
  });

  it("turns judgements into results with verbatim quoted evidence", () => {
    for (const id of SITE_CRITERIA) {
      const r = audit.results.find((x) => x.id === id)!;
      expect(r.issue, id).not.toMatch(/ANTHROPIC_API_KEY not configured/);
      if (r.status === "unable") continue;
      expect(r.evidence.some((e) => e.kind === "snippet" && e.label.startsWith("Quoted from")), id).toBe(true);
    }
    const r32 = audit.results.find((r) => r.id === "3.2")!;
    expect(r32).toMatchObject({ status: "fail", method: "llm", issue: "Test finding for 3.2." });
    expect(r32.requiredChange).toBe(CRITERIA["3.2"].fix);
    expect(audit.results.find((r) => r.id === "7.1")!.status).toBe("pass");
  });

  it("scores LLM-judged checks with code, not model output", () => {
    expect(audit.score!.overall).not.toBeNull();
    const cat3 = audit.score!.categories.find((c) => c.categoryId === 3)!;
    expect(cat3.score).not.toBeNull();
  });

  it("combines A+L checks and leaves Phase 5 external judgements unchecked", () => {
    expect(audit.results.find((r) => r.id === "2.13")!.status).toBe("fail"); // AI part says fail → worse part decides
    expect(audit.results.find((r) => r.id === "9.7")!.issue).toMatch(/build phase 5/);
    expect(CHECK_BY_ID.get("9.7")!.requires).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("saves what the AI saw and concluded with the audit", () => {
    const summary = audit.extras.aiReview as { model: string; judgements: { id: string }[]; reviewedPages: string[] };
    expect(summary.model).toBe(config.llm.judgeModel);
    expect(summary.judgements).toHaveLength(SITE_CRITERIA.length);
    expect(summary.reviewedPages.length).toBeGreaterThan(0);
  });
});

describe("e2e: AI review with fabricated quotes", () => {
  it("rejects and retries, then reports Unable to Verify instead of trusting the model", async () => {
    let n = 0;
    setLlmTransportForTests(async (params) => {
      n++;
      const ids = criteriaInPrompt(userText(params));
      return fakeMessage({ verdicts: ids.map((id) => ({ id, status: "fail", finding: "Made up.", quotes: [{ url: server.url, quote: "This sentence is not on the site at all." }] })) });
    });
    const audit = await executeAudit(newAuditRecord(input()), new AbortController().signal);
    expect(audit.status).toBe("complete");
    const r31 = audit.results.find((r) => r.id === "3.1")!;
    expect(r31.status).toBe("unable");
    expect(r31.issue).toMatch(/invalid output 3 time\(s\)/);
    expect(n).toBe(audit.costs.length);
    expect(audit.costs.some((c) => /retry 2/.test(c.purpose))).toBe(true);
    // A+L checks fall back to their automated part
    const r14 = audit.results.find((r) => r.id === "1.4")!;
    expect(r14.status).not.toBe("unable");
    expect(r14.notes.join(" ")).toMatch(/AI review part not assessed/);
  }, 120_000);
});
