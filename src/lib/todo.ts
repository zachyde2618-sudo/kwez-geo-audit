import { config } from "@/config";
import { CATEGORY_BY_ID, CHECK_BY_ID } from "@/lib/checks/catalogue";
import type { CheckResult, Effort, Impact } from "@/lib/schemas/check";

export type TodoGroup = "week" | "month" | "bigger";

export const GROUP_LABEL: Record<TodoGroup, { title: string; blurb: string }> = {
  week: { title: "Do this week", blurb: "Quick wins: small changes with a real effect." },
  month: { title: "Do this month", blurb: "Moderate jobs worth scheduling now." },
  bigger: { title: "Bigger projects", blurb: "Larger pieces of work that build long-term visibility." },
};

const GROUP_FOR_EFFORT: Record<Effort, TodoGroup> = { "Quick win": "week", Moderate: "month", Major: "bigger" };

export interface GlossaryEntry {
  term: string;
  /** The question shown to the client, e.g. "What's a crawler?" */
  question: string;
  definition: string;
}

export interface TodoItem {
  checkId: string;
  categoryId: number;
  title: string;
  why: string;
  change: string;
  pages: string[];
  status: "fail" | "partial";
  impact: Impact;
  effort: Effort;
  tag: "DIY tweak" | "Kwez can fix this";
  priority: number;
  group: TodoGroup;
  /** Jargon explained here because this is its first appearance in the list. */
  explain: GlossaryEntry[];
}

/** Plain-English explanations, shown the first time a term appears in the to-do list. */
export const GLOSSARY: { re: RegExp; entry: GlossaryEntry }[] = [
  { re: /\bschema( markup)?\b|\bJSON-LD\b/i, entry: { term: "Schema markup", question: "What's schema markup?", definition: "hidden code on your pages that labels your business, people and FAQs so machines understand them without guessing." } },
  { re: /\brobots\.txt\b/i, entry: { term: "robots.txt", question: "What's robots.txt?", definition: "a small file on your website that tells automated visitors which pages they may read." } },
  { re: /\bcrawlers?\b/i, entry: { term: "Crawler", question: "What's a crawler?", definition: "the automated program a search engine or AI company uses to read websites." } },
  { re: /\bnoindex\b/i, entry: { term: "noindex", question: "What's noindex?", definition: "a tag that tells search engines not to list a page." } },
  { re: /\bsameAs\b/, entry: { term: "sameAs", question: "What's sameAs?", definition: "links inside your schema markup that point to your official profiles elsewhere, such as LinkedIn or Companies House." } },
  { re: /\balt text\b|\balt=""/i, entry: { term: "Alt text", question: "What's alt text?", definition: "a short written description of an image, read by screen readers and crawlers instead of the picture." } },
  { re: /\blazy[- ]load/i, entry: { term: "Lazy-loading", question: "What's lazy-loading?", definition: "only loading an image when the visitor scrolls near it, so the top of the page appears faster." } },
  { re: /\bWebP\b|\bAVIF\b/, entry: { term: "WebP / AVIF", question: "What are WebP and AVIF?", definition: "modern image formats that are usually far smaller than JPEG or PNG at the same quality." } },
  { re: /\brender-blocking\b|\bblock the page from showing\b|\bdefer\b/i, entry: { term: "Render-blocking scripts", question: "What are render-blocking scripts?", definition: "code that stops the page appearing until it has downloaded; adding \"defer\" lets the page show first." } },
  { re: /\bJavaScript\b/, entry: { term: "JavaScript", question: "What's JavaScript?", definition: "code that runs in the visitor's browser. Many AI crawlers don't run it, so text it creates can be invisible to them." } },
  { re: /\bserver-side rendering\b|\bstatic generation\b/i, entry: { term: "Server-side rendering", question: "What's server-side rendering?", definition: "building each page's full text on the server, so it arrives ready to read." } },
  { re: /\bHTML\b/, entry: { term: "HTML", question: "What's HTML?", definition: "the code a web page is made of; it's what crawlers download and read." } },
  { re: /\bdateModified\b/, entry: { term: "dateModified", question: "What's dateModified?", definition: "a date in your schema markup saying when a page last changed." } },
  { re: /\btranscripts?\b/i, entry: { term: "Transcript", question: "What's a transcript?", definition: "a written version of everything said in a video." } },
  { re: /\bOAI-SearchBot\b|\bClaude-SearchBot\b|\bPerplexityBot\b|\bGPTBot\b/, entry: { term: "AI search vs training crawlers", question: "What's the difference between AI search and training crawlers?", definition: "search crawlers (e.g. OAI-SearchBot) fetch pages to answer live questions and cite you; training crawlers (e.g. GPTBot) collect text to train future models." } },
  { re: /\bFAQPage\b/, entry: { term: "FAQPage", question: "What's FAQPage?", definition: "the schema type that marks a page as questions and answers." } },
];

/** priority = impact × check weight × category weight ÷ effort */
export function priorityOf(impact: Impact, checkWeight: number, categoryWeight: number, effort: Effort): number {
  return (config.priority.impact[impact] * checkWeight * categoryWeight) / config.priority.effort[effort];
}

export function buildTodo(results: CheckResult[]): TodoItem[] {
  const items: TodoItem[] = [];
  for (const r of results) {
    if (r.status !== "fail" && r.status !== "partial") continue;
    const meta = CHECK_BY_ID.get(r.id);
    if (!meta) continue;
    const cat = CATEGORY_BY_ID.get(meta.categoryId)!;
    items.push({
      checkId: r.id,
      categoryId: meta.categoryId,
      title: meta.todoTitle,
      why: meta.why,
      change: r.requiredChange || r.issue,
      pages: [...new Set(r.pages)],
      status: r.status,
      impact: r.impact,
      effort: r.effort,
      tag: meta.fixTag === "kwez" ? "Kwez can fix this" : "DIY tweak",
      priority: priorityOf(r.impact, meta.weight, cat.weight, r.effort),
      group: GROUP_FOR_EFFORT[r.effort],
      explain: [],
    });
  }
  const order: TodoGroup[] = ["week", "month", "bigger"];
  items.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.priority - a.priority || compareIds(a.checkId, b.checkId));

  // Explain each jargon term once, on the first item (in display order) that uses it.
  const explained = new Set<string>();
  for (const item of items) {
    const text = `${item.title} ${item.why} ${item.change}`;
    for (const g of GLOSSARY) {
      if (explained.has(g.entry.term) || !g.re.test(text)) continue;
      explained.add(g.entry.term);
      item.explain.push(g.entry);
    }
  }
  return items;
}

function compareIds(a: string, b: string): number {
  const [a1, a2] = a.split(".").map(Number);
  const [b1, b2] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
}
