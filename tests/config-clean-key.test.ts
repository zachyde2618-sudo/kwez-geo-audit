import { afterEach, describe, expect, it } from "vitest";
import { cleanKey, getKey } from "@/config";

describe("cleanKey", () => {
  it("undoes common copy-paste mistakes", () => {
    expect(cleanKey("KWEZ_ANTHROPIC_API_KEY=sk-ant-api03-abc")).toBe("sk-ant-api03-abc");
    expect(cleanKey("export ANTHROPIC_API_KEY=\"sk-ant-api03-abc\"")).toBe("sk-ant-api03-abc");
    expect(cleanKey("'sk-ant-api03-abc'")).toBe("sk-ant-api03-abc");
    expect(cleanKey("Bearer sk-ant-api03-abc")).toBe("sk-ant-api03-abc");
    expect(cleanKey("  sk-ant-api03-abc  ")).toBe("sk-ant-api03-abc");
  });
  it("leaves normal keys (including ones containing = or _) alone", () => {
    expect(cleanKey("sk-ant-api03-a_b=c")).toBe("sk-ant-api03-a_b=c");
    expect(cleanKey("AIzaSyD-abc_123")).toBe("AIzaSyD-abc_123");
  });
  it("treats a value that is only a variable name assignment as missing", () => {
    expect(cleanKey("ANTHROPIC_API_KEY=")).toBeUndefined();
  });
});

describe("getKey applies the clean-up", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  });
  it("reads a key pasted with its variable name", () => {
    process.env.ANTHROPIC_API_KEY = "KWEZ_ANTHROPIC_API_KEY=sk-ant-api03-xyz";
    expect(getKey("ANTHROPIC_API_KEY")).toBe("sk-ant-api03-xyz");
  });
});

describe("AI token budget", () => {
  const saved = process.env.AI_TOKEN_BUDGET;
  afterEach(() => {
    if (saved === undefined) delete process.env.AI_TOKEN_BUDGET;
    else process.env.AI_TOKEN_BUDGET = saved;
  });
  it("defaults to 1,000,000 and can be overridden", async () => {
    const { config } = await import("@/config");
    delete process.env.AI_TOKEN_BUDGET;
    expect(config.llm.maxTokensPerAudit).toBe(1_000_000);
    process.env.AI_TOKEN_BUDGET = "2,000,000";
    expect(config.llm.maxTokensPerAudit).toBe(2_000_000);
    process.env.AI_TOKEN_BUDGET = "nonsense";
    expect(config.llm.maxTokensPerAudit).toBe(1_000_000);
  });
});
