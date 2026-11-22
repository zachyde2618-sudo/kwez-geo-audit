import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_NAMES } from "@/config";
import { CATEGORIES, CHECKS, CHECK_BY_ID } from "@/lib/checks/catalogue";
import { finaliseResult } from "@/lib/checks/registry";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import { parseAuditInput } from "@/lib/schemas/input";
import { loadAudit } from "@/lib/storage";

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of API_KEY_NAMES) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-audits-"));
});
afterEach(() => {
  for (const k of API_KEY_NAMES) if (saved[k] !== undefined) process.env[k] = saved[k];
  delete process.env.AUDITS_DIR;
});

describe("catalogue", () => {
  it("has exactly 72 checks with unique IDs", () => {
    expect(CHECKS).toHaveLength(72);
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(72);
  });

  it("has the expected number of checks per category and category weights summing to 100", () => {
    const counts = CATEGORIES.map((cat) => CHECKS.filter((c) => c.categoryId === cat.id).length);
    expect(counts).toEqual([7, 14, 7, 4, 4, 8, 6, 6, 16]);
    expect(CATEGORIES.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("only allows Partial where the checklist does", () => {
    expect(CHECKS.filter((c) => c.allowsPartial).map((c) => c.id).sort()).toEqual(["1.6", "1.7", "2.6", "2.7", "8.1", "9.3"].sort());
  });
});

describe("finaliseResult enforces evidence rules", () => {
  const meta = CHECK_BY_ID.get("2.2")!;
  it("downgrades a pass with no evidence to Unable to Verify", () => {
    const r = finaliseResult(meta, { status: "pass" });
    expect(r.status).toBe("unable");
  });
  it("clears issue and requiredChange on Pass", () => {
    const r = finaliseResult(meta, {
      status: "pass",
      issue: "x",
      requiredChange: "y",
      evidence: [{ kind: "url", label: "FAQ page", value: "https://example.co.uk/faq" }],
    });
    expect(r).toMatchObject({ status: "pass", issue: "", requiredChange: "" });
  });
  it("turns Partial into Fail on a pass/fail-only check", () => {
    const r = finaliseResult(meta, { status: "partial", evidence: [{ kind: "note", label: "n", value: "v" }] });
    expect(r.status).toBe("fail");
  });
  it("clips snippets to 300 characters", () => {
    const r = finaliseResult(meta, { status: "fail", evidence: [{ kind: "snippet", label: "q", value: "a".repeat(500) }] });
    expect(r.evidence[0].value.length).toBeLessThanOrEqual(300);
  });
});

describe("end-to-end stub audit with no keys", () => {
  it("reports all 72 checks, each Unable to Verify, with key-specific issues", async () => {
    // .invalid never resolves (RFC 2606), so this stays offline on any machine.
    const input = parseAuditInput({ url: "kwez-test.invalid", companyName: "Example Ltd" });
    const rec = newAuditRecord(input);
    const done = await executeAudit(rec, new AbortController().signal);

    expect(done.status).toBe("complete");
    expect(done.results).toHaveLength(72);
    expect(done.results.map((r) => r.id)).toEqual(CHECKS.map((c) => c.id));
    expect(done.results.every((r) => r.status === "unable")).toBe(true);
    expect(done.results.find((r) => r.id === "3.1")!.issue).toBe("Not checked: ANTHROPIC_API_KEY not configured");
    expect(done.results.find((r) => r.id === "9.1")!.issue).toBe("Not checked: SEARCH_API_KEY not configured");
    expect(done.results.find((r) => r.id === "4.1")!.notes[0]).toMatch(/Kwez can run this/);
    expect(done.score!.overall).toBeNull();
    expect(done.score!.coveragePct).toBe(0);

    const persisted = await loadAudit(done.id);
    expect(persisted!.results).toHaveLength(72);
  });

  it("stops and records cancellation when aborted", async () => {
    const rec = newAuditRecord(parseAuditInput({ url: "kwez-test.invalid" }));
    const ctl = new AbortController();
    ctl.abort();
    const done = await executeAudit(rec, ctl.signal);
    expect(done.status).toBe("cancelled");
  });
});
