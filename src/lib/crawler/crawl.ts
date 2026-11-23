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
/** Pages never worth auditing: carts, accounts, checkouts, search results, logins. */
const SKIP_PATH = /\/(cart|basket|checkout|account|my-account|login|log-in|sign-in|signin|register|sign-up|wishlist|compare|search)(\/|$)/i;
/** Query strings that only re-sort or re-filter the same page, or pick a product variant. */
const SKIP_QUERY = /[?&](variant|sort_by|sort|orderby|filter\.[^=]*|q|add-to-cart|currency|ref|utm_[a-z]+)=/i;

/**
 * How the crawl budget is shared between kinds of page (see planNext):
 *  - weight: share of the budget once every must-have page is in (higher = more pages)
 *  - cap: most pages of that kind, as a share of the budget (min 1); beyond it, a kind only
 *    gets pages once every other kind has had its share
 *  - priority: tie-breaker, and the order for must-haves and for filling spare slots
 */
export const ROLE_PLAN: Record<PageRole, { weight: number; cap: number; priority: number; mustHave?: boolean }> = {
  home: { weight: 0, cap: 0, priority: 0 },
  about: { weight: 1.5, cap: 0.08, priority: 1, mustHave: true },
  faq: { weight: 2.5, cap: 0.2, priority: 1, mustHave: true },
  services: { weight: 3.5, cap: 0.35, priority: 1, mustHave: true },
  product: { weight: 3.5, cap: 0.35, priority: 1, mustHave: true },
  team: { weight: 1, cap: 0.08, priority: 2, mustHave: true },
  contact: { weight: 0.5, cap: 0.04, priority: 2, mustHave: true },
  reviews: { weight: 1, cap: 0.08, priority: 2, mustHave: true },
  "case-study": { weight: 1.5, cap: 0.12, priority: 2, mustHave: true },
  research: { weight: 1, cap: 0.1, priority: 2 },
  collection: { weight: 1, cap: 0.12, priority: 3 },
  post: { weight: 2, cap: 0.2, priority: 3 },
  blog: { weight: 0.3, cap: 0.04, priority: 4 },
  other: { weight: 1, cap: 0.15, priority: 4 },
  policy: { weight: 0.2, cap: 0.04, priority: 5 },
};

interface Queued {
  depth: number;
  role: PageRole;
}

/**
 * Choose the next page to fetch: first one of each must-have kind (About, FAQ, services,
 * products, team, contact, reviews, case studies), then share the rest of the budget by
 * weight, never letting one kind pass its cap while others are waiting. Within a kind,
 * pages closer to the homepage (and shorter URLs) come first.
 */
export function planNext(queue: Map<string, Queued>, picked: Partial<Record<PageRole, number>>, maxPages: number): string | undefined {
  const byRole = new Map<PageRole, [string, Queued][]>();
  for (const e of queue) {
    const list = byRole.get(e[1].role) ?? [];
    list.push(e);
    byRole.set(e[1].role, list);
  }
  const best = (role: PageRole) =>
    byRole.get(role)!.sort(([ua, a], [ub, b]) => a.depth - b.depth || ua.length - ub.length || ua.localeCompare(ub))[0][0];
  const roles = [...byRole.keys()].sort((a, b) => ROLE_PLAN[a].priority - ROLE_PLAN[b].priority || a.localeCompare(b));
  const n = (r: PageRole) => picked[r] ?? 0;

  const must = roles.find((r) => ROLE_PLAN[r].mustHave && n(r) === 0);
  if (must) return best(must);

  const capOf = (r: PageRole) => Math.max(1, Math.round(ROLE_PLAN[r].cap * maxPages));
  const open = roles.filter((r) => ROLE_PLAN[r].weight > 0 && n(r) < capOf(r));
  if (open.length) {
    open.sort((a, b) => (n(a) + 1) / ROLE_PLAN[a].weight - (n(b) + 1) / ROLE_PLAN[b].weight || ROLE_PLAN[a].priority - ROLE_PLAN[b].priority);
    return best(open[0]);
  }
  // Every kind has had its share: keep sharing spare slots by weight, without caps.
  const spare = roles.filter((r) => ROLE_PLAN[r].weight > 0);
  spare.sort((a, b) => (n(a) + 1) / ROLE_PLAN[a].weight - (n(b) + 1) / ROLE_PLAN[b].weight || ROLE_PLAN[a].priority - ROLE_PLAN[b].priority);
  return spare.length ? best(spare[0]) : roles.length ? best(roles[0]) : undefined;
}

