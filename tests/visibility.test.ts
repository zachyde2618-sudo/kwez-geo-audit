import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ENV_VARS } from "@/config";
import { setSearchTransportForTests } from "@/lib/external/search";
import { setLlmTransportForTests, type LlmParams, type LlmTransport } from "@/lib/llm/client";
import { CRITERIA } from "@/lib/llm/rubrics";
import { executeAudit, newAuditRecord } from "@/lib/pipeline";
import type { AuditRecord } from "@/lib/schemas/audit";
import { parseAuditInput } from "@/lib/schemas/input";
import type { VisibilityData } from "@/lib/visibility/run";
import { startFixtureServer } from "../fixtures/server.mjs";
import { fakeMessage, scriptedTransport, userText } from "./llm-helpers";

/**
 * AI visibility tests (9.10–9.13) end to end with a fake Claude: question writing, answers
 * with web search and citations, paused turns, reading who was named, costs, and scoring.
 */

let server: { url: string; close: () => Promise<void> };
const saved: Record<string, string | undefined> = {};
const asked: LlmParams[] = [];
let questionAttempts = 0;

const QUESTIONS = [
  "Who is the best electrician in Leeds?",
  "How much does a house rewire cost in Leeds?",
  "Recommended EV charger installers near Leeds",
  "Electrician for an EICR certificate in Leeds",
  "How do I choose an electrician in West Yorkshire?",
];

/** A Messages API answer with a web search, a citation and some text. */
function answer(text: string, cites: { url: string; title: string }[], stop: BetaMessage["stop_reason"] = "end_turn", withCitations = true): BetaMessage {
  const msg = fakeMessage("", { stop }) as unknown as { content: unknown[]; usage: Record<string, unknown> };
  msg.content = [
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "q" } },
    { type: "web_search_tool_result", tool_use_id: "srv_1", content: cites.map((c) => ({ type: "web_search_result", url: c.url, title: c.title, encrypted_content: "x", page_age: null })) },
    { type: "text", text, citations: !withCitations ? null : cites.map((c) => ({ type: "web_search_result_location", url: c.url, title: c.title, cited_text: text.slice(0, 20), encrypted_index: "x" })) },
  ];
  msg.usage = { ...msg.usage, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } };
  return msg as unknown as BetaMessage;
}

function fakeClaude(): LlmTransport {
  const judge = scriptedTransport((id) => (CRITERIA[id].mode === "worst" ? "fail" : "pass")).transport;
  return async (params, opts) => {
    const system = String(params.system ?? "");
    if (system.includes("You write the questions")) {
      questionAttempts++;
      // First attempt names the business, which must be rejected and retried.
      const qs = questionAttempts === 1 ? [...QUESTIONS.slice(0, 4), "Is Bright Spark Electrical any good?"] : QUESTIONS;
      return fakeMessage({ questions: qs });
    }
    if (system.includes("You read AI assistant answers")) {
      const prompt = userText(params);
      const answers = [...prompt.matchAll(/\[(\d+)\] Question: [^\n]*\nAnswer:\n([\s\S]*?)(?=\n\n---\n\n\[|$)/g)].map((m) => ({
        n: Number(m[1]),
        mentioned: m[2].includes("Bright Spark"),
        recommended: m[2].includes("Bright Spark") && m[2].includes("recommend"),
        others: [...m[2].matchAll(/(Volt Leeds|Sparky Co|Amp Masters)/g)].map((x) => x[1]),
      }));
      return fakeMessage({ answers });
    }
    if (params.tools?.some((t) => "type" in t && t.type === "web_search_20260209")) {
      asked.push(params);
      const q = userText(params);
      const isContinuation = params.messages.length > 1;
      if (q.startsWith("Who is the best") && !isContinuation) return answer("Searching for Leeds electricians…", [], "pause_turn");
      if (q.startsWith("Who is the best")) return answer("I'd recommend Bright Spark Electrical or Volt Leeds.", [{ url: "https://www.yell.com/leeds-electricians", title: "Yell" }]);
      // Web search with dynamic filtering returns no citations: the search results are the sources.
      if (q.includes("EV charger")) return answer("Bright Spark Electrical and Sparky Co both install chargers.", [{ url: "https://www.checkatrade.com/ev", title: "Checkatrade" }], "end_turn", false);
      return answer("Volt Leeds and Amp Masters are popular choices.", [{ url: "https://www.checkatrade.com/leeds", title: "Checkatrade" }, { url: "https://www.bark.com/leeds", title: "Bark" }]);
    }
    return judge(params, opts);
  };
}

beforeAll(async () => {
  for (const k of API_KEY_ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = "test-key-not-used";
  process.env.SEARCH_API_KEY = "test-search-key";
  process.env.EXTERNAL_FETCH_PAGES = "0";
  process.env.AUDITS_DIR = mkdtempSync(path.join(tmpdir(), "kwez-vis-"));
  process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "kwez-vis-cache-"));
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.BOT_UA_PROBES = "false";
  server = await startFixtureServer();
  setSearchTransportForTests(async () => [
    { url: "https://www.yell.com/biz/bright-spark-electrical-leeds/", title: "Bright Spark Electrical, Leeds | Yell", snippet: "Bright Spark Electrical, 12 Kirkgate, Leeds." },
  ]);
  setLlmTransportForTests(fakeClaude());
}, 60_000);

