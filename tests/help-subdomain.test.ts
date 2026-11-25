import { describe, expect, it } from "vitest";
import { findFaq, relPath } from "@/lib/checks/helpers";
import { isHelpSubdomain } from "@/lib/crawler/crawl";
import { extractPage } from "@/lib/crawler/extract";
import type { CrawlData, PageData, PageRole } from "@/lib/crawler/types";

describe("help and FAQ subdomains", () => {
  it("counts the business's own help, support and docs subdomains as part of the site", () => {
    expect(isHelpSubdomain("support.stripe.com", ["stripe.com"])).toBe(true);
    expect(isHelpSubdomain("docs.stripe.com", ["stripe.com"])).toBe(true);
    expect(isHelpSubdomain("help.example.co.uk", ["example.co.uk"])).toBe(true);
    expect(isHelpSubdomain("www.help.example.co.uk", ["example.co.uk"])).toBe(true);
  });

  it("leaves other subdomains and other businesses alone", () => {
    expect(isHelpSubdomain("dashboard.stripe.com", ["stripe.com"])).toBe(false);
    expect(isHelpSubdomain("support.otherbusiness.com", ["stripe.com"])).toBe(false);
    expect(isHelpSubdomain("support.notstripe.com", ["stripe.com"])).toBe(false);
    expect(isHelpSubdomain("stripe.com", ["stripe.com"])).toBe(false);
  });

  it("shows the host for help-subdomain pages so they aren't mistaken for the homepage", () => {
    expect(relPath("https://support.stripe.com/")).toBe("support.stripe.com/");
    expect(relPath("https://stripe.com/pricing")).toBe("/pricing");
  });
});

describe("findFaq", () => {
  const page = (url: string, html: string, role: PageRole): PageData => ({
    ...extractPage({ url, finalUrl: url, status: 200, headers: {}, html, htmlBytes: html.length, ttfbMs: 1, depth: 1, siteHosts: ["x.co.uk"] }),
    role,
  });
  const crawl = (pages: PageData[]) => ({ pages }) as unknown as CrawlData;
  const qa = (n: number) => Array.from({ length: n }, (_, i) => `<h2>Question ${i}?</h2><p>Answer ${i}.</p>`).join("");

  it("judges the FAQ page with the most questions and answers, not just the first found", () => {
    const helpFront = page("https://support.x.co.uk/", "<main><h1>Help centre</h1><h2>Payments</h2><p>Topics</p></main>", "faq");
    const pricing = page("https://x.co.uk/pricing", `<main><h1>Pricing</h1><h2>Frequently asked questions</h2>${qa(6)}</main>`, "services");
    const found = findFaq(crawl([helpFront, pricing]));
    expect(found?.page.finalUrl).toBe("https://x.co.uk/pricing");
  });

  it("still finds a plain FAQ page", () => {
    const faq = page("https://x.co.uk/faq", `<main><h1>FAQ</h1>${qa(2)}</main>`, "faq");
    expect(findFaq(crawl([faq]))?.page.finalUrl).toBe("https://x.co.uk/faq");
    expect(findFaq(crawl([page("https://x.co.uk/about", "<main><h1>About</h1><p>Hi</p></main>", "about")]))).toBeNull();
  });
});
