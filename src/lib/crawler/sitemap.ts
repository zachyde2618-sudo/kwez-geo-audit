import * as cheerio from "cheerio";

export interface SitemapParse {
  kind: "urlset" | "index" | "unknown";
  urls: { loc: string; lastmod?: string }[];
  children: string[];
}

/** Parse a sitemap or sitemap index. Plain-text sitemaps (one URL per line) are supported too. */
export function parseSitemap(body: string): SitemapParse {
  const trimmed = body.trim();
  if (!trimmed.startsWith("<")) {
    const urls = trimmed
      .split(/\s+/)
      .filter((l) => /^https?:\/\//.test(l))
      .map((loc) => ({ loc }));
    return { kind: urls.length ? "urlset" : "unknown", urls, children: [] };
  }
  const $ = cheerio.load(trimmed, { xml: true });
  if ($("sitemapindex").length) {
    const children = $("sitemapindex > sitemap > loc")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    return { kind: "index", urls: [], children };
  }
  if ($("urlset").length) {
    const urls = $("urlset > url")
      .map((_, el) => {
        const loc = $(el).children("loc").text().trim();
        const lastmod = $(el).children("lastmod").text().trim() || undefined;
        return { loc, lastmod };
      })
      .get()
      .filter((u) => u.loc);
    return { kind: "urlset", urls, children: [] };
  }
  return { kind: "unknown", urls: [], children: [] };
}
