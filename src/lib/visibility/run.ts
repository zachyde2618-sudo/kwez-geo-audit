import { z } from "zod";
import { config } from "@/config";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { businessIdentity, countryCode } from "@/lib/external/gather";
import type { LlmClient } from "@/lib/llm/client";
import { businessContext } from "@/lib/llm/review";
import type { AuditInput } from "@/lib/schemas/input";

/**
 * AI visibility tests (9.10–9.13): ask Claude the questions a customer who has never heard of
 * the business would ask, with web search on, then record whether the business is named or
 * recommended, which other businesses are, and which sites the answers cite.
 * ChatGPT, Gemini and Perplexity can be added as further providers later.
 */

export interface VisibilityAnswer {
  prompt: string;
  text: string;
  /**
   * The answer's sources, most used first: its citations, or when it has none (web search with
   * dynamic filtering returns none) the web pages its searches found.
   */
  cited: { url: string; title: string }[];
  /** Sites the assistant's searches returned (cited or not). */
  consulted: string[];
  mentioned: boolean;
  recommended: boolean;
  /** Other businesses or brands the answer names or recommends. */
  others: string[];
  error?: string;
}

export interface VisibilityData {
  provider: "anthropic";
  label: string;
  model: string;
  promptSource: "supplied" | "generated";
  answers: VisibilityAnswer[];
  /** Set when the whole stage failed. */
  error?: string;
}

// ── Questions ───────────────────────────────────────────────────────────────
const Questions = z.object({ questions: z.array(z.string().min(5).max(300)) });
const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: { questions: { type: "array", items: { type: "string" } } },
};

export async function visibilityPrompts(input: AuditInput, client: LlmClient, signal: AbortSignal): Promise<{ prompts: string[]; source: VisibilityData["promptSource"] }> {
  const count = input.options.promptCount;
  const { name, domain } = businessIdentity(input);
  const supplied = input.exampleQuestions.filter((q) => q.trim());
  if (supplied.length >= Math.min(3, count)) return { prompts: supplied.slice(0, count), source: "supplied" };
  const names = [name, domain, domain.split(".")[0]].filter((x) => x && x.length > 2).map((x) => x.toLowerCase());
  const out = await client.judge({
    purpose: "AI visibility: write customer questions",
    system: `You write the questions real customers type into AI assistants (ChatGPT, Claude, Gemini, Perplexity) when looking for a business like the one described, before they know it exists. Never mention the business, its website or its people by name. Mix: "best/recommended … in/near [town]" questions, comparison questions, price and "how much" questions, "how do I choose" questions, and specific-need questions for its main services or products. Write them as a customer would: short, plain, sometimes informal. UK English.${supplied.length ? " Include the customer's own example questions given below, then add more." : ""}`,
    user: `${businessContext(input)}${supplied.length ? `\nCustomer's own example questions:\n${supplied.map((q) => `- ${q}`).join("\n")}` : ""}\n\nWrite exactly ${count} questions.`,
    jsonSchema: QUESTIONS_SCHEMA,
    parse: (raw) => Questions.parse(raw),
    validate: (v) => {
      const problems: string[] = [];
      if (v.questions.length < count) problems.push(`only ${v.questions.length} questions; write exactly ${count}`);
      for (const q of v.questions) if (names.some((n) => q.toLowerCase().includes(n))) problems.push(`this question names the business, which a new customer wouldn't know: "${q}"`);
      return problems;
    },
    signal,
  });
  return { prompts: out.questions.slice(0, count), source: "generated" };
}

// ── Asking ──────────────────────────────────────────────────────────────────
// Search first, like Perplexity, Google AI Overviews and ChatGPT search. Without this, Claude at low
// effort often answers from memory and never searches, so there are no sources to analyse.
const ASK_SYSTEM = "You are a helpful assistant with web search. Search the web for current information before answering, and cite the sources you use.";

function readAnswer(msg: BetaMessage): Pick<VisibilityAnswer, "text" | "cited" | "consulted"> {
  let text = "";
  const cited = new Map<string, { url: string; title: string; n: number }>();
  const consulted = new Map<string, string>();
  for (const block of msg.content) {
    if (block.type === "text") {
      text += block.text;
      for (const c of block.citations ?? []) {
        if (c.type !== "web_search_result_location") continue;
        const prev = cited.get(c.url);
        if (prev) prev.n++;
        else cited.set(c.url, { url: c.url, title: c.title ?? "", n: 1 });
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result" && !consulted.has(r.url)) consulted.set(r.url, r.title ?? "");
    }
  }
  const fromCitations = [...cited.values()].sort((a, b) => b.n - a.n).map(({ url, title }) => ({ url, title }));
  return {
    text: text.trim(),
    cited: fromCitations.length ? fromCitations : [...consulted].map(([url, title]) => ({ url, title })),
    consulted: [...consulted.keys()],
  };
}

// ── Reading the answers ─────────────────────────────────────────────────────
const Mentions = z.object({
  answers: z.array(z.object({ n: z.number().int(), mentioned: z.boolean(), recommended: z.boolean(), others: z.array(z.string()) })),
});
const MENTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "mentioned", "recommended", "others"],
        properties: { n: { type: "integer" }, mentioned: { type: "boolean" }, recommended: { type: "boolean" }, others: { type: "array", items: { type: "string" } } },
      },
    },
  },
};

