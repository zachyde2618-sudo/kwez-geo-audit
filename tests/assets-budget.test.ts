import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlSite } from "@/lib/crawler/crawl";
import { parseAuditInput } from "@/lib/schemas/input";

/** A script-heavy theme (like Shopify's) must not use up the whole measuring budget before images. */

let server: Server;
let base: string;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000010000000100806000000", "hex");

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nAllow: /");
    if (req.url?.startsWith("/s/")) return res.writeHead(200, { "content-type": "application/javascript" }).end("1");
    if (req.url?.startsWith("/c/")) return res.writeHead(200, { "content-type": "text/css" }).end("a{}");
    if (req.url?.startsWith("/i/")) return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    if (req.url === "/" || req.url === "/pages/about") {
      const scripts = Array.from({ length: 45 }, (_, i) => `<script src="/s/${req.url!.length}-${i}.js"></script>`).join("");
      const styles = Array.from({ length: 15 }, (_, i) => `<link rel="stylesheet" href="/c/${req.url!.length}-${i}.css">`).join("");
      const imgs = Array.from({ length: 6 }, (_, i) => `<img src="/i/${req.url!.length}-${i}.png" alt="Product ${i}" width="16" height="16">`).join("");
      return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><head><title>Shop</title>${scripts}${styles}</head><body><h1>Shop</h1><a href="/pages/about">About</a><p>Lots of words here about the shop and what it sells to customers.</p>${imgs}</body></html>`);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
  process.env.ALLOW_LOCAL_TARGETS = "true";
  process.env.CRAWL_MIN_INTERVAL_MS = "0";
  process.env.BOT_UA_PROBES = "false";
});
afterAll(() => server.close());

describe("asset measuring budget", () => {
  it("measures images from every main page even when scripts and stylesheets would fill the budget", async () => {
    const crawl = await crawlSite(parseAuditInput({ url: base, options: { maxPages: 5 } }, true), new AbortController().signal, () => {});
    const images = crawl.assets.filter((a) => a.kind === "image");
    expect(images.length).toBeGreaterThanOrEqual(10);
    expect(images.every((a) => a.status === 200)).toBe(true);
    expect(new Set(images.flatMap((a) => a.pages)).size).toBe(2); // home and about both represented
    expect(crawl.assets.filter((a) => a.kind === "script").length).toBeLessThanOrEqual(12);
  }, 60_000);
});
