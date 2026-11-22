import { config } from "@/config";
import { typesOf } from "@/lib/crawler/extract";
import { imageFormat } from "@/lib/crawler/imageSize";
import type { AssetInfo, ImageRef, PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import { llmCheck, withAiPart } from "./llm";
import { ev, findFaq, fmtBytes, homePage, isResult, keyPages, listSome, needCrawl, okPages, relPath } from "./helpers";
import type { CheckImpl } from "./types";
import { unable } from "./types";

const T = config.thresholds;

const c22: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const faq = findFaq(c);
  if (faq) return { status: "pass", evidence: [faq.how] };
  return {
    status: "fail",
    evidence: [ev.measure("FAQ search", `No FAQ page, FAQ heading or FAQPage schema found across ${c.pages.length} crawled pages`)],
    issue: "There's no FAQ page, so AI assistants have no ready-made questions and answers to quote.",
    requiredChange: "Create an FAQ page answering the questions customers ask most, each as a heading with a short direct answer underneath, and mark it up with FAQPage schema.",
  };
};

const c25: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const limit = T.googlebotFetchLimitBytes;
  const pages = okPages(c);
  const measured = c.assets.filter((a) => a.status === 200);
  const overPages = pages.filter((p) => p.htmlBytes > limit);
  const overAssets = measured.filter((a) => a.overLimit);
  const largestHtml = [...pages].sort((a, b) => b.htmlBytes - a.htmlBytes)[0];
  const largestAsset = [...measured].sort((a, b) => b.bytes - a.bytes)[0];
  const evidence: Evidence[] = [ev.measure("Files measured", `${pages.length} HTML pages and ${measured.length} images, scripts and stylesheets (uncompressed sizes)`)];
  if (largestHtml) evidence.push(ev.measure("Largest HTML page", `${fmtBytes(largestHtml.htmlBytes)} at ${relPath(largestHtml.finalUrl)}`, largestHtml.finalUrl));
  if (largestAsset) evidence.push(ev.measure(`Largest ${largestAsset.kind}`, `${largestAsset.overLimit && largestAsset.bytes >= limit ? "over " : ""}${fmtBytes(largestAsset.bytes)}`, largestAsset.url));
  for (const a of overAssets.slice(0, 5)) if (a !== largestAsset) evidence.push(ev.measure(`Over 2 MB (${a.kind})`, `over ${fmtBytes(limit)}`, a.url));
  if (overPages.length || overAssets.length) {
    return {
      status: "fail",
      evidence,
      issue: `${overPages.length + overAssets.length} file(s) are over 2 MB, and Google stops reading after the first 2 MB.`,
      requiredChange: "Split or slim down the oversized files: compress images, remove unused code from scripts, and break very long pages into separate pages.",
      pages: [...overPages.map((p) => p.finalUrl), ...overAssets.flatMap((a) => a.pages)],
    };
  }
  return { status: "pass", evidence };
};

function htmlSizeResult(pages: PageData[], label: string) {
  const largest = [...pages].sort((a, b) => b.htmlBytes - a.htmlBytes)[0];
  const evidence: Evidence[] = [ev.measure(`Largest ${label} HTML`, `${fmtBytes(largest.htmlBytes)} at ${relPath(largest.finalUrl)}`, largest.finalUrl)];
  if (pages.length > 1) {
    const avg = pages.reduce((s, p) => s + p.htmlBytes, 0) / pages.length;
    evidence.push(ev.measure("Average HTML size", `${fmtBytes(Math.round(avg))} across ${pages.length} pages`));
  }
  const heavy = pages.filter((p) => p.htmlBytes > T.htmlPassBytes);
  if (largest.htmlBytes > T.googlebotFetchLimitBytes) {
    return { status: "fail" as const, evidence, issue: `${relPath(largest.finalUrl)} is ${fmtBytes(largest.htmlBytes)} of HTML, over Google's 2 MB limit.`, requiredChange: "Cut the page's HTML well below 500 KB: remove inline images/data, large inline scripts and styles, and repeated markup.", pages: heavy.map((p) => p.finalUrl) };
  }
  if (largest.htmlBytes > T.htmlPassBytes) {
    return { status: "partial" as const, evidence, issue: `${heavy.length} page(s) have more than 500 KB of HTML (largest ${fmtBytes(largest.htmlBytes)}).`, requiredChange: "Aim for under 500 KB of HTML per page: move inline scripts, styles and embedded data into separate files and remove unused markup.", pages: heavy.map((p) => p.finalUrl) };
  }
  return { status: "pass" as const, evidence };
}