export const ROLE_LABEL: Record<PageRole, string> = {
  home: "home", about: "about", team: "team", services: "service", product: "product", collection: "collection",
  faq: "FAQ", contact: "contact", blog: "blog index", post: "article", "case-study": "case study", reviews: "reviews",
  research: "research", policy: "policy", other: "other",
};

export const KEY_ROLES: PageRole[] = ["home", "about", "team", "services", "product", "faq", "contact"];

/** URL to fetch: as linked, without the fragment. */
/** Shopify serves every product at /products/<slug> and again under each collection. */
const SHOPIFY_COLLECTION_PRODUCT = /^\/collections\/[^/]+(\/products\/[^/]+\/?)$/i;

function fetchableUrl(u: string): string {
  const url = new URL(u);
  url.hash = "";
  const m = SHOPIFY_COLLECTION_PRODUCT.exec(url.pathname);
  if (m) url.pathname = m[1];
  return url.toString();
}

/** Key for de-duplication only: ignores a trailing slash and the host's www. prefix. */
function canonicalUrl(u: string): string {
  const url = new URL(fetchableUrl(u));
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
  const queue = new Map<string, Queued>();
  const picked: Partial<Record<PageRole, number>> = {};

  const isInternal = (u: string) => hosts.has(hostKey(new URL(u).hostname));
  const queueKeys = new Map<string, string>(); // canonical key → URL in queue
  // A page named after the brand (Shopify's /pages/saira) is usually the About page.
  const brand = hostKey(start.hostname).split(".")[0].replace(/[^a-z0-9]/g, "");
  const roleFor = (u: string): PageRole => {
    const role = classifyRole(u);
    if (role !== "other") return role;
    const slug = new URL(u).pathname.split("/").filter(Boolean).at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    return slug.length >= 4 && (brand.startsWith(slug) || slug.startsWith(brand)) ? "about" : role;
  };
  const enqueue = (u: string, depth: number) => {
    let c: string;
    let f: string;
    try {
      c = canonicalUrl(u);
      f = fetchableUrl(u);
    } catch {
      return;
    }
    const fu = new URL(f);
    if (seen.has(c) || !isInternal(f) || NON_HTML.test(fu.pathname) || SKIP_PATH.test(fu.pathname) || SKIP_QUERY.test(fu.search)) return;
    const existing = queueKeys.get(c);
    const prev = existing ? queue.get(existing) : undefined;
    if (prev && depth >= prev.depth) return;
    if (existing) queue.delete(existing);
    queueKeys.set(c, f);
    queue.set(f, { depth, role: roleFor(f) });
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
    if (page.role === "other") page.role = roleFor(page.finalUrl);
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
    const url = planNext(queue, picked, maxPages)!;
    const meta = queue.get(url)!;
    queue.delete(url);
    queueKeys.delete(canonicalUrl(url));
    picked[meta.role] = (picked[meta.role] ?? 0) + 1;
    progress(`Fetching page ${pages.length + 1} of up to ${maxPages} (${ROLE_LABEL[meta.role]}): ${new URL(url).pathname}`);
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
  const assetPages = [...pages].sort((a, b) => ROLE_PLAN[a.role].priority - ROLE_PLAN[b.role].priority).slice(0, config.crawler.assetPages);
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
