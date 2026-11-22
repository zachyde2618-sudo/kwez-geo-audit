import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { config, getKey } from "@/config";
import type { CostEntry } from "@/lib/schemas/audit";

/**
 * Thin wrapper over the official Anthropic SDK for LLM-judged checks:
 *  - strict JSON output via structured outputs (`output_config.format`), validated again locally
 *  - caller-supplied validation (e.g. quote verification) with retry on invalid output
 *  - a hard token cap per audit, enforced before each request
 *  - a cost entry per call (including retries)
 */

export type LlmParams = MessageCreateParamsNonStreaming;
export type LlmTransport = (params: LlmParams, opts: { signal: AbortSignal }) => Promise<BetaMessage>;

export class LlmBudgetError extends Error {
  constructor(used: number, cap: number) {
    super(`the per-audit AI token budget is used up (${used.toLocaleString("en-GB")} of ${cap.toLocaleString("en-GB")} tokens)`);
    this.name = "LlmBudgetError";
  }
}
export class LlmInvalidOutputError extends Error {
  constructor(attempts: number, last: string) {
    super(`the AI returned invalid output ${attempts} time(s) (last problem: ${last})`);
    this.name = "LlmInvalidOutputError";
  }
}
export class LlmRefusalError extends Error {
  constructor(category: string | null | undefined) {
    super(`the AI model declined to assess this content${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

let transportOverride: LlmTransport | null = null;
/** Tests inject a fake transport so no network calls are made. Pass null to restore. */
export function setLlmTransportForTests(t: LlmTransport | null) {
  transportOverride = t;
}

function sdkTransport(): LlmTransport {
  const client = new Anthropic({
    apiKey: getKey("ANTHROPIC_API_KEY") ?? null,
    authToken: null,
    baseURL: config.llm.baseUrl,
    timeout: config.llm.requestTimeoutMs,
    maxRetries: 2, // SDK retries 408/409/429/5xx and connection errors
  });
  return (params, { signal }) => client.beta.messages.create(params, { signal });
}

/** Approximate USD for a call, from config.pricingUsdPerMTok (estimates, not invoices). */
export function estimateUsd(inputTokens: number, outputTokens: number): number {
  const p = config.pricingUsdPerMTok.anthropic;
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 10_000) / 10_000;
}

/** Conservative input estimate (≈3 characters per token) so the cap is never overshot. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3);

export interface JudgeRequest<T> {
  purpose: string;
  system: string;
  user: string;
  /** JSON schema for structured outputs. */
  jsonSchema: Record<string, unknown>;
  /** Parse/shape-check the JSON (e.g. a Zod schema's parse). Throw to reject. */
  parse: (raw: unknown) => T;
  /** Semantic validation (quotes, coverage). Return problems; empty means valid. */
  validate?: (value: T) => string[];
  signal: AbortSignal;
}

export interface LlmClientOptions {
  transport?: LlmTransport;
  onCost?: (entry: CostEntry) => void;
  maxTokensPerAudit?: number;
  maxRetries?: number;
}

export class LlmClient {
  readonly model = config.llm.judgeModel;
  usedTokens = 0;
  calls = 0;
  private transport: LlmTransport;
  private onCost: (entry: CostEntry) => void;
  private cap: number;
  private maxRetries: number;

  constructor(opts: LlmClientOptions = {}) {
    this.transport = opts.transport ?? transportOverride ?? sdkTransport();
    this.onCost = opts.onCost ?? (() => {});
    this.cap = opts.maxTokensPerAudit ?? config.llm.maxTokensPerAudit;
    this.maxRetries = opts.maxRetries ?? config.llm.maxRetriesOnInvalidOutput;
  }

  get remainingTokens() {
    return Math.max(0, this.cap - this.usedTokens);
  }

  async judge<T>(req: JudgeRequest<T>): Promise<T> {
    let feedback = "";
    let lastProblem = "";
    const attempts = this.maxRetries + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      req.signal.throwIfAborted();
      const user = feedback ? `${req.user}\n\n${feedback}` : req.user;
      const inputEstimate = estimateTokens(req.system.length + user.length + JSON.stringify(req.jsonSchema).length);
      const outputRoom = this.remainingTokens - inputEstimate;
      if (outputRoom < 1_500) throw new LlmBudgetError(this.usedTokens, this.cap);
      const maxTokens = Math.min(config.llm.maxOutputTokensPerCall, outputRoom);

      const res = await this.transport(
        {
          model: this.model,
          max_tokens: maxTokens,
          system: req.system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: config.llm.effort, format: { type: "json_schema", schema: req.jsonSchema } },
          // On a safety decline, the API retries on a fallback model in the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: req.signal },
      );
      this.calls++;
      const inTok = res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
      const outTok = res.usage.output_tokens;
      this.usedTokens += inTok + outTok;
      this.onCost({
        provider: "anthropic",
        purpose: `${req.purpose}${attempt > 1 ? ` (retry ${attempt - 1})` : ""} [${res.model}]`,
        inputTokens: inTok,
        outputTokens: outTok,
        usd: estimateUsd(inTok, outTok),
      });

      if (res.stop_reason === "refusal") throw new LlmRefusalError(res.stop_details?.category);
      if (res.stop_reason === "max_tokens") {
        lastProblem = "the answer was cut off at the output token limit";
        feedback = "Your previous answer was cut off because it was too long. Keep each finding under 60 words and give at most 3 quotes per criterion.";
        continue;
      }
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      let value: T;
      try {
        value = req.parse(JSON.parse(text));
      } catch (err) {
        lastProblem = `output did not match the schema (${err instanceof Error ? err.message.slice(0, 200) : String(err)})`;
        feedback = `Your previous answer was rejected: ${lastProblem}. Reply with JSON that matches the schema exactly.`;
        continue;
      }
      const problems = req.validate?.(value) ?? [];
      if (!problems.length) return value;
      lastProblem = problems.slice(0, 3).join("; ");
      feedback = [
        "Your previous answer was rejected for these reasons:",
        ...problems.slice(0, 12).map((p) => `- ${p}`),
        "Answer again. Copy every quote character-for-character from the page text supplied (do not paraphrase, join separate sentences, or add ellipses), and use the exact URL shown in that page's header.",
      ].join("\n");
    }
    throw new LlmInvalidOutputError(attempts, lastProblem);
  }
}