const c26: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  return htmlSizeResult(okPages(c), "page");
};

const c27: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const faq = findFaq(c);
  if (!faq) return unable("Not checked: no FAQ page was found.", "Create an FAQ page first (see check 2.2).");
  return htmlSizeResult([faq.page], "FAQ page");
};

const isModern = (fmt: string) => ["webp", "avif", "svg"].includes(fmt);

function refsFor(pages: PageData[], url: string): ImageRef[] {
  return pages.flatMap((p) => p.images.filter((i) => i.src === url));
}

const c29: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const images = c.assets.filter((a) => a.kind === "image" && a.status === 200);
  if (!images.length) return unable(`Not checked: no images were found to measure on the ${Math.min(c.pages.length, config.crawler.assetPages)} main pages.`);
  const flagged: { a: AssetInfo; why: string[] }[] = [];
  for (const a of images) {
    const fmt = imageFormat(a.url, a.contentType);
    const refs = refsFor(c.pages, a.url);
    const why: string[] = [];
    if (a.bytes > T.imageMaxBytes) why.push(`${fmtBytes(a.bytes)} (over 200 KB)`);
    if (!isModern(fmt) && a.bytes > 20 * 1024 && !refs.some((r) => r.modernSource)) why.push(`${fmt.toUpperCase()} rather than WebP/AVIF`);
    const displayed = refs.map((r) => r.widthAttr).filter((w): w is number => !!w);
    if (a.width && displayed.length) {
      const shown = Math.max(...displayed);
      if (a.width > shown * 2 && a.width - shown > 300) why.push(`${a.width}px wide but displayed at ${shown}px`);
    }
    if (why.length) flagged.push({ a, why });
  }
  const total = images.reduce((s, a) => s + a.bytes, 0);
  const evidence: Evidence[] = [ev.measure("Images measured", `${images.length} images, ${fmtBytes(total)} in total`)];
  for (const f of flagged.slice(0, 8)) evidence.push(ev.measure(`Image: ${f.why.join("; ")}`, relPath(f.a.url), f.a.url));
  if (flagged.length) {
    return {
      status: "fail",
      evidence,
      issue: `${flagged.length} of ${images.length} images are heavier than they need to be.`,
      requiredChange: "Convert photos to WebP or AVIF, resize them to the largest size they're actually shown at, and keep each under 200 KB.",
      pages: [...new Set(flagged.flatMap((f) => f.a.pages))],
    };
  }
  return { status: "pass", evidence };
};

