import { describe, expect, it } from "vitest";
import { CHECKS, CHECK_BY_ID } from "@/lib/checks/catalogue";
import type { CheckResult, CheckStatus } from "@/lib/schemas/check";
import { buildTodo, priorityOf } from "@/lib/todo";

function make(statuses: Record<string, CheckStatus>): CheckResult[] {
  return CHECKS.map((c) => ({
    id: c.id,
    status: statuses[c.id] ?? "unable",
    evidence: [],
    issue: `Issue for ${c.id}`,
    requiredChange: `Change for ${c.id}`,
    effort: c.effort,
    impact: c.impact,
    method: c.method,
    pages: [],
    notes: [],
  }));
}

describe("priorityOf", () => {
  it("is impact × check weight × category weight ÷ effort", () => {
    // High (3) × weight 3 × category 15 ÷ Quick win (1) = 135
    expect(priorityOf("High", 3, 15, "Quick win")).toBe(135);
    // Low (1) × 1 × 5 ÷ Major (3)
    expect(priorityOf("Low", 1, 5, "Major")).toBeCloseTo(5 / 3);
  });
});

describe("buildTodo", () => {
  it("includes every Fail and Partial and nothing else", () => {
    const todo = buildTodo(make({ "1.6": "fail", "1.7": "partial", "2.2": "pass", "3.1": "unable", "9.1": "fail" }));
    expect(todo.map((t) => t.checkId).sort()).toEqual(["1.6", "1.7", "9.1"]);
  });

  it("groups by effort and sorts by priority within each group", () => {
    // 1.6: Quick win, High, w3, cat 15 → 135.  5.3: Quick win, High, w3, cat 10 → 90.
    // 2.9: Quick win, Medium, w2, cat 10 → 40.  2.1: Major → bigger.  5.1: Moderate → month.
    const todo = buildTodo(make({ "2.9": "fail", "5.3": "fail", "1.6": "fail", "2.1": "fail", "5.1": "fail" }));
    expect(todo.map((t) => [t.checkId, t.group])).toEqual([
      ["1.6", "week"],
      ["5.3", "week"],
      ["2.9", "week"],
      ["5.1", "month"],
      ["2.1", "bigger"],
    ]);
  });

  it("uses plain-English titles, the why sentence, the exact change and the Kwez tag", () => {
    const [item] = buildTodo(make({ "1.7": "fail" }));
    expect(item.title).toBe(CHECK_BY_ID.get("1.7")!.todoTitle);
    expect(item.why).toBe(CHECK_BY_ID.get("1.7")!.why);
    expect(item.change).toBe("Change for 1.7");
    expect(item.tag).toBe("Kwez can fix this");
    expect(buildTodo(make({ "2.9": "fail" }))[0].tag).toBe("DIY tweak");
  });

  it("explains jargon such as schema markup only the first time it appears", () => {
    const todo = buildTodo(make({ "5.3": "fail", "5.1": "fail", "5.2": "fail" }));
    const schemaExplanations = todo.flatMap((t) => t.explain).filter((e) => e.term === "Schema markup");
    expect(schemaExplanations).toHaveLength(1);
    expect(todo[0].explain.some((e) => e.term === "Schema markup")).toBe(true);
  });

  it("returns an empty list when nothing failed", () => {
    expect(buildTodo(make({ "1.1": "pass" }))).toEqual([]);
  });
});
