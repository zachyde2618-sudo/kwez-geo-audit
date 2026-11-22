import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_NAMES } from "@/config";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput } from "@/lib/schemas/input";
import { startFixtureServer } from "../fixtures/server.mjs";

/**
 * End-to-end audit against the local fixture site (fixtures/site), which deliberately
 * passes some checks and fails others. Runs with no API keys, with Playwright rendering on.
 */

let server: { url: string; state: { aboutDate: string; log: { path: string; ua: string }[] }; close: () => Promise<void> };
let audit: AuditRecord;
const status = (id: string) => audit.results.find((r) => r.id === id)!.status;
const result = (id: string) => audit.results.find((r) => r.id === id)!;

const input = () =>
  parseAuditInput(
    {
      url: server.url,
      companyName: "Bright Spark Electrical",
      industry: "Domestic electricians",
      town: "Leeds",
      people: [
        { fullName: "Jo Bloggs", jobTitle: "Managing Director", linkedinUrl: "https://www.linkedin.com/in/jo-bloggs-electrician" },
        { fullName: "Sam Patel", jobTitle: "Lead EV Installer" },
      ],
      identity: { socialUrls: ["https://www.facebook.com/brightsparkleeds", "https://www.instagram.com/brightsparkleeds"] },
    },
    true,
  );

beforeAll(async () => {
  for (const k of API_KEY_NAMES) delete process.env[k];
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-e2e-"));
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.ENABLE_PLAYWRIGHT = "true";
  server = await startFixtureServer();
  audit = await executeAudit(newAuditRecord(input()), new AbortController().signal);
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("e2e: fixture site audit", () => {
  it("completes and reports all 72 checks", () => {
    expect(audit.status).toBe("complete");
    expect(audit.results).toHaveLength(72);
    expect(audit.score!.overall).not.toBeNull();
  });

  it("crawls politely: our user agent, robots.txt respected", () => {
    const pageRequests = server.state.log.filter((l) => !/Bot|bot\//.test(l.ua.split(" KwezGEOAudit")[0]));
    expect(pageRequests.every((l) => l.ua.startsWith("KwezGEOAudit/1.0 (+"))).toBe(true);
    expect(server.state.log.some((l) => l.path.startsWith("/private/"))).toBe(false);
    const summary = audit.extras.crawlSummary as { skippedByRobots: string[]; pages: { url: string }[] };
    expect(summary.skippedByRobots.some((u) => u.includes("/private/staff.html"))).toBe(true);
    expect(summary.pages.length).toBeGreaterThanOrEqual(7);
  });

  it("crawler accessibility (category 1)", () => {
    expect(status("1.1")).toBe("pass");
    expect(status("1.4")).toBe("fail"); // price list only in a PDF
    expect(result("1.4").evidence.some((e) => e.value.includes("price-list.pdf"))).toBe(true);
    expect(status("1.5")).toBe("fail"); // services page rendered by JavaScript
    expect(result("1.5").pages.some((p) => p.includes("services.html"))).toBe(true);
    expect(status("1.6")).toBe("fail"); // OAI-SearchBot blocked
    expect(status("1.7")).toBe("fail");
    expect(result("1.7").issue).toMatch(/OAI-SearchBot.*so ChatGPT can't/);
    expect(result("1.7").issue).not.toMatch(/Perplexity/); // PerplexityBot is allowed
    expect(result("1.7").notes.join(" ")).toMatch(/llms\.txt/);
    // PerplexityBot probe gets 403 from the fixture
    expect(result("1.6").evidence.some((e) => /PerplexityBot user-agent probe/.test(e.label) && /403/.test(e.value))).toBe(true);
  });

  it("speed and efficiency (category 2)", () => {
    expect(status("2.2")).toBe("pass");
    expect(status("2.5")).toBe("pass");
    expect(status("2.6")).toBe("pass");
    expect(status("2.7")).toBe("pass");
    expect(status("2.8")).toBe("unable");
    expect(status("2.9")).toBe("fail"); // 310 KB, 2400px JPEG shown at 800px
    expect(result("2.9").evidence.some((e) => /2400px wide but displayed at 800px/.test(e.label))).toBe(true);
    expect(status("2.10")).toBe("pass");
    expect(status("2.11")).toBe("pass");
    expect(status("2.12")).toBe("fail"); // two blocking scripts in <head>
    expect(status("2.13")).toBe("pass");
    expect(status("2.14")).toBe("fail"); // YouTube embed, no transcript
    expect(status("2.1")).toBe("unable");
  });

  it("schema (category 5)", () => {
    expect(status("5.1")).toBe("pass");
    expect(status("5.2")).toBe("pass");
    expect(status("5.3")).toBe("fail");
    expect(result("5.3").issue).toMatch(/don't appear on the page/);
    expect(result("5.3").evidence.some((e) => /Profiles missing from sameAs/.test(e.label) && /instagram/.test(e.value))).toBe(true);
    expect(status("5.4")).toBe("fail"); // under 1 in-content internal link per page
    expect(result("5.4").issue).toMatch(/rarely link to each other/);
  });

  it("authority, automated parts (category 6)", () => {
    expect(status("6.1")).toBe("pass");
    expect(status("6.4")).toBe("pass");
    expect(status("6.6")).toBe("fail"); // "Managing Director" vs "Founder & Director"
    expect(status("6.7")).toBe("fail"); // Sam Patel has no Person schema or LinkedIn
    expect(result("6.7").issue).toMatch(/Sam Patel/);
    expect(status("6.8")).toBe("pass");
  });

  it("maintenance (category 8)", () => {
    expect(status("8.2")).toBe("fail"); // About page dateModified Jan 2023; newest post Mar 2025
    expect(status("8.3")).toBe("fail");
    expect(status("8.4")).toBe("unable"); // no earlier audit yet
  });

  it("every non-Unable result cites evidence", () => {
    for (const r of audit.results.filter((r) => r.status !== "unable")) expect(r.evidence.length, r.id).toBeGreaterThan(0);
  });

  it("8.4 detects a date-only change on a second audit", async () => {
    server.state.aboutDate = new Date().toISOString().slice(0, 10); // new date, same text
    const second = await executeAudit(newAuditRecord(input()), new AbortController().signal);
    const r = second.results.find((x) => x.id === "8.4")!;
    expect(r.status).toBe("fail");
    expect(r.pages.some((p) => p.includes("about.html"))).toBe(true);
  }, 120_000);
});
