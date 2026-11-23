import { config } from "@/config";
import { KEY_ROLES } from "@/lib/crawler/crawl";
import type { PageData } from "@/lib/crawler/types";
import type { QuoteSource } from "./quotes";

/**
 * Turns crawled pages into text blocks for the model. Each block is also a quote source:
 * quotes are verified against exactly the text (page title, headings, body, image alt text)
 * that was sent.
 */

export interface PageBlock {
  url: string;
  /** Text shown to the model, including the header. */
  prompt: string;
  /** The quotable text (everything except our own labels). */
  source: QuoteSource;
}

const ROLE_ORDER = [...KEY_ROLES, "case-study", "reviews", "research", "collection", "blog", "post", "other", "policy"];

/** Order pages so key pages are reviewed first; drop error pages and near-empty pages. */
export function reviewablePages(pages: PageData[]): PageData[] {
  return pages
    .filter((p) => p.status >= 200 && p.status < 400 && (p.mainWordCount >= 20 || p.wordCount >= 40))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.depth - b.depth);
}

function bodyText(p: PageData): string {
  return p.mainWordCount >= 40 ? p.mainText : p.visibleText;
}

export interface BlockOptions {
  /** Include image alt text and file names (for checks about information held in images). */
  images?: boolean;
  /** Include the footer (contact details, registration numbers). */
  footer?: boolean;
}

/** Build one or more blocks for a page (a page longer than the chunk size is split). */
export function pageBlocks(p: PageData, opts: BlockOptions = {}, maxChars: number = config.llm.chunkChars): PageBlock[] {
  const outline = p.headings
    .slice(0, 60)
    .map((h) => `${"  ".repeat(Math.max(0, h.level - 1))}H${h.level}: ${h.text}`)
    .join("\n");
  const images = opts.images
    ? p.images
        .filter((i) => i.alt !== "")
        .slice(0, 30)
        .map((i) => `- image file "${i.src.split("/").pop()?.split("?")[0] ?? i.src}" alt text: ${i.alt === null ? "(none)" : i.alt}`)
        .join("\n")
    : "";
  const footer = opts.footer && p.footerText && !bodyText(p).includes(p.footerText) ? p.footerText : "";
  const body = bodyText(p);
  const fixed = outline.length + images.length + footer.length + p.title.length + 300;
  const room = Math.max(4_000, maxChars - fixed);
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += room) parts.push(body.slice(i, i + room));
  if (!parts.length) parts.push("");

  return parts.map((part, i) => {
    const sections = [
      `TITLE: ${p.title}`,
      outline && `HEADINGS:\n${outline}`,
      `TEXT${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ""}:\n${part}`,
      i === 0 && images && `IMAGES (file name and alt text):\n${images}`,
      i === 0 && footer && `FOOTER:\n${footer}`,
    ].filter(Boolean) as string[];
    const content = sections.join("\n\n");
    return {
      url: p.finalUrl,
      prompt: `<page url="${p.finalUrl}" type="${p.role}">\n${content}\n</page>`,
      source: { url: p.finalUrl, text: content },
    };
  });
}

/** Pack blocks into chunks of at most maxChars (a single oversize block gets its own chunk). */
export function packChunks(blocks: PageBlock[], maxChars: number = config.llm.chunkChars): PageBlock[][] {
  const chunks: PageBlock[][] = [];
  let current: PageBlock[] = [];
  let size = 0;
  for (const b of blocks) {
    if (current.length && size + b.prompt.length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(b);
    size += b.prompt.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
