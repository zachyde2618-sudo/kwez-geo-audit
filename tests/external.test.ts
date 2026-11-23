import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ENV_VARS } from "@/config";
import { planQueries, ruleKind } from "@/lib/external/gather";
import { setSearchTransportForTests, type SearchRequest, type SearchResult } from "@/lib/external/search";
import { setLlmTransportForTests, type LlmTransport } from "@/lib/llm/client";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput } from "@/lib/schemas/input";
import { startFixtureServer } from "../fixtures/server.mjs";
import { fakeMessage, scriptedTransport, userText } from "./llm-helpers";
import { CRITERIA } from "@/lib/llm/rubrics";

/**
 * The web search stage end to end: fake search results and a fake AI (no network), the real
 * pipeline, crawler and checks. Covers query planning, de-duplication, classification,
 * scoring of each external check, cost logging and the search cache.
 */

let server: { url: string; close: () => Promise<void> };
const saved: Record<string, string | undefined> = {};
const searchLog: SearchRequest[] = [];

const R = (url: string, title: string, snippet: string, extra: Partial<SearchResult> = {}): SearchResult => ({ url, title, snippet, ...extra });

/** Canned results per kind of query. */
function fakeResults(q: string): SearchResult[] {
  if (q.includes("Jo Bloggs") && q.includes("Bright Spark")) return [R("https://www.niceic.com/contractors/bright-spark", "Bright Spark Electrical – NICEIC approved contractor", "Bright Spark Electrical, Leeds. Contact: Jo Bloggs, Managing Director.")];
  if (q.includes("Jo Bloggs")) return [R("https://electricalsafetyfirst.org.uk/events/2025", "Electrical Safety Week 2025 speakers", "Jo Bloggs, managing director of a Leeds electrical contractor, speaker on EV charging safety.")];
  if (q.includes("Sam Patel")) return [R("https://example.org/sam-patel-chef", "Sam Patel, chef", "Sam Patel runs a restaurant in Bristol.")];
  if (q.startsWith("best ")) return [
    R("https://www.leedslist.co.uk/best-electricians", "10 best electricians in Leeds (2026)", "Our pick of Leeds electricians: Bright Spark Electrical, Volt Leeds, Sparky Co…"),
    R("https://www.threebestrated.co.uk/electricians-in-leeds", "3 Best Electricians in Leeds", "Handpicked top 3 electricians in Leeds: Volt Leeds, Sparky Co, Amp Masters."),
  ];
  if (q.includes(" reviews")) return [
    R("https://www.trustpilot.com/review/brightspark.co.uk", "Bright Spark Electrical Reviews", "Bright Spark Electrical has 5 stars! Check out what 48 people have written.", { rating: 4.9, ratingCount: 48 }),
    R("https://www.checkatrade.com/trades/brightsparkelectrical", "Bright Spark Electrical | Checkatrade", "Jo rewired our 3-bed terrace in Headingley in four days and left it spotless."),
  ];
  if (q.includes("award")) return [R("https://www.niceic.com/contractors/bright-spark", "Bright Spark Electrical – NICEIC approved contractor", "Bright Spark Electrical, Leeds. Contact: Jo Bloggs, Managing Director.")];
  if (q.startsWith("localhost")) return [R("https://www.leedsbusinesshub.co.uk/members", "Members – Leeds Business Hub", "Bright Spark Electrical (localhost) – electricians in Leeds.")];
  // brand / local
  return [
    R("https://www.yell.com/biz/bright-spark-electrical-leeds-123/", "Bright Spark Electrical, Leeds | Electricians - Yell", "Bright Spark Electrical, 12 Kirkgate, Leeds LS1 6BY. Rewires, EV chargers and EICRs."),
    R("https://www.yorkshireeveningpost.co.uk/business/leeds-electrician-award", "Leeds electricians win regional award", "Bright Spark Electrical was named Yorkshire's best small contractor."),
    R("https://www.brightsparkbristol.co.uk/", "Bright Spark Ltd – Bristol event lighting", "Bright Spark Ltd hires stage lighting in Bristol."),
    R("https://www.facebook.com/brightsparkleeds", "Bright Spark Electrical | Facebook", "Bright Spark Electrical, Leeds. 120 likes."),
  ];
}

