import { describe, expect, it } from "vitest";
import { LlmBudgetError, LlmClient } from "@/lib/llm/client";

describe("token budget reserve", () => {
  it("holds back a share of the budget for later stages, then releases it", async () => {
    const client = new LlmClient({
      maxTokensPerAudit: 20_000,
      transport: async () => {
        throw new Error("should not be called");
      },
    });
    client.reserveShare(0.95);
    expect(client.remainingTokens).toBe(1_000);
    const req = { purpose: "t", system: "s", user: "u", jsonSchema: {}, parse: (x: unknown) => x, signal: new AbortController().signal };
    await expect(client.judge(req)).rejects.toBeInstanceOf(LlmBudgetError);
    client.reserveShare(0);
    expect(client.remainingTokens).toBe(20_000);
  });
});