afterAll(async () => {
  setSearchTransportForTests(null);
  setLlmTransportForTests(null);
  await server?.close();
  for (const k of [...API_KEY_ENV_VARS, "EXTERNAL_FETCH_PAGES", "CACHE_DIR"]) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
    else delete process.env[k];
  }
});

describe("e2e: AI visibility tests", () => {
  let audit: AuditRecord;
  let v: VisibilityData;
  const r = (id: string) => audit.results.find((x) => x.id === id)!;

  beforeAll(async () => {
    const input = parseAuditInput({ url: server.url, companyName: "Bright Spark Electrical", industry: "Electricians", town: "Leeds", options: { promptCount: 5 } }, true);
    audit = await executeAudit(newAuditRecord(input), new AbortController().signal);
    v = audit.extras.visibility as VisibilityData;
  }, 120_000);

  it("writes questions that don't name the business, retrying when one does", () => {
    expect(questionAttempts).toBe(2);
    expect(v.promptSource).toBe("generated");
    expect(v.answers.map((a) => a.prompt)).toEqual(QUESTIONS);
  });

  it("asks Claude with web search, located in the town, and continues a paused turn", () => {
    const tool = asked[0].tools![0] as { max_uses: number; user_location: { city: string; country: string } };
    expect(tool.max_uses).toBe(3);
    expect(tool.user_location).toMatchObject({ city: "Leeds", country: "GB" });
    expect(asked.length).toBe(QUESTIONS.length + 1); // one question paused and was continued
    const best = v.answers.find((a) => a.prompt.startsWith("Who is the best"))!;
    expect(best.text).toMatch(/recommend Bright Spark/);
    expect(best.cited.map((c) => c.url)).toContain("https://www.yell.com/leeds-electricians");
    const ev = v.answers.find((a) => a.prompt.includes("EV charger"))!;
    expect(ev.cited.map((c) => c.url)).toEqual(["https://www.checkatrade.com/ev"]); // from search results
  });

  it("records who was named and logs web search costs", () => {
    expect(v.answers.filter((a) => a.mentioned)).toHaveLength(2);
    expect(v.answers.find((a) => a.prompt.startsWith("Who is the best"))!.recommended).toBe(true);
    const searchCosts = audit.costs.filter((c) => /AI visibility: "/.test(c.purpose));
    expect(searchCosts.length).toBe(QUESTIONS.length + 1);
    expect(searchCosts.every((c) => /web search/.test(c.purpose) && c.usd >= 0.01)).toBe(true);
  });

  it("scores 9.10–9.13 from the answers", () => {
    expect(r("9.10").status).toBe("pass"); // named in 2 of 5 (40%)
    expect(r("9.10").evidence.some((e) => /✓ Recommended: "Who is the best/.test(e.label))).toBe(true);
    expect(r("9.11").status).toBe("pass"); // Yell is cited and lists the business
    expect(r("9.12").status).toBe("fail"); // Volt Leeds named 4 times, Amp Masters 3, vs 2
    expect(r("9.12").issue).toMatch(/Volt Leeds \(4\), Amp Masters \(3\) are named more often than Bright Spark Electrical \(2\)/);
    expect(r("9.12").requiredChange).toBeTruthy();
    expect(r("9.13").status).toBe("fail"); // checkatrade and bark cited, not listing the business
    expect(r("9.13").issue).toMatch(/checkatrade\.com/);
  });

  it("counts every check this build can run", () => {
    expect(audit.score!.notInBuild).toBe(1); // only 2.1 (page speed) is left
  });
});

describe("visibility switched off", () => {
  it("leaves 9.10–9.13 unchecked with the reason", async () => {
    const input = parseAuditInput({ url: server.url, companyName: "Bright Spark Electrical", options: { runVisibility: false } }, true);
    const audit = await executeAudit(newAuditRecord(input), new AbortController().signal);
    for (const id of ["9.10", "9.11", "9.12", "9.13"]) expect(audit.results.find((x) => x.id === id)!.issue).toMatch(/switched off/);
  }, 120_000);
});
