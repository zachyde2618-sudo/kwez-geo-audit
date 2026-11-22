import { config } from "@/config";
import type { AuditInput } from "@/lib/schemas/input";
import { classifyRole, extractPage, hostKey } from "./extract";
import { bodyText, politeFetch } from "./fetcher";
import { imageDimensions } from "./imageSize";
import { compareRendered } from "./render";
import { isAllowed, pathOf, robotsFromStatus } from "./robots";
import { parseSitemap } from "./sitemap";
import type { AssetInfo, BotProbe, CrawlData, PageData, PageRole } from "./types";

export const OUR_UA_TOKEN = "KwezGEOAudit";
const NON_HTML = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|webp|avif|svg|ico|mp4|mov|webm|mp3|wav|xml|json|csv|txt|rss|atom|css|js)(\?|$)/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?)(\?|$)/i;
const MAX_SITEMAP_FILES = 4;
const MAX_SITEMAP_URLS = 1000;
const MAX_POSTS = 5;

const ROLE_PRIORITY: Record<PageRole, number> = {
  home: 0,
  faq: 1,
  about: 1,
  team: 1,
  services: 1,
  contact: 2,
  "case-study": 2,
  reviews: 2,
  research: 2,
  blog: 3,
  other: 4,
  post: 5,
};

export const KEY_ROLES: PageRole[] = ["home", "about", "team", "services", "faq", "contact"];

/** URL to fetch: as linked, without the fragment. */
function fetchableUrl(u: string): string {
  const url = new URL(u);
  url.hash = "";
  return url.toString();
}

