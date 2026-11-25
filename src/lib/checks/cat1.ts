import { hostKey } from "@/lib/crawler/extract";
import { config } from "@/config";
import { describeDecision, isAllowed, pathOf } from "@/lib/crawler/robots";
import type { CrawlData, PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import { llmCheck, withAiPart } from "./llm";
import { ev, fmtBytes, homePage, isResult, keyPages, listSome, needCrawl, relPath } from "./helpers";
import type { CheckImpl, RawCheckResult } from "./types";
import { unable } from "./types";

type Agent = (typeof config.aiAgents)[number];

const ASSISTANT: Record<string, string> = { OpenAI: "ChatGPT", Anthropic: "Claude", Perplexity: "Perplexity", Google: "Google's AI features", Microsoft: "Copilot" };

interface AgentBlock {
  agent: Agent;
  pages: PageData[];
  evidence: Evidence;
}

/** For each AI/search agent, which key pages robots.txt blocks. */
export function agentBlocks(crawl: CrawlData): { blocks: AgentBlock[]; checkedPaths: string[] } {
  const pages = keyPages(crawl);
  const paths = pages.length ? pages : [];
  const checkedPaths = paths.length ? paths.map((p) => pathOf(p.finalUrl)) : ["/"];
  const blocks: AgentBlock[] = [];
  for (const agent of config.aiAgents) {
    const blockedPages: PageData[] = [];
    let first: Evidence | null = null;
    const targets = paths.length ? paths.map((p) => ({ page: p, path: pathOf(p.finalUrl) })) : [{ page: null, path: "/" }];
    for (const t of targets) {
      const d = isAllowed(crawl.robots.parsed, agent.token, t.path);
      if (!d.allowed) {
        if (t.page) blockedPages.push(t.page);
        first ??= ev.header("robots.txt rule", describeDecision(agent.token, t.path, d), crawl.robots.url);
      }
    }
    if (first) blocks.push({ agent, pages: blockedPages, evidence: first });
  }
  return { blocks, checkedPaths };
}

const BLOCKING_DIRECTIVE = /\b(noindex|none)\b/;
const AI_DIRECTIVE = /\b(noai|noimageai)\b/;

function directiveFindings(crawl: CrawlData): { blocking: Evidence[]; ai: Evidence[] } {
  const blocking: Evidence[] = [];
  const ai: Evidence[] = [];
  for (const p of keyPages(crawl)) {
    for (const [name, content] of Object.entries(p.metaRobots)) {
      const e = ev.header(`<meta name="${name}">`, `${content} (${relPath(p.finalUrl)})`, p.finalUrl);
      if (BLOCKING_DIRECTIVE.test(content)) blocking.push(e);
      else if (AI_DIRECTIVE.test(content)) ai.push(e);
    }
    if (p.xRobotsTag) {
      const e = ev.header("X-Robots-Tag header", `${p.xRobotsTag} (${relPath(p.finalUrl)})`, p.finalUrl);
      if (BLOCKING_DIRECTIVE.test(p.xRobotsTag.toLowerCase())) blocking.push(e);
      else if (AI_DIRECTIVE.test(p.xRobotsTag.toLowerCase())) ai.push(e);
    }
  }
  return { blocking, ai };
}

const c11: CheckImpl = (ctx) => {
  const crawl = ctx.data.crawl;
  if (!crawl) return needCrawl(ctx) as RawCheckResult;
  const unreachable = robotsUnreachable(crawl);
  if (unreachable) return unreachable;
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  // Help subdomains (support.example.com) have their own robots.txt, so only main-site pages here.
  const pages = keyPages(crawl).filter((p) => crawl.hosts.includes(hostKey(new URL(p.finalUrl).hostname)));
  const targets = pages.length ? pages.map((p) => p.finalUrl) : [`${crawl.origin}/`];
  const blocked: string[] = [];
  for (const url of targets) {
    const d = isAllowed(crawl.robots.parsed, "Googlebot", pathOf(url));
    if (!d.allowed) {
      blocked.push(url);
      evidence.push(ev.header("robots.txt rule", describeDecision("Googlebot", pathOf(url), d), crawl.robots.url));
    }
  }
  if (blocked.length) problems.push(`robots.txt blocks Googlebot from ${listSome(blocked.map(relPath))}`);
  if (!blocked.length) evidence.push(ev.measure("robots.txt", `Googlebot allowed on ${targets.length} key page(s): ${listSome(targets.map(relPath))}`, crawl.robots.url));

  const home = crawl.pages.length ? homePage(crawl) : undefined;
  if (!home) {
    if (blocked.length) return { status: "fail", evidence, issue: `Google can't crawl your key pages: ${problems.join("; ")}.`, requiredChange: "Remove the Disallow rules that apply to Googlebot (or to all crawlers) for these pages in robots.txt.", pages: blocked };
    return unable("Not checked: the homepage could not be fetched, so status codes and noindex tags couldn't be read.", "", { evidence });
  }
  evidence.push(ev.measure("Homepage HTTP status", `${home.status}${home.finalUrl !== home.url ? ` (after redirect to ${home.finalUrl})` : ""}`, home.finalUrl));
  if (home.status !== 200) problems.push(`the homepage returns HTTP ${home.status}`);
  const brokenKey = pages.filter((p) => p.status >= 400);
  for (const p of crawl.pages.filter((p) => p.status >= 400 && p.role !== "other")) {
    evidence.push(ev.measure("Key page HTTP status", `${p.status} at ${relPath(p.finalUrl)}`, p.finalUrl));
    brokenKey.push(p);
  }
  if (brokenKey.length) problems.push(`${brokenKey.length} key page(s) return an error status`);

  const noindex: string[] = [];
  for (const p of pages) {
    const directives = [p.metaRobots.robots, p.metaRobots.googlebot, p.xRobotsTag?.toLowerCase()].filter(Boolean).join(", ");
    if (/\b(noindex|none)\b/.test(directives)) {
      noindex.push(p.finalUrl);
      evidence.push(ev.header("noindex directive", `${directives} on ${relPath(p.finalUrl)}`, p.finalUrl));
    }
  }
  if (noindex.length) problems.push(`${noindex.length} key page(s) are marked noindex`);

  const notes: string[] = [];
  const probe = crawl.botProbes.find((b) => b.agent === "Googlebot");
  if (probe) {
    evidence.push(ev.measure("Googlebot user-agent probe (homepage)", `HTTP ${probe.status || probe.error} vs ${probe.baselineStatus} for our normal crawler`, home.finalUrl));
    if (probe.blocked) notes.push(`Indicative only: the server answered HTTP ${probe.status} to a request using Googlebot's user agent. Firewalls that verify Google by IP address may let the real Googlebot through, so confirm in Google Search Console.`);
  }

  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Google can't fully reach your key pages: ${problems.join("; ")}.`,
      requiredChange: "Make sure key pages return HTTP 200, remove noindex from pages you want found, and remove robots.txt rules that block Googlebot from them.",
      pages: [...new Set([...blocked, ...noindex, ...brokenKey.map((p) => p.finalUrl)])],
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const KEY_FACT_ROLES: { role: PageData["role"][]; label: string }[] = [
  { role: ["about", "team"], label: "About / team" },
  { role: ["services", "product", "collection"], label: "Services or products" },
  { role: ["contact"], label: "Contact" },
];

const c14: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  const pages: string[] = [];
  for (const k of KEY_FACT_ROLES) {
    const found = c.pages.filter((p) => k.role.includes(p.role) && p.status < 400).sort((a, b) => a.depth - b.depth)[0];
    if (!found) {
      problems.push(`no ${k.label} page found among ${c.pages.length} crawled pages`);
      evidence.push(ev.measure(k.label, `not found among ${c.pages.length} crawled pages`));
    } else {
      evidence.push(ev.measure(`${k.label} page`, `${found.depth > 9 ? "not linked from the homepage" : `${found.depth} click(s) from the homepage`}: ${relPath(found.finalUrl)}`, found.finalUrl));
      if (found.depth > 2) {
        problems.push(`the ${k.label} page is more than 2 clicks from the homepage`);
        pages.push(found.finalUrl);
      }
    }
  }
  const keyDocs = c.documents.filter((d) => /price|pricing|tariff|rates|brochure|menu|services|fees|catalogue/i.test(`${d.text} ${d.url}`));
  for (const d of keyDocs.slice(0, 5)) evidence.push(ev.url(`Key information in a document ("${d.text || "link"}")`, d.url));
  if (keyDocs.length) problems.push(`${keyDocs.length} key document(s) such as price lists or brochures are only available as PDFs or files`);

  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Key facts are hard to reach: ${problems.join("; ")}.`,
      requiredChange: "Link your About, Services and Contact pages from the homepage menu, and put prices or service details from PDFs into normal web pages.",
      pages: [...pages, ...keyDocs.map((d) => d.from)],
    };
  }
  return { status: "pass", evidence };
};

/** Key pages whose raw HTML is an empty JavaScript app shell. */
function shellPages(c: CrawlData): PageData[] {
  return keyPages(c).filter((p) => p.spaShell || (p.mainWordCount < 30 && p.scripts.length > 0));
}

function shellEvidence(p: PageData): Evidence {
  return ev.measure(`Raw HTML text on ${relPath(p.finalUrl)}`, `${p.mainWordCount} words of main content before JavaScript${p.spaShell ? "; empty JavaScript app container found" : ""}`, p.finalUrl);
}

/** robots.txt couldn't be fetched at all (network error), so nothing about it can be verified. */
function robotsUnreachable(c: CrawlData): RawCheckResult | null {
  if (c.robots.status !== 0) return null;
  return unable(`Not checked: robots.txt could not be fetched (${c.robots.error ?? "no response"}).`, "Check the site is online and re-run the audit.");
}

const c15: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  if (c.renders) {
    const evidence: Evidence[] = c.renders.map((r) =>
      ev.measure(
        `Raw vs rendered text: ${relPath(r.url)}`,
        r.error ? `render failed: ${r.error}` : `${r.rawWords} words in raw HTML, ${r.renderedWords} after JavaScript; ${Math.round(r.jsOnlyShare * 100)}% of rendered content words only appear after JavaScript`,
        r.url,
      ),
    );
    const bad = c.renders.filter((r) => !r.error && r.renderedWords >= 30 && r.jsOnlyShare > 0.5);
    for (const b of bad) if (b.sample) evidence.push(ev.snippet(`Words only visible after JavaScript on ${relPath(b.url)}`, b.sample, b.url));
    const rendered = new Set(c.renders.map((r) => r.url));
    const unrenderedShells = shellPages(c).filter((p) => !rendered.has(p.finalUrl));
    for (const p of unrenderedShells) evidence.push(shellEvidence(p));
    const ok = c.renders.filter((r) => !r.error);
    if (!ok.length && !unrenderedShells.length) return unable("Not checked: pages could not be rendered for comparison.", "", { evidence });
    const failing = [...bad.map((b) => b.url), ...unrenderedShells.map((p) => p.finalUrl)];
    if (failing.length) {
      return {
        status: "fail",
        evidence,
        issue: `More than half the main content on ${listSome(failing.map(relPath))} only appears after JavaScript runs, so most AI crawlers can't see it.`,
        requiredChange: "Render the main content on the server (server-side rendering or static generation) so it's in the HTML the page first sends.",
        pages: failing,
      };
    }
    return { status: "pass", evidence };
  }
  // No renderer: we can still prove a failure when the raw HTML is an empty app shell.
  const home = homePage(c)!;
  const shells = shellPages(c);
  if (shells.length) {
    return {
      status: "fail",
      evidence: shells.map(shellEvidence),
      issue: "Your pages send almost no text until JavaScript runs, so most AI crawlers see an empty page.",
      requiredChange: "Render the main content on the server (server-side rendering or static generation) so it's in the HTML the page first sends.",
      pages: shells.map((p) => p.finalUrl),
    };
  }
  return unable(`Not checked: ${c.renderError ?? "rendering is unavailable"}, so raw and rendered text couldn't be compared.`, "Set ENABLE_PLAYWRIGHT=true to compare raw and rendered HTML.", {
    evidence: [ev.measure("Raw HTML text on homepage", `${home.mainWordCount} words of main content before JavaScript`, home.finalUrl)],
  });
};

