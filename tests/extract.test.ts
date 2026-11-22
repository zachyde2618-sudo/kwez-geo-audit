import { describe, expect, it } from "vitest";
import { classifyRole, extractPage } from "@/lib/crawler/extract";
import { imageDimensions } from "@/lib/crawler/imageSize";
import { parseSitemap } from "@/lib/crawler/sitemap";

describe("classifyRole", () => {
  it.each([
    ["https://x.co.uk/", "home"],
    ["https://x.co.uk/index.html", "home"],
    ["https://x.co.uk/about.html", "about"],
    ["https://x.co.uk/about-us/", "about"],
    ["https://x.co.uk/our-team", "team"],
    ["https://x.co.uk/services/rewiring", "services"],
    ["https://x.co.uk/faq", "faq"],
    ["https://x.co.uk/contact-us.php", "contact"],
    ["https://x.co.uk/blog/", "blog"],
    ["https://x.co.uk/blog/page/2", "blog"],
    ["https://x.co.uk/blog/my-post", "post"],
    ["https://x.co.uk/case-studies/acme", "case-study"],
    ["https://x.co.uk/random", "other"],
  ])("%s → %s", (url, role) => expect(classifyRole(url)).toBe(role));
});

const page = (html: string) =>
  extractPage({ url: "https://x.co.uk/p", finalUrl: "https://x.co.uk/p", status: 200, headers: {}, html, htmlBytes: html.length, ttfbMs: 1, depth: 0, siteHosts: ["x.co.uk"] });

describe("extractPage", () => {
  it("keeps block boundaries when extracting text", () => {
    expect(page("<body><p>Hello</p><p>World</p></body>").visibleText).toBe("Hello World");
  });

  it("pairs question headings with the answer that follows", () => {
    const p = page("<main><section><h2>How long does it take?</h2><p>About three hours.</p></section></main>");
    expect(p.sections[0]).toMatchObject({ heading: "How long does it take?", firstText: "About three hours.", adjacent: true });
  });

  it("treats <details><summary> as a question", () => {
    const p = page("<details><summary>Do you cover Leeds?</summary><p>Yes, all LS postcodes.</p></details>");
    expect(p.sections[0]).toMatchObject({ tag: "summary", firstText: "Yes, all LS postcodes.", adjacent: true });
  });

  it("parses JSON-LD @graph and reports parse errors", () => {
    const p = page(`<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"A"},{"@type":"WebSite"}]}</script><script type="application/ld+json">{bad</script>`);
    expect(p.jsonLd[0].nodes.map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);
    expect(p.jsonLd[1].error).toBeTruthy();
  });

  it("ignores script and style text and detects an empty app shell", () => {
    const p = page('<body><div id="root"></div><script>var secret = "x"</script><style>.a{}</style></body>');
    expect(p.visibleText).toBe("");
    expect(p.spaShell).toBe(true);
  });

  it("reads the footer copyright year and internal/external links", () => {
    const p = page('<body><a href="/about">About</a><a href="https://gov.uk/x">Gov</a><footer>© 2019–2024 X Ltd</footer></body>');
    expect(p.copyrightYear).toBe(2024);
    expect(p.links.map((l) => l.internal)).toEqual([true, false]);
  });

  it("rejects future dates as freshness evidence", () => {
    const p = page('<time datetime="2999-01-01">future</time><time datetime="2024-05-01">past</time>');
    expect(p.dates.map((d) => d.date.slice(0, 10))).toEqual(["2024-05-01"]);
  });
});

describe("imageDimensions", () => {
  it("reads PNG headers", () => {
    const b = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
    b.writeUInt32BE(640, 16);
    b.writeUInt32BE(480, 20);
    expect(imageDimensions(b)).toEqual({ width: 640, height: 480, format: "png" });
  });
});

describe("parseSitemap", () => {
  it("parses a urlset and a sitemap index", () => {
    expect(parseSitemap('<urlset><url><loc>https://x.co.uk/a</loc><lastmod>2024-01-01</lastmod></url></urlset>').urls).toEqual([{ loc: "https://x.co.uk/a", lastmod: "2024-01-01" }]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://x.co.uk/s1.xml</loc></sitemap></sitemapindex>").children).toEqual(["https://x.co.uk/s1.xml"]);
  });
});