/** Fake AI: answers the classification prompt by simple rules, and the check rubrics via scriptedTransport. */
function fakeAi(): LlmTransport {
  const judge = scriptedTransport((id) => (CRITERIA[id].mode === "worst" ? "fail" : "pass")).transport;
  return async (params, opts) => {
    if (!String(params.system).includes("You classify web search results")) return judge(params, opts);
    const prompt = userText(params);
    const results = [...prompt.matchAll(/\[(\d+)\] \(found by: [^)]*\) ([^\n]*)\nURL: ([^\n]*)\n([^\n]*)/g)].map((m) => {
      const [, n, title, url, snippet] = m;
      const text = `${title} ${snippet}`;
      const about = /Bright Spark Electrical|electrical contractor|localhost/.test(text) && !/Bristol/.test(text) ? "yes" : "no";
      const kind = url.includes("trustpilot") || url.includes("checkatrade") ? "review_platform"
        : url.includes("yell") ? "directory"
        : url.includes("eveningpost") ? "news"
        : url.includes("niceic") ? "award_or_accreditation"
        : url.includes("electricalsafetyfirst") ? "professional_body"
        : /best|leedslist/.test(url) ? "ranking_or_comparison"
        : url.includes("facebook") ? "social" : "other";
      return {
        n: Number(n),
        about_business: about,
        kind,
        people_linked: about === "yes" && text.includes("Jo Bloggs") ? ["Jo Bloggs"] : [],
        people_credentials: /speaker/.test(text) && text.includes("Jo Bloggs") ? ["Jo Bloggs"] : [],
      };
    });
    return fakeMessage({ results }, { input: 3000, output: 400 });
  };
}

const input = (people = [{ fullName: "Jo Bloggs", jobTitle: "Managing Director" }, { fullName: "Sam Patel", jobTitle: "Lead EV Installer" }]) =>
  parseAuditInput({ url: server.url, companyName: "Bright Spark Electrical", industry: "Domestic electricians", town: "Leeds", people }, true);

beforeAll(async () => {
  for (const k of API_KEY_ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = "test-key-not-used";
  process.env.SEARCH_API_KEY = "test-search-key";
  process.env.SEARCH_API_PROVIDER = "serper";
  process.env.EXTERNAL_FETCH_PAGES = "0";
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-ext-"));
  process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "kwez-ext-cache-"));
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.BOT_UA_PROBES = "false";
  server = await startFixtureServer();
  setSearchTransportForTests(async (req) => {
    searchLog.push(req);
    return fakeResults(req.query);
  });
  setLlmTransportForTests(fakeAi());
}, 60_000);

afterAll(async () => {
  setSearchTransportForTests(null);
  setLlmTransportForTests(null);
  await server?.close();
  for (const k of [...API_KEY_ENV_VARS, "SEARCH_API_PROVIDER", "EXTERNAL_FETCH_PAGES", "CACHE_DIR"]) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
    else delete process.env[k];
  }
});

describe("query planning", () => {
  it("plans brand, review, recognition, local, ranking, domain and per-person searches", () => {
    const plan = planQueries(parseAuditInput({ url: "https://brightspark.co.uk", companyName: "Bright Spark", industry: "Electricians", town: "Leeds", people: [{ fullName: "Jo Bloggs" }] }, false));
    expect(plan.map((p) => p.purpose)).toEqual(["brand", "reviews", "recognition", "local", "ranking", "domain", "person", "expertise"]);
    expect(plan[0].query).toBe('"Bright Spark" -site:brightspark.co.uk');
    expect(plan.find((p) => p.purpose === "ranking")!.query).toBe("best Electricians in Leeds");
  });
  it("recognises well-known hosts", () => {
    expect(ruleKind("trustpilot.com")).toBe("review_platform");
    expect(ruleKind("yell.com")).toBe("directory");
    expect(ruleKind("cqc.org.uk")).toBe("other");
    expect(ruleKind("gov.uk")).toBe("other");
    expect(ruleKind("leeds.gov.uk")).toBe("professional_body");
    expect(ruleKind("facebook.com")).toBe("social");
  });
});

