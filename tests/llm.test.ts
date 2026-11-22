import { afterEach, describe, expect, it } from "vitest";
import { config } from "@/config";
import { combineParts } from "@/lib/checks/llm";
import type { PageData } from "@/lib/crawler/types";
import { packChunks, pageBlocks } from "@/lib/llm/chunk";
import { estimateUsd, LlmBudgetError, LlmClient, LlmInvalidOutputError, LlmRefusalError, setLlmTransportForTests, type LlmTransport } from "@/lib/llm/client";
import { normaliseForQuote, quoteAppearsIn, verifyQuote } from "@/lib/llm/quotes";
import { aggregate, judgeChunk, validateVerdicts, type Verdict } from "@/lib/llm/review";
import { CRITERIA, GROUPS, SITE_CRITERIA } from "@/lib/llm/rubrics";
import type { CostEntry } from "@/lib/schemas/audit";
import { fakeMessage, userText } from "./llm-helpers";

afterEach(() => setLlmTransportForTests(null));

const signal = new AbortController().signal;

describe("quote verification", () => {
  const source = "We’re NICEIC-registered electricians — serving Leeds and   West Yorkshire since 2009.";
  it("accepts verbatim quotes, tolerating only whitespace, quote-mark and dash variants", () => {
    expect(quoteAppearsIn("We're NICEIC-registered electricians - serving Leeds and West Yorkshire", source)).toBe(true);
    expect(quoteAppearsIn("serving Leeds and West Yorkshire since 2009.", source)).toBe(true);
  });
  it("rejects paraphrases, case changes, ellipses and very short quotes", () => {
    expect(quoteAppearsIn("We are NICEIC-registered electricians", source)).toBe(false);
    expect(quoteAppearsIn("we're niceic-registered electricians", source)).toBe(false);
    expect(quoteAppearsIn("We're NICEIC-registered ... since 2009.", source)).toBe(false);
    expect(quoteAppearsIn("Leeds", source)).toBe(false);
  });
  it("corrects the URL when the quote is in another source from the same request", () => {
    const sources = [
      { url: "https://a.test/", text: "Alpha page text here." },
      { url: "https://a.test/b", text: "Bravo page text here." },
    ];
    expect(verifyQuote("Bravo page text", "https://a.test/", sources)).toEqual({ ok: true, url: "https://a.test/b" });
    expect(verifyQuote("Charlie page text", "https://a.test/", sources).ok).toBe(false);
  });
  it("normalises NFKC and typographic characters", () => {
    expect(normaliseForQuote("“Quoted” – text…")).toBe('"Quoted" - text...');
  });
});