const c16: CheckImpl = (ctx) => {
  const c = ctx.data.crawl;
  if (!c) return needCrawl(ctx) as RawCheckResult;
  const unreachable = robotsUnreachable(c);
  if (unreachable) return unreachable;
  const evidence: Evidence[] = [ev.measure("robots.txt", `HTTP ${c.robots.status || c.robots.error}`, c.robots.url)];
  if (c.robots.parsed.mode === "disallow-all") {
    return {
      status: "fail",
      evidence,
      issue: `robots.txt returned ${c.robots.status ? `HTTP ${c.robots.status}` : "no response"}; crawlers treat that as "don't crawl anything".`,
      requiredChange: "Make sure /robots.txt returns HTTP 200 (or 404 if you don't want one); a server error tells every crawler to stay away.",
    };
  }
  const { blocks, checkedPaths } = agentBlocks(c);
  const hard = blocks.filter((b) => b.agent.kind !== "training");
  const training = blocks.filter((b) => b.agent.kind === "training");
  const { blocking, ai } = directiveFindings(c);
  const probes = c.botProbes.filter((p) => p.blocked);
  evidence.push(...blocks.map((b) => b.evidence), ...blocking, ...ai);
  for (const p of c.botProbes) evidence.push(ev.measure(`${p.agent} user-agent probe (homepage)`, `HTTP ${p.status || p.error} (our normal crawler got ${p.baselineStatus})`));
  if (!blocks.length) evidence.push(ev.measure("robots.txt", `All ${config.aiAgents.length} AI and search crawlers allowed on ${checkedPaths.length} key path(s): ${listSome(checkedPaths)}`, c.robots.url));

  const pages = [...new Set(blocks.flatMap((b) => b.pages.map((p) => p.finalUrl)))];
  if (hard.length || blocking.length) {
    const parts = [];
    if (hard.length) parts.push(`robots.txt blocks ${listSome(hard.map((b) => b.agent.token))}`);
    if (blocking.length) parts.push(`${blocking.length} noindex/none directive(s) on key pages`);
    return {
      status: "fail",
      evidence,
      issue: `AI assistants and search engines are being turned away: ${parts.join("; ")}.`,
      requiredChange: "Remove the robots.txt Disallow rules for search and assistant crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot) and remove noindex from pages you want found.",
      pages,
    };
  }
  if (training.length || ai.length || probes.length) {
    const parts = [];
    if (training.length) parts.push(`robots.txt blocks training crawlers ${listSome(training.map((b) => b.agent.token))}`);
    if (ai.length) parts.push("noai/noimageai directives are set");
    if (probes.length) parts.push(`the server refused requests using ${listSome(probes.map((p) => p.agent))}'s user agent (indicative only)`);
    return {
      status: "partial",
      evidence,
      issue: `Some AI crawlers are restricted: ${parts.join("; ")}.`,
      requiredChange: probes.length
        ? "Check your firewall or CDN bot settings (e.g. Cloudflare's AI bot blocking) allow AI search crawlers, and review whether blocking training crawlers is a deliberate choice."
        : "Review whether blocking AI training crawlers is a deliberate choice; it can reduce how well AI models know your business.",
      pages,
      notes: probes.length ? ["User-agent probe results are indicative only: firewalls that verify bots by IP address may treat real crawlers differently."] : [],
    };
  }
  return { status: "pass", evidence };
};

