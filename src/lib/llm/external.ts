import type { GatheredExternal } from "@/lib/external/gather";
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

export async function runExternalReview(opts: {
  data: ExternalData;
  input: AuditInput;
  siteReview?: SiteReview;
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