/** Key for de-duplication only: ignores a trailing slash and the host's www. prefix. */
function canonicalUrl(u: string): string {
  const url = new URL(u);
  url.hash = "";
  const path = url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "/";
  return `${url.protocol}//${hostKey(url.hostname)}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
}

function isHtml(contentType: string, body: Buffer): boolean {
  if (contentType.includes("html")) return true;
  if (contentType) return false;
  return /^\s*<(!doctype html|html)/i.test(body.subarray(0, 200).toString("utf8"));
}

export async function crawlSite(input: AuditInput, signal: AbortSignal, progress: (m: string) => void): Promise<CrawlData> {
  const start = new URL(input.url);
  const origin = start.origin;
  const hosts = new Set([hostKey(start.hostname)]);
  const maxPages = input.options.maxPages;

  // ── robots.txt ──
  progress("Checking robots.txt…");
  const robotsUrl = `${origin}/robots.txt`;
  const robotsRes = await politeFetch(robotsUrl, { signal, accept: "text/plain,*/*;q=0.5" });
  const robotsBody = robotsRes.status >= 200 && robotsRes.status < 300 ? bodyText(robotsRes).slice(0, 500_000) : "";
  const robots = robotsFromStatus(robotsRes.status, robotsBody);
  const allowedForUs = (u: string) => isAllowed(robots, OUR_UA_TOKEN, pathOf(u)).allowed;

  // ── sitemap(s) ──
  progress("Reading sitemap.xml…");
  const sitemapQueue = robots.sitemaps.length ? [...robots.sitemaps] : [`${origin}/sitemap.xml`];
  const sitemapSources: string[] = [];
  const sitemapUrls: { loc: string; lastmod?: string }[] = [];
  let sitemapError: string | undefined;
  while (sitemapQueue.length && sitemapSources.length < MAX_SITEMAP_FILES && sitemapUrls.length < MAX_SITEMAP_URLS) {
    const smUrl = sitemapQueue.shift()!;
    const r = await politeFetch(smUrl, { signal, accept: "application/xml,text/xml,*/*;q=0.5" });
    if (r.status !== 200) {
      sitemapError = `${smUrl} returned ${r.status || r.error}`;
      continue;
    }
    sitemapSources.push(smUrl);
    const parsed = parseSitemap(bodyText(r));
    sitemapQueue.push(...parsed.children.slice(0, MAX_SITEMAP_FILES));
    sitemapUrls.push(...parsed.urls.slice(0, MAX_SITEMAP_URLS - sitemapUrls.length));
  }

  // ── llms.txt (informational) ──
  progress("Checking /llms.txt…");
  const llmsRes = await politeFetch(`${origin}/llms.txt`, { signal, accept: "text/plain,text/markdown,*/*;q=0.5", maxBytes: 512 * 1024 });
  const llmsOk = llmsRes.status === 200 && !llmsRes.contentType.includes("html");

  // ── pages ──
  const pages: PageData[] = [];
  const skippedByRobots: string[] = [];
  const failedFetches: CrawlData["failedFetches"] = [];
  const documents: CrawlData["documents"] = [];
  const seen = new Set<string>();
  const queue = new Map<string, { depth: number; role: PageRole }>();
  let postCount = 0;

  const isInternal = (u: string) => hosts.has(hostKey(new URL(u).hostname));
  const queueKeys = new Map<string, string>(); // canonical key → URL in queue
  const enqueue = (u: string, depth: number) => {
    let c: string;
    let f: string;
    try {
      c = canonicalUrl(u);
      f = fetchableUrl(u);
    } catch {
      return;
    }
    if (seen.has(c) || !isInternal(f) || NON_HTML.test(new URL(f).pathname)) return;
    const existing = queueKeys.get(c);
    const prev = existing ? queue.get(existing) : undefined;
    if (prev && depth >= prev.depth) return;
    if (existing) queue.delete(existing);
    queueKeys.set(c, f);
    queue.set(f, { depth, role: classifyRole(f) });
  };

  const fetchPage = async (url: string, depth: number): Promise<PageData | null> => {
    seen.add(canonicalUrl(url));
    if (!allowedForUs(url)) {
      skippedByRobots.push(url);
      return null;
    }
    const r = await politeFetch(url, { signal });
    const finalCanon = canonicalUrl(r.finalUrl);
    seen.add(finalCanon);
    if (r.status === 0 || !isHtml(r.contentType, r.body)) {
      failedFetches.push({ url, status: r.status, error: r.error ?? (r.status ? `Not HTML (${r.contentType || "no content type"})` : undefined) });
      return null;
    }
    const page = extractPage({
      url,
      finalUrl: r.finalUrl,
      status: r.status,
      headers: r.headers,
      html: bodyText(r),
      htmlBytes: r.bytes,
      ttfbMs: r.ttfbMs,
      depth,
      siteHosts: [...hosts],
    });
    if (r.status >= 400) failedFetches.push({ url, status: r.status });
    return page;
  };

  progress(`Fetching homepage ${start.toString()}…`);
  const home = await fetchPage(start.toString(), 0);
  if (home) {
    hosts.add(hostKey(new URL(home.finalUrl).hostname));
    home.role = "home";
    pages.push(home);
    for (const l of home.links) if (l.internal) enqueue(l.href, 1);
  }
  for (const s of sitemapUrls) enqueue(s.loc, 9);
  if (home) {
    for (const l of home.links) {
      if (DOC_EXT.test(l.href)) documents.push({ url: l.href, from: home.finalUrl, text: l.text });
    }
  }

  while (pages.length < maxPages && queue.size && home && home.status < 400) {
    signal.throwIfAborted();
    const [next] = [...queue.entries()].sort(
      ([ua, a], [ub, b]) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] || a.depth - b.depth || ua.length - ub.length,
    );
    const [url, meta] = next;
    queue.delete(url);
    queueKeys.delete(canonicalUrl(url));
    if (meta.role === "post") {
      if (postCount >= MAX_POSTS) continue;
      postCount++;
    }
    progress(`Fetching page ${pages.length + 1} of up to ${maxPages}: ${new URL(url).pathname}`);
    const page = await fetchPage(url, meta.depth);
    if (!page) continue;
    pages.push(page);
    for (const l of page.links) {
      if (DOC_EXT.test(l.href)) documents.push({ url: l.href, from: page.finalUrl, text: l.text });
      if (l.internal && meta.depth + 1 <= 3) enqueue(l.href, meta.depth + 1);
    }
  }

  // ── true click depth from the homepage (BFS over crawled pages) ──
  if (home) {
    const byUrl = new Map<string, PageData>();
    for (const p of pages) {
      byUrl.set(canonicalUrl(p.url), p);
      byUrl.set(canonicalUrl(p.finalUrl), p);
      p.depth = 99;
    }
    home.depth = 0;
    const bfs: PageData[] = [home];
    while (bfs.length) {
      const p = bfs.shift()!;
      for (const l of p.links) {
        if (!l.internal) continue;
        let target: PageData | undefined;
        try {
          target = byUrl.get(canonicalUrl(l.href));
        } catch {
          continue;
        }
        if (target && target.depth > p.depth + 1) {
          target.depth = p.depth + 1;
          bfs.push(target);
        }
      }
    }
  }

  // ── assets (images, scripts, stylesheets) on the most important pages ──
  const assetPages = [...pages].sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role]).slice(0, config.crawler.assetPages);
  const assetMap = new Map<string, AssetInfo>();
  const addAsset = (url: string, kind: AssetInfo["kind"], page: string) => {
    if (url.startsWith("data:")) return;
    const existing = assetMap.get(url);
    if (existing) {
      if (!existing.pages.includes(page)) existing.pages.push(page);
      return;
    }
    if (assetMap.size >= config.crawler.maxAssets) return;
    assetMap.set(url, { url, kind, status: 0, bytes: 0, overLimit: false, contentType: "", thirdParty: !isInternal(url), pages: [page] });
  };
  for (const p of assetPages) {
    p.scripts.forEach((s) => s.src && addAsset(s.src, "script", p.finalUrl));
    p.stylesheets.forEach((s) => addAsset(s.href, "stylesheet", p.finalUrl));
  }
  for (const p of assetPages) p.images.forEach((i) => addAsset(i.src, "image", p.finalUrl));

  if (assetMap.size) {
    progress(`Measuring ${assetMap.size} images, scripts and stylesheets…`);
    const byHost = new Map<string, AssetInfo[]>();
    for (const a of assetMap.values()) {
      const h = new URL(a.url).host;
      byHost.set(h, [...(byHost.get(h) ?? []), a]);
    }
    const limit = config.thresholds.googlebotFetchLimitBytes + 512 * 1024;
    await Promise.all(
      [...byHost.values()].map(async (list) => {
        for (const a of list) {
          signal.throwIfAborted();
          const r = await politeFetch(a.url, { signal, maxBytes: limit, accept: "*/*" });
          a.status = r.status;
          a.bytes = r.bytes;
          a.overLimit = r.truncated || r.bytes > config.thresholds.googlebotFetchLimitBytes;
          a.contentType = r.contentType;
          if (r.error) a.error = r.error;
          if (a.kind === "image" && r.status === 200) {
            const dims = imageDimensions(r.body);
            if (dims) {
              a.width = dims.width;
              a.height = dims.height;
            }
          }
        }
      }),
    );
  }

  // ── bot user-agent probes (homepage only, indicative) ──
  const botProbes: BotProbe[] = [];
  if (home && config.crawler.botUaProbes) {
    progress("Testing how the homepage responds to AI crawler user agents…");
    for (const [agent, ua] of Object.entries(config.botProbeUserAgents)) {
      signal.throwIfAborted();
      const r = await politeFetch(home.finalUrl, { signal, userAgent: `${ua} ${OUR_UA_TOKEN}/1.0-probe (+${config.crawler.contactUrl})`, maxBytes: 64 * 1024 });
      const blocked = home.status < 400 && [401, 403, 406, 429, 451, 503].includes(r.status);
      botProbes.push({ agent, status: r.status, baselineStatus: home.status, blocked, error: r.error });
    }
  }

  // ── raw vs rendered (homepage + 2 key pages) ──
  let renders: CrawlData["renders"] = null;
  let renderError: string | undefined;
  if (home) {
    // Pages most likely to depend on JavaScript first: empty app shells, then least raw text.
    const others = pages
      .filter((p) => p !== home && KEY_ROLES.includes(p.role) && p.status < 400)
      .sort((a, b) => Number(b.spaShell) - Number(a.spaShell) || a.mainWordCount - b.mainWordCount);
    const targets = [home, ...others.slice(0, 2)];
    if (config.crawler.enablePlaywright) progress(`Rendering ${targets.length} pages with JavaScript to compare with the raw HTML…`);
    const r = await compareRendered(targets.map((p) => ({ url: p.finalUrl, rawMainText: p.mainText })), signal);
    renders = r.results;
    renderError = r.reason;
  }

  return {
    origin,
    hosts: [...hosts],
    startedAt: new Date().toISOString(),
    robots: { url: robotsUrl, status: robotsRes.status, body: robotsBody.slice(0, 20_000), parsed: robots, error: robotsRes.error },
    sitemap: { urls: sitemapUrls, sources: sitemapSources, error: sitemapSources.length ? undefined : sitemapError },
    llmsTxt: { status: llmsOk ? 200 : llmsRes.status, bytes: llmsOk ? llmsRes.bytes : 0, url: `${origin}/llms.txt` },
    pages,
    skippedByRobots,
    failedFetches,
    documents: dedupeBy(documents, (d) => d.url).slice(0, 50),
    assets: [...assetMap.values()],
    botProbes,
    renders,
    renderError,
  };
}

function dedupeBy<T>(arr: T[], key: (t: T) => string): T[] {
  const s = new Set<string>();
  return arr.filter((x) => (s.has(key(x)) ? false : (s.add(key(x)), true)));
}
