import type { CheckResult } from "./check";
import type { AuditInput } from "./input";
import type { ScoreSummary } from "@/lib/scoring";

export type AuditStatus = "queued" | "running" | "complete" | "cancelled" | "error";

export interface ProgressEntry {
  at: string;
  message: string;
}

export interface CostEntry {
  provider: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface AuditRecord {
  id: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  status: AuditStatus;
  domain: string;
  input: AuditInput;
  progress: ProgressEntry[];
  results: CheckResult[];
  score?: ScoreSummary;
  error?: string;
  costs: CostEntry[];
  /** Keys that were configured when the audit ran (names only, never values). */
  keysConfigured: string[];
  /** Extra data saved by pipeline stages (visibility table, crawl summary…). */
  extras: Record<string, unknown>;
}

export interface AuditSummary {
  id: string;
  domain: string;
  companyName: string;
  createdAt: string;
  status: AuditStatus;
  overall: number | null;
  coveragePct: number | null;
  favourite: boolean;
}
