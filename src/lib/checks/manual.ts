import type { CheckImpl } from "./types";
import { unable } from "./types";

/**
 * Checks that cannot be judged from outside the business. They always report
 * Unable to Verify, phrased as a recommendation, and are never scored.
 */
export const manualChecks: Record<string, CheckImpl> = {
  "2.8": () =>
    unable(
      "How often each FAQ question is asked can't be seen from outside your business.",
      "Order your FAQ so the questions customers ask most (in search, AI tools, emails and calls) come first, and review the order every quarter.",
      { method: "manual" },
    ),
  "4.1": () =>
    unable(
      "This is an internal research step and can't be checked from your website.",
      "Run your services and location through a question-research engine to find the exact questions customers ask AI, then build FAQs around them.",
      { method: "manual", notes: ["Kwez can run this as part of the fix package."] },
    ),
  "8.6": () =>
    unable(
      "Whether your FAQs are maintained on an ongoing basis can't be seen from outside your business.",
      "Review FAQs at least quarterly against new customer and AI questions, and retire answers that are out of date.",
      {
        method: "manual",
        notes: ["Kwez's maintenance plan reviews and refreshes your FAQs each quarter so they keep matching what people ask AI."],
      },
    ),
};
