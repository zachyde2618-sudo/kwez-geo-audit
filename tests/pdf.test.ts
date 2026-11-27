import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ENV_VARS } from "@/config";
import { arcPath, breakable, clientFacing, pdfFileName, renderReportPdf } from "@/lib/pdf/report";
import { PDF_COLOURS } from "@/lib/pdf/theme";
import { shareMessage } from "@/lib/share";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput } from "@/lib/schemas/input";
import type { VisibilityData } from "@/lib/visibility/run";
import { startFixtureServer } from "../fixtures/server.mjs";

/** The client PDF, made from a real audit of the fixture site (no API keys, no network). */

let server: { url: string; close: () => Promise<void> };
let audit: AuditRecord;

beforeAll(async () => {
  for (const k of API_KEY_ENV_VARS) delete process.env[k];
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-pdf-"));
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  server = await startFixtureServer();
  const input = parseAuditInput({ url: server.url, companyName: "Bright Spark Electrical", industry: "Domestic electricians", town: "Leeds" }, true);
  audit = await executeAudit(newAuditRecord(input), new AbortController().signal);
  // Add some visibility answers so that section is drawn too.
  const visibility: VisibilityData = {
    provider: "anthropic",
    label: "Claude",
    model: "test",
    promptSource: "generated",
    answers: [
      { prompt: "Who is a good electrician in Leeds for an EV charger?", mentioned: true, recommended: true, others: [] },
      { prompt: "Best emergency electrician near Headingley?", mentioned: false, recommended: false, others: ["Volt Bros", "Leeds Sparks"] },
      { prompt: "Who can rewire a Victorian terrace in Leeds?", mentioned: false, recommended: false, others: [], error: "timeout" },
    ] as VisibilityData["answers"],
  };
  audit.extras.visibility = visibility;
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("client PDF report", () => {
  it("renders a finished audit as a multi-page PDF", async () => {
    expect(audit.status).toBe("complete");
    const pdf = await renderReportPdf(audit);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
  }, 60_000);

  it("refuses an audit that hasn't finished", async () => {
    await expect(renderReportPdf({ ...audit, status: "running" })).rejects.toThrow(/finished/);
  });

  it("names the file after the business and the audit date", () => {
    expect(pdfFileName(audit)).toBe(`kwez-geo-audit-bright-spark-electrical-${audit.createdAt.slice(0, 10)}.pdf`);
    expect(pdfFileName({ ...audit, input: { ...audit.input, companyName: "Café & Co. Ltd!" } })).toMatch(/^kwez-geo-audit-cafe-co-ltd-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("keeps setup notes meant for Kwez out of the client's copy", () => {
    const unable = audit.results.find((r) => r.status === "unable" && /API_KEY/.test(r.issue + r.requiredChange))!;
    expect(clientFacing(unable)).toEqual({ issue: "Not assessed in this audit.", change: "" });
    const failing = audit.results.find((r) => r.status === "fail")!;
    expect(clientFacing(failing)).toEqual({ issue: failing.issue, change: failing.requiredChange });
  });

  it("lets long web addresses wrap", () => {
    expect(breakable("example.com/a/b")).toBe("example.​com/​a/​b");
  });

  it("draws the score arc from 12 o'clock", () => {
    expect(arcPath(50, 50, 40, 25)).toBe("M 50 10 A 40 40 0 0 1 90.00 50.00");
    expect(arcPath(50, 50, 40, 75)).toMatch(/ 0 1 1 10\.00 50\.00$/);
  });

  it("uses the same colours as tokens.css", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/tokens.css"), "utf8");
    for (const [name, hex] of Object.entries(PDF_COLOURS)) {
      const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
      expect(m?.[1]?.toLowerCase(), name).toBe(hex);
    }
  });
});

describe("sending the report", () => {
  it("writes a short email that mentions the score", () => {
    const m = shareMessage({ name: "Bright Spark Electrical", score: 55, band: "Developing" });
    expect(m.subject).toBe("Your AI visibility audit from Kwez: Bright Spark Electrical");
    expect(m.body).toContain("Please find attached the GEO audit for Bright Spark Electrical. It scores 55 out of 100 (Developing) for how easily");
    expect(shareMessage({ name: "X", score: null, band: null }).body).not.toContain("scores");
  });
});