const c210: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const home = homePage(c)!;
  const scripts = c.assets.filter((a) => a.kind === "script" && a.pages.includes(home.finalUrl) && a.status === 200);
  const inline = home.scripts.reduce((s, x) => s + x.inlineBytes, 0);
  const external = scripts.reduce((s, a) => s + a.bytes, 0);
  const total = inline + external;
  const thirdPartyHosts = new Set(
    okPages(c)
      .flatMap((p) => p.scripts.map((s) => s.src))
      .filter((s): s is string => !!s)
      .map((s) => new URL(s).hostname)
      .filter((h) => !c.hosts.includes(h.replace(/^www\./, ""))),
  );
  const unmeasured = home.scripts.filter((s) => s.src).length - scripts.length;
  const evidence: Evidence[] = [
    ev.measure("JavaScript on homepage", `${fmtBytes(total)} uncompressed (${home.scripts.length} scripts: ${fmtBytes(external)} external, ${fmtBytes(inline)} inline)${unmeasured > 0 ? `; ${unmeasured} script(s) not measured` : ""}`, home.finalUrl),
    ev.measure("Third-party script hosts", thirdPartyHosts.size ? `${thirdPartyHosts.size}: ${listSome([...thirdPartyHosts], 6)}` : "none"),
  ];
  const notes = ["PageSpeed's \"unused JavaScript\" figure is added when PAGESPEED_API_KEY is configured (build phase 5)."];
  const problems: string[] = [];
  if (total > 500 * 1024) problems.push(`${fmtBytes(total)} of JavaScript on the homepage (aim for under 500 KB)`);
  if (thirdPartyHosts.size > 10) problems.push(`scripts from ${thirdPartyHosts.size} third-party services`);
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Your pages load a lot of JavaScript: ${problems.join("; ")}.`,
      requiredChange: "Remove tracking tags, widgets and libraries you no longer use, and load the rest only on pages that need them.",
      pages: [home.finalUrl],
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const ABOVE_FOLD_IMAGES = 2;

const c211: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const candidates: { page: PageData; src: string; lazy: boolean; kind: string }[] = [];
  for (const p of okPages(c)) {
    for (const i of p.images) if (i.index >= ABOVE_FOLD_IMAGES) candidates.push({ page: p, src: i.src, lazy: i.loading === "lazy" || i.jsLazy, kind: "image" });
    for (const e of p.embeds) if (e.kind === "iframe") candidates.push({ page: p, src: e.src, lazy: e.loading === "lazy", kind: "iframe" });
  }
  if (!candidates.length) return unable("Not checked: no images or embeds below the top of the page were found.");
  const lazy = candidates.filter((x) => x.lazy).length;
  const notLazy = candidates.filter((x) => !x.lazy);
  const evidence: Evidence[] = [ev.measure("Below-the-fold images and embeds", `${lazy} of ${candidates.length} lazy-loaded (images after the first ${ABOVE_FOLD_IMAGES} on each page, plus iframes)`)];
  for (const n of notLazy.slice(0, 5)) evidence.push(ev.measure(`Not lazy-loaded (${n.kind} on ${relPath(n.page.finalUrl)})`, relPath(n.src), n.src));
  if (lazy / candidates.length < 0.8) {
    return {
      status: "fail",
      evidence,
      issue: `${notLazy.length} images or embeds further down your pages load straight away, slowing down the content that matters.`,
      requiredChange: 'Add loading="lazy" to images and iframes below the top of the page (but not to the main image at the top).',
      pages: [...new Set(notLazy.map((n) => n.page.finalUrl))],
    };
  }
  return { status: "pass", evidence };
};

const c212: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = keyPages(c);
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  const affected = new Set<string>();
  let blockingTotal = 0;
  let blockingPages = 0;
  for (const p of pages) {
    const blocking = p.scripts.filter((s) => s.src && s.inHead && !s.async && !s.defer && !s.module);
    blockingTotal += blocking.length;
    if (blocking.length > 1) {
      blockingPages++;
      affected.add(p.finalUrl);
      evidence.push(ev.measure(`Render-blocking scripts in <head> on ${relPath(p.finalUrl)}`, `${blocking.length}: ${listSome(blocking.map((s) => relPath(s.src!)), 3)}`, p.finalUrl));
    }
    const first = p.images.find((i) => i.index === 0);
    if (first && first.loading === "lazy" && p.role === "home") {
      affected.add(p.finalUrl);
      problems.push("the main image at the top of the homepage is lazy-loaded, which delays it");
      evidence.push(ev.measure("First image is lazy-loaded", relPath(first.src), p.finalUrl));
    }
  }
  if (blockingPages) problems.unshift(`scripts that block the page from showing until they load (${blockingTotal} across key pages)`);
  const withPriority = pages.flatMap((p) => p.images.filter((i) => i.fetchpriority === "high"));
  evidence.push(ev.measure("Key pages checked", `${pages.length}; ${blockingTotal} render-blocking script(s); ${withPriority.length} image(s) with fetchpriority="high"`));
  const notes = ["PageSpeed's render-blocking resources audit is added when PAGESPEED_API_KEY is configured (build phase 5)."];
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Page loading isn't prioritised: ${problems.join("; ")}.`,
      requiredChange: 'Add defer to scripts in the <head>, keep the top image eager (optionally with fetchpriority="high"), and lazy-load everything further down.',
      pages: [...affected],
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const WEAK_ALT = /^(image|img|photo|picture|pic|banner|graphic|icon|logo|untitled|hero|slide)?[\s_-]*\d*$/i;
const FILE_ALT = /\.(jpe?g|png|gif|webp|avif|svg)$|^(img|dsc|image|photo|screenshot)[\s_-]?\d+/i;

