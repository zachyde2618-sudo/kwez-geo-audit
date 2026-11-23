import type { GatheredExternal } from "@/lib/external/gather";
import type { CrawlData } from "@/lib/crawler/types";
import type { AuditInput } from "@/lib/schemas/input";
import { packChunks, type PageBlock } from "./chunk";
import { LlmClient } from "./client";
import { aggregate, businessContext, judgeChunk, type Judgement, type SiteReview, type Verdict } from "./review";
import { CRITERIA } from "./rubrics";

/**
 * AI judgements on third-party content (checks 9.5, 9.7, 9.9). Phase 5 gathers the sources
 * (web search results, review pages) and calls runExternalReview; until then the checks
 * report Unable to Verify.
 */

export interface ExternalSource {
  url: string;
  title?: string;
  text: string;
}

export interface ExternalData {
  /** The web searches and classified results (Phase 5), without the source texts below. */
  gathered?: Omit<GatheredExternal, "mentions" | "reviews">;
  /** Why the web search stage failed, when it was attempted. */
  searchError?: string;
  /** Third-party pages mentioning the business (for 9.5 and 9.9). */
  mentions?: ExternalSource[];
  /** Review text from independent platforms (for 9.7). */
  reviews?: ExternalSource[];
  /** Filled in by runExternalReview. */
  model?: string;
  judgements?: Record<string, Judgement>;
}

export function sourceBlock(s: ExternalSource): PageBlock {
  const content = [s.title && `TITLE: ${s.title}`, `TEXT:\n${s.text}`].filter(Boolean).join("\n\n");
  return { url: s.url, prompt: `<page url="${s.url}" type="third-party">\n${content}\n</page>`, source: { url: s.url, text: content } };
}

/** The site's own claims, taken from verified quotes in the site review (6.3, 6.8, 1.2). */
export function siteClaims(review: SiteReview | undefined): string[] {
  if (!review) return [];
  const ids = ["6.3", "6.8", "1.2"];
  return [...new Set(ids.flatMap((id) => review.judgements[id]?.verdict?.quotes.map((q) => q.quote) ?? []))].slice(0, 10);
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const BUSINESS_TYPES = /Organization|LocalBusiness|Store|Corporation|ProfessionalService|MedicalBusiness|HealthAndBeautyBusiness|HomeAndConstructionBusiness|Electrician|Restaurant|Shop/;

/** The business's own name, address, phone and email as the website shows them (for 9.14). */
export function siteDetails(crawl: CrawlData | undefined): string {
  if (!crawl) return "";
  const lines = new Set<string>();
  for (const page of crawl.pages)
    for (const b of page.jsonLd)
      for (const n of b.nodes) {
        const t = [n["@type"]].flat().map(str).join(" ");
        if (!BUSINESS_TYPES.test(t)) continue;
        const a = (Array.isArray(n.address) ? n.address[0] : n.address) as Record<string, unknown> | string | undefined;
        const addr = typeof a === "string" ? a : a ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].map(str).filter(Boolean).join(", ") : "";
        const parts = [str(n.name) && `name: ${str(n.name)}`, addr && `address: ${addr}`, str(n.telephone) && `phone: ${str(n.telephone)}`, str(n.email) && `email: ${str(n.email)}`].filter(Boolean);
        if (parts.length > 1) lines.add(`Structured data (${t}): ${parts.join("; ")}`);
      }
  const home = crawl.pages.find((p) => p.role === "home");
  const contact = crawl.pages.find((p) => p.role === "contact");
  if (home?.footerText) lines.add(`Homepage footer: ${home.footerText.replace(/\s+/g, " ").slice(0, 500)}`);
  if (contact) lines.add(`Contact page (${contact.finalUrl}): ${(contact.mainText || contact.visibleText).replace(/\s+/g, " ").slice(0, 700)}`);
  return [...lines].slice(0, 6).join("\n");
}

export async function runExternalReview(opts: {
  data: ExternalData;
  input: AuditInput;
  siteReview?: SiteReview;
  crawl?: CrawlData;
  client: LlmClient;
  signal: AbortSignal;
}): Promise<Record<string, Judgement>> {
  const { data, client, signal } = opts;
  const claims = siteClaims(opts.siteReview);
  const base = businessContext(opts.input);
  const jobs: { id: string; sources: ExternalSource[]; context: string }[] = [
    { id: "9.5", sources: data.mentions ?? [], context: base },
    { id: "9.7", sources: data.reviews ?? [], context: base },
    { id: "9.9", sources: data.mentions ?? [], context: `${base}\nKey claims made on the website:\n${claims.map((c) => `- "${c}"`).join("\n") || "- (none found)"}` },
    { id: "9.14", sources: data.mentions ?? [], context: `${base}\nThe business's own details as shown on its website:\n${siteDetails(opts.crawl) || "(none found on the crawled pages)"}` },
  ];
  const out: Record<string, Judgement> = {};
  for (const job of jobs) {
    const blocks = job.sources.map(sourceBlock);
    const chunks = packChunks(blocks);
    const j: Judgement = { id: job.id, reviewedPages: blocks.map((b) => b.url), chunks: chunks.length };
    out[job.id] = j;
    if (!chunks.length) {
      j.verdict = { id: job.id, status: "not_applicable", finding: "", quotes: [] };
      continue;
    }
    if (job.id === "9.9" && !claims.length) {
      j.verdict = { id: job.id, status: "not_applicable", finding: "The site makes no specific claims to verify.", quotes: [] };
      continue;
    }
    const verdicts: Verdict[] = [];
    try {
      for (const [i, blocksInChunk] of chunks.entries()) {
        const label = `${CRITERIA[job.id].label} (part ${i + 1} of ${chunks.length})`;
        const v = await judgeChunk({ client, criteria: [CRITERIA[job.id]], blocks: blocksInChunk, context: job.context, purpose: `AI review: ${label}`, chunkLabel: `part="${i + 1} of ${chunks.length}"`, signal });
        verdicts.push(...v);
      }
      j.verdict = aggregate(CRITERIA[job.id], verdicts);
    } catch (err) {
      if (signal.aborted) throw err;
      j.error = err instanceof Error ? err.message : String(err);
    }
  }
  return out;
}