async function readMentions(answers: VisibilityAnswer[], input: AuditInput, client: LlmClient, signal: AbortSignal): Promise<void> {
  const { name, domain } = businessIdentity(input);
  const ok = answers.map((a, i) => ({ a, n: i + 1 })).filter((x) => !x.a.error && x.a.text);
  for (let i = 0; i < ok.length; i += 8) {
    const batch = ok.slice(i, i + 8);
    const nums = new Set(batch.map((b) => b.n));
    const out = await client.judge({
      purpose: `AI visibility: read answers (batch ${i / 8 + 1})`,
      system: `You read AI assistant answers and record which businesses they name. The business being audited is "${name}" (website ${domain}). For each numbered answer: mentioned = the answer names this business or its website (spelling and capitalisation variants count; a different business with a similar name does not); recommended = it is presented as a good option, not just listed in passing or criticised; others = the other specific businesses, brands or providers the answer names as options (their names as written, no generic categories, no websites that are only sources). Include every answer number exactly once.`,
      user: batch.map((b) => `[${b.n}] Question: ${b.a.prompt}\nAnswer:\n${b.a.text.slice(0, 6_000)}`).join("\n\n---\n\n"),
      jsonSchema: MENTIONS_SCHEMA,
      parse: (raw) => Mentions.parse(raw),
      validate: (v) => {
        const seen = new Set(v.answers.map((x) => x.n));
        const missing = [...nums].filter((n) => !seen.has(n));
        return missing.length ? [`answers missing: ${missing.join(", ")}`] : [];
      },
      signal,
    });
    for (const r of out.answers) {
      const a = answers[r.n - 1];
      if (!a || !nums.has(r.n)) continue;
      a.mentioned = r.mentioned;
      a.recommended = r.mentioned && r.recommended;
      a.others = [...new Set(r.others.map((o) => o.trim()).filter(Boolean))];
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function runVisibility(opts: { input: AuditInput; client: LlmClient; signal: AbortSignal; progress: (m: string) => void }): Promise<VisibilityData> {
  const { input, client, signal, progress } = opts;
  const provider = config.visibility.providers.anthropic;
  const data: VisibilityData = { provider: "anthropic", label: provider.label, model: provider.model, promptSource: "generated", answers: [] };
  progress("AI visibility: writing the questions a new customer would ask…");
  const { prompts, source } = await visibilityPrompts(input, client, signal);
  data.promptSource = source;
  data.answers = prompts.map((prompt) => ({ prompt, text: "", cited: [], consulted: [], mentioned: false, recommended: false, others: [] }));
  const town = input.town.trim();
  let done = 0;
  progress(`AI visibility: asking ${provider.label} ${prompts.length} question(s) with web search…`);
  await pool(data.answers, config.llm.concurrency, async (a) => {
    signal.throwIfAborted();
    try {
      const msg = await client.converse(
        {
          model: provider.model,
          system: ASK_SYSTEM,
          messages: [{ role: "user", content: a.prompt }],
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: 3,
              user_location: { type: "approximate", country: countryCode(input.country).toUpperCase(), ...(town ? { city: town } : {}) },
            },
          ],
          output_config: { effort: "low" },
        },
        { purpose: `AI visibility: "${a.prompt.slice(0, 60)}"`, signal },
      );
      if (msg.stop_reason === "refusal") a.error = "the assistant declined to answer";
      else Object.assign(a, readAnswer(msg));
    } catch (err) {
      if (signal.aborted) throw err;
      a.error = err instanceof Error ? err.message : String(err);
    }
    progress(`AI visibility: ${++done} of ${prompts.length} answered`);
  });
  if (data.answers.every((a) => a.error)) throw new Error(data.answers[0]?.error ?? "no answers");
  progress("AI visibility: reading the answers…");
  await readMentions(data.answers, input, client, signal);
  const hits = data.answers.filter((a) => a.mentioned).length;
  progress(`AI visibility complete: ${input.companyName || businessIdentity(input).name} named in ${hits} of ${data.answers.filter((a) => !a.error).length} answers`);
  return data;
}