const c213: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const imgs = okPages(c).flatMap((p) => p.images.map((i) => ({ i, p })));
  const content = imgs.filter(({ i }) => i.alt !== ""); // alt="" marks decorative images, which is correct
  if (!content.length) return unable("Not checked: no content images were found on the crawled pages.");
  const missing = content.filter(({ i }) => i.alt === null);
  const weak = content.filter(({ i }) => i.alt !== null && (i.alt.trim().length < 3 || WEAK_ALT.test(i.alt.trim()) || FILE_ALT.test(i.alt.trim())));
  const bad = [...missing, ...weak];
  const evidence: Evidence[] = [ev.measure("Alt text", `${content.length} content images: ${missing.length} with no alt text, ${weak.length} with unhelpful alt text`)];
  for (const { i, p } of missing.slice(0, 4)) evidence.push(ev.measure(`No alt text on ${relPath(p.finalUrl)}`, relPath(i.src), i.src));
  for (const { i, p } of weak.slice(0, 4)) evidence.push(ev.snippet(`Unhelpful alt text on ${relPath(p.finalUrl)}`, i.alt ?? "", p.finalUrl));
  if (bad.length && bad.length / content.length > 0.2) {
    return {
      status: "fail",
      evidence,
      issue: `${bad.length} of ${content.length} images have missing or unhelpful descriptions, so AI can't tell what they show.`,
      requiredChange: 'Give every meaningful image a short, specific alt text (e.g. "Electrician fitting an EV charger in a Leeds driveway"), and use alt="" only for purely decorative images.',
      pages: [...new Set(bad.map(({ p }) => p.finalUrl))],
    };
  }
  return { status: "pass", evidence };
};

const c214: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const withVideo = okPages(c).filter((p) => p.embeds.some((e) => e.provider));
  if (!withVideo.length) return unable("Not checked: no videos were found on the crawled pages.");
  const evidence: Evidence[] = [];
  const missing: PageData[] = [];
  for (const p of withVideo) {
    const vids = p.embeds.filter((e) => e.provider);
    const schemaTranscript = p.jsonLd.some((b) => b.nodes.some((n) => typesOf(n).includes("VideoObject") && typeof n.transcript === "string" && (n.transcript as string).length > 50));
    const onPage = p.sections.some((s) => /transcript/i.test(s.heading) && s.text.length > 100) || /\btranscript\b/i.test(p.mainText);
    evidence.push(ev.measure(`Video on ${relPath(p.finalUrl)}`, `${vids.length} (${listSome([...new Set(vids.map((v) => v.provider!))])}); transcript: ${schemaTranscript ? "in VideoObject schema" : onPage ? "on page" : "none found"}`, p.finalUrl));
    if (!schemaTranscript && !onPage) missing.push(p);
  }
  if (missing.length) {
    return {
      status: "fail",
      evidence,
      issue: `${missing.length} page(s) have videos without a transcript, so what's said in them is invisible to AI.`,
      requiredChange: "Add a full text transcript below each video (and in VideoObject schema's transcript property).",
      pages: missing.map((p) => p.finalUrl),
    };
  }
  return { status: "pass", evidence };
};

export const cat2: Record<string, CheckImpl> = {
  "2.2": c22,
  "2.3": llmCheck("2.3"),
  "2.4": llmCheck("2.4"),
  "2.5": c25,
  "2.6": c26,
  "2.7": c27,
  "2.9": c29,
  "2.10": c210,
  "2.11": c211,
  "2.12": c212,
  "2.13": withAiPart("2.13", c213),
  "2.14": c214,
};
