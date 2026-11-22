import { z } from "zod";

export const STATUSES = ["pass", "partial", "fail", "unable"] as const;
export const CheckStatus = z.enum(STATUSES);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
  unable: "Unable to Verify",
};

export const Effort = z.enum(["Quick win", "Moderate", "Major"]);
export type Effort = z.infer<typeof Effort>;
export const Impact = z.enum(["High", "Medium", "Low"]);
export type Impact = z.infer<typeof Impact>;
export const Method = z.enum(["automated", "llm", "external", "manual"]);
export type Method = z.infer<typeof Method>;

export const MAX_SNIPPET_CHARS = 300;

/**
 * One piece of real evidence. `value` is a URL, header, quoted snippet (<300 chars),
 * a measured number, or an API response excerpt.
 */
export const Evidence = z.object({
  kind: z.enum(["url", "header", "snippet", "measurement", "api", "note"]),
  label: z.string(),
  value: z.string().max(MAX_SNIPPET_CHARS),
  url: z.string().optional(),
  /** Category 9 only: whether this was confirmed from a third-party source. */
  verification: z.enum(["verified_externally", "not_independently_checked"]).optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const CheckResult = z.object({
  id: z.string(),
  status: CheckStatus,
  evidence: z.array(Evidence),
  issue: z.string(),
  requiredChange: z.string(),
  effort: Effort,
  impact: Impact,
  method: Method,
  /** Affected page URLs, used by the to-do list. */
  pages: z.array(z.string()).default([]),
  /** Informational notes that are not scored (e.g. llms.txt presence). */
  notes: z.array(z.string()).default([]),
});
export type CheckResult = z.infer<typeof CheckResult>;
