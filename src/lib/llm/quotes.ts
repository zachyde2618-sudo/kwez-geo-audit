/**
 * Quote verification. Every quote the model returns must appear verbatim in the text we
 * sent it. "Verbatim" tolerates only differences that are invisible to a reader:
 * whitespace runs, typographic vs straight quotes/apostrophes, dash variants, non-breaking
 * spaces and the ellipsis character. Case, words and punctuation must match exactly.
 */

export const MIN_QUOTE_CHARS = 8;

export function normaliseForQuote(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\s ​]+/g, " ")
    .trim();
}

/** True when `quote` appears verbatim (after invisible-difference normalisation) in `source`. */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normaliseForQuote(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  return normaliseForQuote(source).includes(q);
}

export interface QuoteSource {
  url: string;
  text: string;
}

export interface QuoteCheck {
  ok: boolean;
  /** The URL whose text contains the quote (may differ from the one the model claimed). */
  url?: string;
  reason?: string;
}

/**
 * Verify a quote against the sources sent in one request. Prefer the URL the model named; if
 * the quote is in a different source from the same request it is still verbatim evidence, so
 * the URL is corrected rather than rejected.
 */
export function verifyQuote(quote: string, claimedUrl: string, sources: QuoteSource[]): QuoteCheck {
  if (normaliseForQuote(quote).length < MIN_QUOTE_CHARS) return { ok: false, reason: `quote is shorter than ${MIN_QUOTE_CHARS} characters` };
  const claimed = sources.find((s) => s.url === claimedUrl);
  if (claimed && quoteAppearsIn(quote, claimed.text)) return { ok: true, url: claimed.url };
  const other = sources.find((s) => quoteAppearsIn(quote, s.text));
  if (other) return { ok: true, url: other.url };
  return { ok: false, reason: "quote does not appear verbatim in the supplied text" };
}
