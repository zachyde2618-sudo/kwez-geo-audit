import { judgementResult } from "./llm";
import type { CheckImpl } from "./types";
import { unable } from "./types";

/**
 * AI-judged parts of category 9. The third-party sources are gathered in build phase 5
 * (web search, review pages); the AI judgement itself is implemented in src/lib/llm/external.ts.
 */
const external = (id: string, what: string): CheckImpl => (ctx) => {
  if (!ctx.data.external?.judgements?.[id]) return unable(`Not checked: ${what} are gathered by the external checks added in build phase 5.`);
  return judgementResult(ctx, id);
};

export const cat9: Record<string, CheckImpl> = {
  "9.5": external("9.5", "third-party descriptions of the business"),
  "9.7": external("9.7", "reviews from independent platforms"),
  "9.9": external("9.9", "third-party sources that could confirm your claims"),
};
