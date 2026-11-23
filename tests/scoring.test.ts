import { describe, expect, it } from "vitest";
import { CHECKS } from "@/lib/checks/catalogue";
import type { CheckResult, CheckStatus } from "@/lib/schemas/check";
import { bandFor, computeScore, formatScoreLine } from "@/lib/scoring";

function results(statusFor: (id: string, categoryId: number) => CheckStatus): CheckResult[] {
  return CHECKS.map((c) => ({
    id: c.id,
    status: statusFor(c.id, c.categoryId),
    evidence: [],
    issue: "",
    requiredChange: "",
    effort: c.effort,
    impact: c.impact,
    method: c.method,
    pages: [],
    notes: [],
  }));
}

describe("computeScore", () => {
  it("all Pass → 100, Excellent, full coverage", () => {
    const s = computeScore(results(() => "pass"));
    expect(s.overall).toBe(100);
    expect(s.band).toBe("Excellent");
    expect(s.coveragePct).toBe(100);
    expect(s.provisional).toBe(false);
  });

  it("all Unable to Verify → no score, 0% coverage, provisional", () => {
    const s = computeScore(results(() => "unable"));
    expect(s.overall).toBeNull();
    expect(s.band).toBeNull();
    expect(s.coveragePct).toBe(0);
    expect(s.provisional).toBe(true);
    expect(s.categories.every((c) => c.score === null)).toBe(true);
    expect(formatScoreLine(s)).toBe("Not scored · based on 0% of checks");
  });

  it("all Fail → 0", () => {
    expect(computeScore(results(() => "fail")).overall).toBe(0);
  });

  it("excludes a whole missing category from the overall weighting", () => {
    // Category 9 (weight 20) all unable, everything else pass → still 100.
    const s = computeScore(results((_, cat) => (cat === 9 ? "unable" : "pass")));
    expect(s.overall).toBe(100);
    expect(s.categories.find((c) => c.categoryId === 9)!.score).toBeNull();
    // Category 9 check weight = 3+2+2+2+2+3+1+2+2+3+2+2+2+2+2+2 = 34 of total
    const total = CHECKS.reduce((a, c) => a + c.weight, 0);
    expect(s.coveragePct).toBe(Math.round(((total - 34) / total) * 100));
  });

  it("weights categories: cat 9 fail (20) + everything else pass (80) → 80", () => {
    const s = computeScore(results((_, cat) => (cat === 9 ? "fail" : "pass")));
    expect(s.overall).toBe(80);
    expect(s.band).toBe("Good");
  });

  it("weights checks within a category and counts Partial as half", () => {
    // Category 1: weights 1.1=3,1.2=2,1.3=1,1.4=2,1.5=3,1.6=3,1.7=2 (total 16)
    // 1.6 partial (1.5), 1.7 partial (1), 1.1 pass (3), rest fail → 5.5/16 = 34.375
    const s = computeScore(
      results((id, cat) => {
        if (cat !== 1) return "unable";
        if (id === "1.1") return "pass";
        if (id === "1.6" || id === "1.7") return "partial";
        return "fail";
      }),
    );
    expect(s.categories[0].score).toBeCloseTo(34.375);
    expect(s.overall).toBe(34);
  });

  it("excludes Unable to Verify checks from the category denominator", () => {
    // Category 1: only 1.1 (w3) pass and 1.3 (w1) fail assessable → 3/4 = 75
    const s = computeScore(results((id) => (id === "1.1" ? "pass" : id === "1.3" ? "fail" : "unable")));
    expect(s.categories[0].score).toBe(75);
    expect(s.overall).toBe(75);
  });

  it("marks coverage under 60% as provisional", () => {
    const s = computeScore(results((_, cat) => (cat <= 2 ? "pass" : "unable")));
    expect(s.coveragePct).toBeLessThan(60);
    expect(s.provisional).toBe(true);
  });
});

describe("bandFor", () => {
  it.each([
    [0, "Low visibility"],
    [39, "Low visibility"],
    [40, "Developing"],
    [69, "Developing"],
    [70, "Good"],
    [84, "Good"],
    [85, "Excellent"],
    [100, "Excellent"],
  ])("%i → %s", (n, band) => expect(bandFor(n)).toBe(band));
});

describe("checks not in this build", () => {
  it("are left out of coverage and the score, and counted separately", async () => {
    const { CHECKS } = await import("@/lib/checks/catalogue");
    const all = CHECKS.map((c) => ({ id: c.id, status: c.id === "2.1" ? ("unable" as const) : ("pass" as const), evidence: [], issue: "", requiredChange: "", effort: c.effort, impact: c.impact, method: c.method, pages: [], notes: [] }));
    const counted = computeScore(all);
    const excluded = computeScore(all, undefined, { notInBuild: new Set(["2.1"]) });
    expect(counted.coveragePct).toBeLessThan(100);
    expect(excluded.coveragePct).toBe(100);
    expect(excluded.notInBuild).toBe(1);
    expect(excluded.overall).toBe(100);
  });
});

describe("sites with no FAQ", () => {
  it("fail the FAQ content checks instead of leaving them unchecked", async () => {
    const { CRITERIA } = await import("@/lib/llm/rubrics");
    for (const id of ["2.3", "2.4", "4.2", "4.3", "4.4"]) {
      expect(CRITERIA[id].notApplicable.status, id).toBe("fail");
      expect(CRITERIA[id].notApplicable.issue, id).toMatch(/There's no FAQ/);
    }
  });
});