describe("e2e: web search stage", () => {
  let audit: AuditRecord;
  const r = (id: string) => audit.results.find((x) => x.id === id)!;

  beforeAll(async () => {
    audit = await executeAudit(newAuditRecord(input()), new AbortController().signal);
  }, 120_000);

  it("runs the planned searches once each and logs the cost", () => {
    expect(searchLog).toHaveLength(10); // 6 business searches + 2 for each of 2 people
    const cost = audit.costs.find((c) => c.provider === "serper")!;
    expect(cost.purpose).toBe("Web search: 10 searches (0 from cache)");
    expect(cost.usd).toBeCloseTo(0.01, 5);
  });

  it("scores each external check from the classified results", () => {
    expect(r("9.1").status).toBe("pass"); // news coverage
    expect(r("9.2").status).toBe("pass"); // Yell, news
    expect(r("9.3").status).toBe("partial"); // one site shows the address, not an authoritative one
    expect(r("9.4").status).toBe("pass"); // listed in a "best electricians in Leeds" article
    expect(r("9.6").status).toBe("pass"); // Trustpilot, Checkatrade
    expect(r("9.8").status).toBe("fail");
    expect(r("9.8").issue).toMatch(/No testimonials, case studies/);
    expect(r("9.16").status).toBe("pass"); // NICEIC, award news
    expect(r("6.2").status).toBe("pass"); // Jo Bloggs speaking at a professional event
    expect(r("9.15").status).toBe("fail");
    expect(r("9.15").issue).toMatch(/Sam Patel/);
    expect(r("9.15").issue).not.toMatch(/Jo Bloggs/);
  });

  it("runs the AI judgements on third-party text (9.5, 9.7, 9.9)", () => {
    expect(r("9.5").status).toBe("fail"); // scripted: worst-mode criteria fail
    expect(r("9.7").status).toBe("pass");
    expect(r("9.9").status).toBe("pass");
    for (const id of ["9.5", "9.7"]) expect(r(id).evidence.some((e) => e.kind === "snippet")).toBe(true);
  });

  it("ignores results about other businesses and social media when counting", () => {
    const summary = audit.extras.webSearch as { sites: string[]; classifiedBy: string; searches: unknown[] };
    expect(summary.classifiedBy).toBe("ai");
    expect(summary.sites).not.toContain("brightsparkbristol.co.uk");
    expect(summary.sites).not.toContain("facebook.com");
    expect(summary.sites).toContain("trustpilot.com");
  });

  it("backs every external result with a linked, externally verified source", () => {
    for (const id of ["9.1", "9.2", "9.4", "9.6", "9.16"]) {
      const sources = r(id).evidence.filter((e) => e.kind === "api");
      expect(sources.length, id).toBeGreaterThan(0);
      for (const e of sources) {
        expect(e.url, id).toMatch(/^https:\/\//);
        expect(e.verification, id).toBe("verified_externally");
      }
    }
  });

  it("uses the cache on a re-run instead of spending credits", async () => {
    const before = searchLog.length;
    const again = await executeAudit(newAuditRecord(input()), new AbortController().signal);
    expect(searchLog.length).toBe(before);
    expect(again.costs.find((c) => c.provider === "serper")!.purpose).toBe("Web search: 10 searches (10 from cache)");
    expect(again.results.find((x) => x.id === "9.1")!.status).toBe("pass");
  }, 120_000);
});

describe("e2e: web search failures", () => {
  it("reports Unable to Verify with the reason when every search fails", async () => {
    setSearchTransportForTests(async () => {
      throw new Error("Serper returned 401 (check SEARCH_API_KEY)");
    });
    process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "kwez-ext-cache2-"));
    try {
      const audit = await executeAudit(newAuditRecord(input([])), new AbortController().signal);
      for (const id of ["9.1", "9.6", "9.7"]) {
        const res = audit.results.find((x) => x.id === id)!;
        expect(res.status, id).toBe("unable");
        expect(res.issue, id).toMatch(/web search failed \(Serper returned 401/);
      }
    } finally {
      setSearchTransportForTests(async (req) => fakeResults(req.query));
    }
  }, 120_000);
});
