import type { AuditInput } from "@/lib/schemas/input";
import type { CheckStatus, Effort, Evidence, Impact, Method } from "@/lib/schemas/check";
import type { CrawlData } from "@/lib/crawler/types";
import type { ExternalData } from "@/lib/llm/external";
import type { SiteReview } from "@/lib/llm/review";
import type { VisibilityData } from "@/lib/visibility/run";

export interface PageSnapshot {
  url: string;
  title: string;
  status: number;
  htmlBytes: number;
  textHash: string;
  freshestDate: string | null;
}

export interface PreviousAudit {
  id: string;
  createdAt: string;
  snapshots: PageSnapshot[];
}

/**
 * Data shared by all checks in an audit. Later phases add crawl data, LLM client,
 * search client, visibility results, etc. Every field beyond `input` is optional so a
 * check must handle "data not collected" by returning Unable to Verify.
 */
export interface CheckContext {
  input: AuditInput;
  signal: AbortSignal;
  progress: (message: string) => void;
  /** Populated by pipeline stages; any field may be missing. */
  data: {
    crawl?: CrawlData;
    crawlError?: string;
    previous?: PreviousAudit;
    /** AI review of the crawled pages (Phase 4). Missing when no key or no pages. */
    llm?: SiteReview;
    /** Why the AI review didn't run, when it was attempted. */
    llmError?: string;
    /** Third-party texts with AI judgements on them (collected in Phase 5). */
    external?: ExternalData;
    /** AI visibility test answers (9.10–9.13). */
    visibility?: VisibilityData;
    /** Why the AI visibility tests failed, when they were attempted. */
    visibilityError?: string;
  };
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
