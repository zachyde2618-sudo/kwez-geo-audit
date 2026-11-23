import { config } from "@/config";
import { wordCount } from "@/lib/crawler/extract";
import type { Evidence } from "@/lib/schemas/check";
import { isQuestion } from "./cat3";
import { ev, findFaq, isResult, needCrawl, relPath } from "./helpers";
import { combineParts, judgementResult, llmCheck } from "./llm";
import type { CheckImpl, RawCheckResult } from "./types";
import { unable } from "./types";

/** FAQ question/answer pairs from the FAQ page's headings (h2–h6, summary, dt). */
export function faqPairs(ctx: Parameters<CheckImpl>[0]) {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const faq = findFaq(c);
  if (!faq) return null;
  const pairs = faq.page.sections
    .filter((s) => s.tag !== "h1" && isQuestion(s.heading))
    .map((s) => ({ question: s.heading, answer: s.text, words: wordCount(s.text) }));
  return { page: faq.page, pairs };
}

const c44auto = (ctx: Parameters<CheckImpl>[0]): RawCheckResult => {
  const f = faqPairs(ctx);
  if (f && "status" in f) return f;
  if (!f) {
    const pages = ctx.data.crawl?.pages.length ?? 0;
    return {
      status: "fail",
      evidence: [ev.measure("FAQ search", `No FAQ page, FAQ heading or FAQPage schema found across ${pages} crawled pages`)],
      issue: "There's no FAQ, so there are no stand-alone answers for AI assistants to quote (see check 2.2).",
    };
  }
  if (!f.pairs.length) return unable("Not checked: no question-and-answer pairs could be read from the FAQ.");
  const { min, max } = config.thresholds.faqAnswerWords;
  const inRange = f.pairs.filter((p) => p.words >= min && p.words <= max);
  const tooShort = f.pairs.filter((p) => p.words < min);
  const tooLong = f.pairs.filter((p) => p.words > max);
  const url = f.page.finalUrl;
  const evidence: Evidence[] = [
    ev.measure(`FAQ answer length on ${relPath(url)}`, `${inRange.length} of ${f.pairs.length} answers are ${min}–${max} words; ${tooShort.length} shorter, ${tooLong.length} longer`, url),
  ];
  for (const p of [...tooShort, ...tooLong].slice(0, 4)) evidence.push(ev.measure(`${p.words} words`, p.question, url));
  if (inRange.length / f.pairs.length >= 0.7) return { status: "pass", evidence };
  return {
    status: "fail",
    evidence,
    issue: `Only ${inRange.length} of ${f.pairs.length} FAQ answers are the ${min}–${max} words AI assistants tend to quote whole.`,
    requiredChange: `Rewrite FAQ answers to ${min}–${max} words: the direct answer first, then one or two supporting facts.`,
    pages: [url],
  };
};

/** 4.4: word counts are measured by code; self-containment is judged by the AI. */
const c44: CheckImpl = (ctx) => combineParts(c44auto(ctx), judgementResult(ctx, "4.4"));

export const cat4: Record<string, CheckImpl> = {
  "4.2": llmCheck("4.2"),
  "4.3": llmCheck("4.3"),
  "4.4": c44,
};
