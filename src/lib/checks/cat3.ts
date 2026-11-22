import { wordCount } from "@/lib/crawler/extract";
import type { Section } from "@/lib/crawler/types";
import { reviewablePages } from "@/lib/llm/chunk";
import type { Evidence } from "@/lib/schemas/check";
import { ev, isResult, listSome, needCrawl, relPath } from "./helpers";
import { llmCheck, withAiPart } from "./llm";
import type { CheckImpl } from "./types";
import { unable } from "./types";

const QUESTION = /\?\s*$|^(how|what|why|when|where|who|which|whose|can|could|do|does|did|is|are|was|should|will|would|may|much|have|has)\b/i;
export const isQuestion = (s: string) => QUESTION.test(s.trim());

/** Content headings (h2–h4, summary, dt) on reviewable pages; skips headings that are just a name or label of 1 word. */
function contentSections(ctx: Parameters<CheckImpl>[0]) {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  return reviewablePages(c.pages).flatMap((p) =>
    p.sections.filter((s) => (["h2", "h3", "h4", "summary", "dt"].includes(s.tag)) && wordCount(s.heading) >= 2).map((s) => ({ s, p })),
  );
}

const c34auto: CheckImpl = (ctx) => {
  const secs = contentSections(ctx);
  if (!Array.isArray(secs)) return secs;
  if (!secs.length) return unable("Not checked: no content headings were found on the crawled pages.");
  const qs = secs.filter(({ s }) => isQuestion(s.heading));
  const share = qs.length / secs.length;
  const evidence: Evidence[] = [ev.measure("Question headings", `${qs.length} of ${secs.length} content headings (${Math.round(share * 100)}%) are phrased as questions`)];
  for (const { s, p } of qs.slice(0, 3)) evidence.push(ev.snippet(`Question heading on ${relPath(p.finalUrl)}`, s.heading, p.finalUrl));
  if (qs.length >= 3 && share >= 0.2) return { status: "pass", evidence };
  const labels = secs.filter(({ s }) => !isQuestion(s.heading));
  for (const { s, p } of labels.slice(0, 3)) evidence.push(ev.snippet(`Label heading on ${relPath(p.finalUrl)}`, s.heading, p.finalUrl));
  return {
    status: "fail",
    evidence,
    issue: `Only ${qs.length} of ${secs.length} headings are phrased as questions, so fewer of your sections match the way people ask AI.`,
    requiredChange: "Rephrase content headings as the questions customers ask, e.g. \"How long does an EV charger installation take?\" instead of \"Installation\". Aim for at least one in five.",
    pages: [...new Set(labels.map(({ p }) => p.finalUrl))].slice(0, 10),
  };
};

const answered = (s: Section) => s.adjacent && wordCount(s.firstText) >= 5;

const c35auto: CheckImpl = (ctx) => {
  const secs = contentSections(ctx);
  if (!Array.isArray(secs)) return secs;
  const qs = secs.filter(({ s }) => isQuestion(s.heading));
  if (!qs.length) return unable("Not checked: no question headings were found, so question–answer pairing couldn't be measured (see check 3.4).");
  const ok = qs.filter(({ s }) => answered(s));
  const bad = qs.filter(({ s }) => !answered(s));
  const evidence: Evidence[] = [ev.measure("Questions answered directly underneath", `${ok.length} of ${qs.length} question headings are immediately followed by an answer of 5+ words`)];
  for (const { s, p } of ok.slice(0, 2)) evidence.push(ev.snippet(`Question and answer on ${relPath(p.finalUrl)}`, `${s.heading} ${s.firstText}`, p.finalUrl));
  for (const { s, p } of bad.slice(0, 3)) evidence.push(ev.snippet(`Question without an answer directly below on ${relPath(p.finalUrl)}`, s.heading, p.finalUrl));
  if (ok.length / qs.length >= 0.8) return { status: "pass", evidence };
  return {
    status: "fail",
    evidence,
    issue: `${bad.length} of ${qs.length} questions aren't directly followed by an answer: ${listSome(bad.map(({ s }) => `"${s.heading}"`), 3)}.`,
    requiredChange: "Put each answer directly under its question, in the same section, without sending readers to another page or tab.",
    pages: [...new Set(bad.map(({ p }) => p.finalUrl))],
  };
};

export const cat3: Record<string, CheckImpl> = {
  "3.1": llmCheck("3.1"),
  "3.2": llmCheck("3.2"),
  "3.3": llmCheck("3.3"),
  "3.4": withAiPart("3.4", c34auto),
  "3.5": withAiPart("3.5", c35auto),
  "3.6": llmCheck("3.6"),
  "3.7": llmCheck("3.7"),
};