describe("rubrics", () => {
  it("cover every Phase 4 LLM check on the site, each criterion in exactly one group", () => {
    const expected = ["1.2", "1.3", "1.4", "2.3", "2.4", "2.13", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.2", "4.3", "4.4", "6.3", "6.5", "6.8", "7.1", "7.2", "7.3", "7.4", "7.5", "8.1", "8.5"];
    expect([...SITE_CRITERIA].sort()).toEqual(expected.sort());
    expect(new Set(SITE_CRITERIA).size).toBe(SITE_CRITERIA.length);
    for (const g of GROUPS) for (const id of g.criteria) expect(CRITERIA[id], id).toBeDefined();
    for (const id of ["9.5", "9.7", "9.9"]) expect(CRITERIA[id]).toBeDefined();
  });
});

const page = (url: string, text: string): PageData =>
  ({ url, finalUrl: url, status: 200, role: "services", depth: 1, title: "T", headings: [{ level: 2, text: "Prices" }], sections: [], mainText: text, visibleText: text, mainWordCount: 100, wordCount: 100, images: [], footerText: "" }) as unknown as PageData;

describe("chunking", () => {
  it("splits long pages and packs blocks under the chunk size", () => {
    const long = page("https://x.test/long", "word ".repeat(5000));
    const blocks = pageBlocks(long, {}, 8000);
    expect(blocks.length).toBeGreaterThan(2);
    expect(blocks.every((b) => b.prompt.length <= 8500)).toBe(true);
    const chunks = packChunks([...blocks, ...pageBlocks(page("https://x.test/b", "short text"), {}, 8000)], 9000);
    expect(chunks.flat()).toHaveLength(blocks.length + 1);
    for (const c of chunks) if (c.length > 1) expect(c.reduce((n, b) => n + b.prompt.length, 0)).toBeLessThanOrEqual(9000);
  });
  it("quote sources contain exactly the page content sent (not our labels)", () => {
    const [b] = pageBlocks(page("https://x.test/", "Rewires from £4,500."));
    expect(b.prompt).toContain('<page url="https://x.test/"');
    expect(b.source.text).toContain("Rewires from £4,500.");
    expect(b.source.text).not.toContain("<page");
  });
});

describe("verdict validation and aggregation (code decides, not the model)", () => {
  const blocks = pageBlocks(page("https://x.test/", "A full rewire costs £4,500 to £6,500. We are world-class."));
  const crit = [CRITERIA["3.2"], CRITERIA["7.1"]];
  const v = (id: string, status: Verdict["status"], quotes: Verdict["quotes"] = []): Verdict => ({ id, status, finding: "f", quotes });

  it("rejects missing criteria, fabricated quotes and unbacked verdicts", () => {
    expect(validateVerdicts([v("3.2", "pass")], crit, blocks)).toEqual(expect.arrayContaining([expect.stringMatching(/7\.1 must have exactly one verdict/)]));
    const fabricated = validateVerdicts([v("3.2", "fail", [{ url: "https://x.test/", quote: "We are the best in Yorkshire" }]), v("7.1", "fail")], crit, blocks);
    expect(fabricated.join()).toMatch(/does not appear verbatim/);
    // worst-mode Fail and best-mode Pass must quote their evidence
    expect(validateVerdicts([v("3.2", "fail"), v("7.1", "pass")], crit, blocks)).toHaveLength(2);
    expect(validateVerdicts([v("3.2", "fail", [{ url: "https://x.test/", quote: "We are world-class." }]), v("7.1", "fail")], crit, blocks)).toEqual([]);
  });

  it("worst-mode criteria take the worst chunk; best-mode take the best", () => {
    const q = [{ url: "u", quote: "quote one" }];
    expect(aggregate(CRITERIA["3.2"], [v("3.2", "pass"), v("3.2", "fail", q), v("3.2", "not_applicable")]).status).toBe("fail");
    expect(aggregate(CRITERIA["7.1"], [v("7.1", "fail"), v("7.1", "pass", q)]).status).toBe("pass");
    expect(aggregate(CRITERIA["7.1"], [v("7.1", "not_applicable")]).status).toBe("not_applicable");
  });

  it("A+L checks: the worse part decides; a missing part is noted, not scored", () => {
    const ev = [{ kind: "note" as const, label: "x", value: "y" }];
    expect(combineParts({ status: "pass", evidence: ev }, { status: "fail", evidence: ev, issue: "bad" })).toMatchObject({ status: "fail", issue: "bad" });
    const r = combineParts({ status: "pass", evidence: ev }, { status: "unable", issue: "no key" });
    expect(r.status).toBe("pass");
    expect(r.notes!.join()).toMatch(/AI review part not assessed/);
  });
});

describe("LlmClient", () => {
  const schema = { type: "object" };
  const req = (validate?: (v: { ok: boolean }) => string[]) => ({
    purpose: "test",
    system: "sys",
    user: "hello",
    jsonSchema: schema,
    parse: (raw: unknown) => raw as { ok: boolean },
    validate,
    signal,
  });

  it("sends the configured Sonnet 5.5 model with structured JSON output, and logs cost per call", async () => {
    const costs: CostEntry[] = [];
    let seen: Parameters<LlmTransport>[0] | null = null;
    const client = new LlmClient({
      transport: async (p) => {
        seen = p;
        return fakeMessage({ ok: true }, { input: 10_000, output: 1_000 });
      },
      onCost: (c) => costs.push(c),
    });
    await expect(client.judge(req())).resolves.toEqual({ ok: true });
    expect(seen!.model).toBe("claude-sonnet-5-5");
    expect(seen!.model).toBe(config.llm.judgeModel);
    expect(seen!.output_config).toMatchObject({ effort: config.llm.effort, format: { type: "json_schema", schema } });
    expect(seen!.max_tokens).toBeLessThanOrEqual(config.llm.maxOutputTokensPerCall);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ provider: "anthropic", inputTokens: 10_000, outputTokens: 1_000 });
    expect(costs[0].usd).toBeCloseTo(10_000 * 2e-6 + 1_000 * 10e-6, 6);
    expect(estimateUsd(1_000_000, 0)).toBe(config.pricingUsdPerMTok.anthropic.input);
    expect(client.usedTokens).toBe(11_000);
  });

  it("retries invalid JSON and failed validation with feedback, then succeeds", async () => {
    const replies = [fakeMessage("not json"), fakeMessage({ ok: false }), fakeMessage({ ok: true })];
    const prompts: string[] = [];
    const costs: CostEntry[] = [];
    const client = new LlmClient({
      transport: async (p) => {
        prompts.push(userText(p));
        return replies.shift()!;
      },
      onCost: (c) => costs.push(c),
    });
    await expect(client.judge(req((v) => (v.ok ? [] : ["quote X does not appear verbatim"])))).resolves.toEqual({ ok: true });
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toMatch(/rejected/);
    expect(prompts[2]).toMatch(/quote X does not appear verbatim/);
    expect(costs.map((c) => c.purpose)).toEqual([expect.stringMatching(/^test \[/), expect.stringMatching(/retry 1/), expect.stringMatching(/retry 2/)]);
  });

  it("gives up after maxRetriesOnInvalidOutput retries", async () => {
    let n = 0;
    const client = new LlmClient({ transport: async () => (n++, fakeMessage({ ok: false })) });
    await expect(client.judge(req(() => ["bad quote"]))).rejects.toBeInstanceOf(LlmInvalidOutputError);
    expect(n).toBe(config.llm.maxRetriesOnInvalidOutput + 1);
  });

  it("retries a response cut off at max_tokens", async () => {
    const replies = [fakeMessage('{"ok":', { stop: "max_tokens" }), fakeMessage({ ok: true })];
    const client = new LlmClient({ transport: async () => replies.shift()! });
    await expect(client.judge(req())).resolves.toEqual({ ok: true });
  });

  it("stops at the per-audit token cap before sending a request", async () => {
    let n = 0;
    const client = new LlmClient({ transport: async () => (n++, fakeMessage({ ok: true }, { input: 9_000, output: 500 })), maxTokensPerAudit: 10_500 });
    await client.judge(req());
    await expect(client.judge(req())).rejects.toBeInstanceOf(LlmBudgetError);
    expect(n).toBe(1);
    expect(client.usedTokens).toBeLessThanOrEqual(10_500);
  });

  it("reports refusals without retrying", async () => {
    let n = 0;
    const client = new LlmClient({ transport: async () => (n++, fakeMessage("", { stop: "refusal" })) });
    await expect(client.judge(req())).rejects.toBeInstanceOf(LlmRefusalError);
    expect(n).toBe(1);
  });

  it("judgeChunk returns only verified quotes", async () => {
    const blocks = pageBlocks(page("https://x.test/", "A full rewire costs £4,500 to £6,500. We are world-class."));
    const answers = [
      { verdicts: [{ id: "3.2", status: "fail", finding: "Vague.", quotes: [{ url: "https://x.test/", quote: "We are simply the best" }] }] },
      { verdicts: [{ id: "3.2", status: "fail", finding: "Vague.", quotes: [{ url: "https://x.test/", quote: "We are world-class." }] }] },
    ];
    const client = new LlmClient({ transport: async () => fakeMessage(answers.shift()) });
    const out = await judgeChunk({ client, criteria: [CRITERIA["3.2"]], blocks, context: "ctx", purpose: "t", chunkLabel: "", signal });
    expect(out[0].quotes[0].quote).toBe("We are world-class.");
    expect(client.calls).toBe(2);
  });
});
