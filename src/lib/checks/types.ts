import type { AuditInput } from "@/lib/schemas/input";
import type { CheckStatus, Effort, Evidence, Impact, Method } from "@/lib/schemas/check";

/**
 * Data shared by all checks in an audit. Later phases add crawl data, LLM client,
 * search client, visibility results, etc. Every field beyond `input` is optional so a
 * check must handle "data not collected" by returning Unable to Verify.
 */
export interface CheckContext {
  input: AuditInput;
  signal: AbortSignal;
  progress: (message: string) => void;
  /** Populated by later pipeline stages. */
  data: Record<string, unknown>;
}

/** What a check implementation returns. Missing fields fall back to catalogue defaults. */
export interface RawCheckResult {
  status: CheckStatus;
  evidence?: Evidence[];
  issue?: string;
  requiredChange?: string;
  effort?: Effort;
  impact?: Impact;
  method?: Method;
  pages?: string[];
  notes?: string[];
}

export type CheckImpl = (ctx: CheckContext) => Promise<RawCheckResult> | RawCheckResult;

export const unable = (issue: string, requiredChange = "", extra: Partial<RawCheckResult> = {}): RawCheckResult => ({
  status: "unable",
  issue,
  requiredChange,
  ...extra,
});