const c17: CheckImpl = (ctx) => {
  const c = ctx.data.crawl;
  if (!c) return needCrawl(ctx) as RawCheckResult;
  const unreachable = robotsUnreachable(c);
  if (unreachable) return unreachable;
  const llms = c.llmsTxt.status === 200 ? `/llms.txt found (${fmtBytes(c.llmsTxt.bytes)}). This is informational only and not scored.` : "No /llms.txt file found. This is informational only and not scored; few AI crawlers use it yet.";
  const notes = [llms];
  if (c.robots.parsed.mode === "disallow-all") {
    return {
      status: "fail",
      evidence: [ev.measure("robots.txt", `HTTP ${c.robots.status || c.robots.error}: treated as disallow-all`, c.robots.url)],
      issue: "robots.txt is unavailable with a server error, which blocks every crawler including AI search crawlers.",
      requiredChange: "Fix /robots.txt so it returns HTTP 200 (or 404).",
      notes,
    };
  }
  const { blocks } = agentBlocks(c);
  const search = blocks.filter((b) => b.agent.kind === "search");
  const training = blocks.filter((b) => b.agent.kind === "training");
  const evidence = blocks.map((b) => b.evidence);
  const searchAgents = config.aiAgents.filter((a) => a.kind === "search").map((a) => a.token);
  if (!blocks.length) evidence.push(ev.measure("robots.txt", `No blocks on AI search or training crawlers (${listSome(config.aiAgents.map((a) => a.token), 4)})`, c.robots.url));
  else if (!search.length) evidence.push(ev.measure("AI search crawlers", `Allowed: ${listSome(searchAgents, 6)}`, c.robots.url));

  if (search.length) {
    return {
      status: "fail",
      evidence,
      issue: `robots.txt blocks AI search crawlers (${listSome(search.map((b) => b.agent.token))}), so ${listSome([...new Set(search.map((b) => ASSISTANT[b.agent.owner] ?? b.agent.owner))])} can't read or cite your pages when answering questions.`,
      requiredChange: `Remove the Disallow rules for ${search.map((b) => b.agent.token).join(", ")} in robots.txt. These crawlers fetch pages to answer live questions, not to train models.`,
      pages: [...new Set(search.flatMap((b) => b.pages.map((p) => p.finalUrl)))],
      notes,
    };
  }
  if (training.length) {
    return {
      status: "partial",
      evidence,
      issue: `robots.txt blocks AI training crawlers (${listSome(training.map((b) => b.agent.token))}). Search crawlers are allowed, so you can still be cited, but future models will learn less about you.`,
      requiredChange: "Keep these blocks only if you've deliberately chosen to opt out of AI training. Allowing them helps AI models know your business without a live search; blocking them protects your content from reuse.",
      notes: [...notes, "Trade-off: training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended…) feed future model knowledge; search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot…) power live answers and citations."],
    };
  }
  return { status: "pass", evidence, notes };
};

export const cat1: Record<string, CheckImpl> = { "1.1": c11, "1.2": llmCheck("1.2"), "1.3": llmCheck("1.3"), "1.4": withAiPart("1.4", c14), "1.5": c15, "1.6": c16, "1.7": c17 };
