import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getKey, hasKey } from "@/config";

const NAMES = ["ANTHROPIC_API_KEY", "KWEZ_ANTHROPIC_API_KEY"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of NAMES) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of NAMES) if (saved[k] !== undefined) process.env[k] = saved[k];
  else delete process.env[k];
});

describe("Anthropic key fallback", () => {
  it("is not configured when neither variable is set", () => {
    expect(hasKey("ANTHROPIC_API_KEY")).toBe(false);
  });
  it("falls back to KWEZ_ANTHROPIC_API_KEY when ANTHROPIC_API_KEY is missing or blank", () => {
    process.env.KWEZ_ANTHROPIC_API_KEY = "kwez";
    expect(getKey("ANTHROPIC_API_KEY")).toBe("kwez");
    process.env.ANTHROPIC_API_KEY = "  ";
    expect(getKey("ANTHROPIC_API_KEY")).toBe("kwez");
  });
  it("prefers ANTHROPIC_API_KEY when both are set", () => {
    process.env.KWEZ_ANTHROPIC_API_KEY = "kwez";
    process.env.ANTHROPIC_API_KEY = "primary";
    expect(getKey("ANTHROPIC_API_KEY")).toBe("primary");
  });
});
