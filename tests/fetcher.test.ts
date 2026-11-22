import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { politeFetch } from "@/lib/crawler/fetcher";

let server: Server;
let base: string;
const hits: { at: number; ua: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push({ at: Date.now(), ua: String(req.headers["user-agent"]) });
    if (req.url === "/old") {
      res.writeHead(301, { location: "/new" }).end();
      return;
    }
    if (req.url === "/big") {
      res.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(5000));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" }).end("<p>ok</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.ALLOW_LOCAL_TARGETS;
  delete process.env.CRAWL_MIN_INTERVAL_MS;
});

describe("politeFetch", () => {
  it("refuses private addresses unless local targets are allowed", async () => {
    delete process.env.ALLOW_LOCAL_TARGETS;
    const r = await politeFetch(`${base}/`);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/private address/);
    expect(hits).toHaveLength(0);
  });

  it("sends the Kwez user agent and spaces requests to one host at least 1 second apart", async () => {
    process.env.ALLOW_LOCAL_TARGETS = "true";
    delete process.env.CRAWL_MIN_INTERVAL_MS; // real politeness interval
    hits.length = 0;
    await Promise.all([politeFetch(`${base}/a`), politeFetch(`${base}/b`), politeFetch(`${base}/c`)]);
    expect(hits).toHaveLength(3);
    expect(hits.every((h) => h.ua.startsWith("KwezGEOAudit/1.0 (+"))).toBe(true);
    expect(hits[1].at - hits[0].at).toBeGreaterThanOrEqual(950);
    expect(hits[2].at - hits[1].at).toBeGreaterThanOrEqual(950);
  }, 10_000);

  it("follows redirects manually and records each hop", async () => {
    process.env.ALLOW_LOCAL_TARGETS = "true";
    process.env.CRAWL_MIN_INTERVAL_MS = "0";
    const r = await politeFetch(`${base}/old`);
    expect(r.status).toBe(200);
    expect(r.finalUrl).toBe(`${base}/new`);
    expect(r.redirects).toEqual([`301 ${base}/old`]);
  });

  it("caps the body size and reports truncation", async () => {
    process.env.ALLOW_LOCAL_TARGETS = "true";
    process.env.CRAWL_MIN_INTERVAL_MS = "0";
    const r = await politeFetch(`${base}/big`, { maxBytes: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(1000);
  });

  it("does not jam the per-host queue when a waiting request is cancelled", async () => {
    process.env.ALLOW_LOCAL_TARGETS = "true";
    process.env.CRAWL_MIN_INTERVAL_MS = "200";
    const ctl = new AbortController();
    const first = politeFetch(`${base}/a`);
    const cancelled = politeFetch(`${base}/b`, { signal: ctl.signal }); // queued behind the first
    ctl.abort(new Error("Cancelled by user"));
    await first;
    await expect(cancelled).rejects.toThrow("Cancelled by user");
    // Before the fix this request waited forever for a slot the cancelled one never released.
    const after = await Promise.race([
      politeFetch(`${base}/c`),
      new Promise<"hung">((r) => setTimeout(() => r("hung"), 3_000)),
    ]);
    expect(after).not.toBe("hung");
    expect((after as { status: number }).status).toBe(200);
  }, 10_000);
});
