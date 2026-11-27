import { config } from "@/config";
import { CATEGORIES, CHECK_BY_ID, type CategoryDef } from "@/lib/checks/catalogue";
import type { CheckResult, CheckStatus } from "@/lib/schemas/check";

export const POINTS: Record<Exclude<CheckStatus, "unable">, number> = { pass: 1, partial: 0.5, fail: 0 };

export type Band = "Low visibility" | "Developing" | "Good" | "Excellent";

export function bandFor(score: number): Band {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Developing";
  return "Low visibility";
}

/** One plain-English sentence per band, shown under the score (report page and PDF). */
export const BAND_SUMMARY: Record<Band, string> = {
  "Low visibility": "AI assistants are unlikely to find or recommend this business yet.",
  Developing: "AI assistants can find this business, but clear gaps are holding it back.",
  Good: "This business is well placed for AI discovery, with some improvements left.",
  Excellent: "This business is in strong shape for AI discovery.",
};

export interface CategoryScore {
  categoryId: number;
  /** 0–100, unrounded; null when no check in the category was assessable. */
  score: number | null;
  assessableWeight: number;
  totalWeight: number;
  counts: Record<CheckStatus, number>;
}

export interface ScoreSummary {
  /** Whole number 0–100, or null when nothing could be assessed. */
  overall: number | null;
  band: Band | null;
  coveragePct: number;
  provisional: boolean;
  categories: CategoryScore[];
  /** Checks this version of the app can't run yet; left out of coverage (and the score). */
  notInBuild: number;
}

/**
 * Deterministic scoring.
 *  check points:  Pass 1, Partial 0.5, Fail 0, Unable to Verify excluded
 *  category score = Σ(points × weight) / Σ(weight of assessable checks) × 100
 *  overall = Σ(category score × category weight) / Σ(weights of categories with ≥1 assessable check)
 *  coverage % = assessable checks' weight / total weight of the checks this build can run
 * Checks in `notInBuild` (not implemented yet) are left out entirely, so coverage measures how
 * much of what this version can check was actually checked.
 */
export function computeScore(results: CheckResult[], categories: CategoryDef[] = CATEGORIES, opts: { notInBuild?: ReadonlySet<string> } = {}): ScoreSummary {
  const skip = opts.notInBuild ?? new Set<string>();
  let totalCheckWeight = 0;
  let assessableCheckWeight = 0;

  const catScores: CategoryScore[] = categories.map((cat) => {
    const counts: Record<CheckStatus, number> = { pass: 0, partial: 0, fail: 0, unable: 0 };
    let earned = 0;
    let assessable = 0;
    let total = 0;
    for (const r of results) {
      const meta = CHECK_BY_ID.get(r.id);
      if (!meta || meta.categoryId !== cat.id || skip.has(r.id)) continue;
      counts[r.status]++;
      total += meta.weight;
      if (r.status === "unable") continue;
      assessable += meta.weight;
      earned += POINTS[r.status] * meta.weight;
    }
    totalCheckWeight += total;
    assessableCheckWeight += assessable;
    return {
      categoryId: cat.id,
      score: assessable > 0 ? (earned / assessable) * 100 : null,
      assessableWeight: assessable,
      totalWeight: total,
      counts,
    };
  });

  let weighted = 0;
  let weightSum = 0;
  for (const cs of catScores) {
    if (cs.score === null) continue;
    const w = categories.find((c) => c.id === cs.categoryId)!.weight;
    weighted += cs.score * w;
    weightSum += w;
  }

  const overall = weightSum > 0 ? Math.round(weighted / weightSum) : null;
  const coveragePct = totalCheckWeight > 0 ? Math.round((assessableCheckWeight / totalCheckWeight) * 100) : 0;

  return {
    overall,
    band: overall === null ? null : bandFor(overall),
    coveragePct,
    provisional: coveragePct < config.thresholds.provisionalCoveragePct,
    categories: catScores,
    notInBuild: results.filter((r) => skip.has(r.id)).length,
  };
}

export function formatScoreLine(s: ScoreSummary): string {
  if (s.overall === null) return `Not scored · based on 0% of checks`;
  return `${s.overall} / 100 · based on ${s.coveragePct}% of checks`;
}
