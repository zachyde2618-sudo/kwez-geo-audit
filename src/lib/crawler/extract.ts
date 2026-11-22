import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type {
  DateSignal,
  EmbedRef,
  Heading,
  ImageRef,
  JsonLdBlock,
  LinkRef,
  PageData,
  PageRole,
  ScriptRef,
  Section,
  StylesheetRef,
} from "./types";

type $T = cheerio.CheerioAPI;

const BLOCK_SEL = "p,div,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd,section,article,header,footer,nav,aside,main,blockquote,figcaption,summary,details,tr,label,button,option";
const TEXT_BLOCKS = "p,li,dd,td,blockquote,figcaption";
const HEADING_SEL = "h1,h2,h3,h4,h5,h6,summary,dt";
const VIDEO_PROVIDERS: [RegExp, string][] = [
  [/youtube(-nocookie)?\.com|youtu\.be/i, "YouTube"],
  [/vimeo\.com/i, "Vimeo"],
  [/wistia\.(com|net)|wi\.st/i, "Wistia"],
  [/loom\.com/i, "Loom"],
  [/vidyard\.com/i, "Vidyard"],
];

export const normaliseSpace = (s: string) => s.replace(/\s+/g, " ").trim();
export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

export function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function classifyRole(url: string, title = "", h1 = ""): PageRole {
  const u = new URL(url);
  const path = u.pathname.toLowerCase().replace(/\/index\.(html?|php|aspx?)$/, "/").replace(/\.(html?|php|aspx?)$/, "").replace(/\/+$/, "");
  if (path === "" || path === "/home") return "home";
  const segs = path.split("/").filter(Boolean);
  const p = path;
  const t = `${title} ${h1}`.toLowerCase();
  if (/faq|frequently-asked|\/questions|help-centre|help-center/.test(p) || /frequently asked|\bfaqs?\b/.test(t)) return "faq";
  if (/\/(blog|news|insights|articles|journal|updates)(\/|$)/.test(p)) {
    const i = segs.findIndex((s) => /^(blog|news|insights|articles|journal|updates)$/.test(s));
    const rest = segs.slice(i + 1).filter((s) => !/^(page|category|tag|\d+)$/.test(s));
    return rest.length ? "post" : "blog";
  }
  if (/\/(team|people|our-team|founders?|leadership|staff|meet-the-team)(\/|$)/.test(p)) return "team";
  if (/\/(about|about-us|our-story|who-we-are|company)(\/|$)/.test(p)) return "about";
  if (/\/(case-stud|portfolio|our-work|work|projects|clients|success-stories)/.test(p)) return "case-study";
  if (/\/(reviews?|testimonials?)(\/|$)/.test(p)) return "reviews";
  if (/\/(research|reports?|surveys?|stud(y|ies)|whitepapers?|data|benchmarks?)(\/|$)/.test(p)) return "research";
  if (/\/(services?|products?|what-we-do|solutions|pricing|prices|shop)(\/|$)/.test(p)) return "services";
  if (/\/(contact|contact-us|get-in-touch|find-us|locations?)(\/|$)/.test(p)) return "contact";
  return "other";
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v) => flattenJsonLd(v, out, depth + 1));
    return;
  }
  const obj = value as Record<string, unknown>;
  if (obj["@type"]) out.push(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (k === "@context") continue;
    flattenJsonLd(v, out, depth + 1);
  }
}

export function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  const arr = Array.isArray(t) ? t : [t];
  return arr.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^https?:\/\/schema\.org\//, "").replace(/^schema:/, ""));
}

function parseJsonLd($: $T): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    try {
      const parsed = JSON.parse(raw);
      const nodes: Record<string, unknown>[] = [];
      flattenJsonLd(parsed, nodes);
      blocks.push({ raw: raw.slice(0, 20_000), error: null, nodes });
    } catch (e) {
      blocks.push({ raw: raw.slice(0, 2_000), error: (e as Error).message, nodes: [] });
    }
  });
  return blocks;
}

function toIso(value: string): string | null {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  if (t > Date.now() + 86_400_000) return null; // future dates are not evidence of freshness
  if (t < Date.UTC(1995, 0, 1)) return null;
  return new Date(t).toISOString();
}

function collectDates($: $T, jsonLd: JsonLdBlock[], headers: Record<string, string>): DateSignal[] {
  const out: DateSignal[] = [];
  const add = (source: string, value: unknown) => {
    if (typeof value !== "string") return;
    const iso = toIso(value);
    if (iso) out.push({ source, value: value.slice(0, 60), date: iso });
  };
  for (const b of jsonLd) for (const n of b.nodes) {
    add(`JSON-LD ${typesOf(n)[0]}.dateModified`, n.dateModified);
    add(`JSON-LD ${typesOf(n)[0]}.datePublished`, n.datePublished);
  }
  for (const prop of ["article:modified_time", "article:published_time", "og:updated_time"]) {
    add(`<meta property="${prop}">`, $(`meta[property="${prop}"]`).attr("content"));
  }
  for (const name of ["last-modified", "date", "dcterms.modified"]) add(`<meta name="${name}">`, $(`meta[name="${name}"]`).attr("content"));
  $("time[datetime]").slice(0, 10).each((_, el) => add("<time datetime>", $(el).attr("datetime")));
  add("Last-Modified header", headers["last-modified"]);
  return out;
}

export function extractPage(opts: {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  htmlBytes: number;
  ttfbMs: number;
  depth: number;
  siteHosts: string[];
}): PageData {
  const { finalUrl, html, headers } = opts;
  const $ = cheerio.load(html);
  const base = new URL($("base[href]").attr("href") ?? finalUrl, finalUrl);
  const abs = (href: string | undefined): string | null => {
    if (!href) return null;
    try {
      const u = new URL(href.trim(), base);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      u.hash = "";
      return u.toString();
    } catch {
      return null;
    }
  };
  const hosts = new Set(opts.siteHosts.map(hostKey));
  const isInternal = (u: string) => hosts.has(hostKey(new URL(u).hostname));

  // ── Things that must be read before scripts/styles are stripped ──
  const jsonLd = parseJsonLd($);
  const scripts: ScriptRef[] = [];
  $("script").each((_, el) => {
    const $el = $(el);
    const type = $el.attr("type") ?? null;
    if (type && !/javascript|module|ecmascript/i.test(type)) return; // JSON-LD, templates, etc.
    const src = abs($el.attr("src"));
    scripts.push({
      src,
      async: $el.is("[async]"),
      defer: $el.is("[defer]"),
      module: type === "module",
      inHead: $el.closest("head").length > 0,
      inlineBytes: src ? 0 : Buffer.byteLength($el.text()),
      type,
    });
  });
  const stylesheets: StylesheetRef[] = [];
  $('link[rel~="stylesheet"]').each((_, el) => {
    const href = abs($(el).attr("href"));
    if (href) stylesheets.push({ href, inHead: $(el).closest("head").length > 0, media: $(el).attr("media") ?? null });
  });

  const metaRobots: Record<string, string> = {};
  $("meta[name]").each((_, el) => {
    const name = ($(el).attr("name") ?? "").toLowerCase();
    if (/^(robots|googlebot|bingbot|gptbot|oai-searchbot|chatgpt-user|claudebot|perplexitybot|google-extended|ccbot)$/.test(name)) {
      metaRobots[name] = ($(el).attr("content") ?? "").toLowerCase();
    }
  });

  const microdataTypes = new Set<string>();
  $("[itemscope][itemtype]").each((_, el) => {
    for (const t of ($(el).attr("itemtype") ?? "").split(/\s+/)) if (/schema\.org/i.test(t)) microdataTypes.add(t.split("/").pop()!);
  });
  const rdfaTypes = new Set<string>();
  if ($('[vocab*="schema.org"], [prefix*="schema.org"]').length) {
    $("[typeof]").each((_, el) => {
      for (const t of ($(el).attr("typeof") ?? "").split(/\s+/)) if (t) rdfaTypes.add(t.replace(/^schema:/, ""));
    });
  }

  const embeds: EmbedRef[] = [];
  $("iframe[src], iframe[data-src], video").each((i, el) => {
    const $el = $(el);
    const isVideo = el.tagName === "video";
    const src = abs($el.attr("src") ?? $el.attr("data-src") ?? $el.find("source[src]").attr("src")) ?? "";
    const provider = isVideo ? "HTML5 video" : VIDEO_PROVIDERS.find(([re]) => re.test(src))?.[1] ?? null;
    embeds.push({ kind: isVideo ? "video" : "iframe", src, provider, loading: $el.attr("loading") ?? null, index: i });
  });

  // ── Strip non-visible content, then add spaces at block boundaries ──
  $("script, style, noscript, template, svg, iframe, object").remove();
  $("br").replaceWith(" ");
  $(BLOCK_SEL).each((_, el) => {
    $(el).append(" ");
  });

  const title = normaliseSpace($("title").first().text());
  const headings: Heading[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const text = normaliseSpace($(el).text());
    if (text) headings.push({ level: Number(el.tagName[1]), text: text.slice(0, 300) });
  });

  // Sections: headings (and <summary>/<dt>) with the leaf text blocks that follow them.
  const sections: Section[] = [];
  let current: (Section & { _el: unknown }) | null = null;
  $(`${HEADING_SEL},${TEXT_BLOCKS}`).each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    if (HEADING_SEL.split(",").includes(tag)) {
      const text = normaliseSpace($el.text());
      if (!text) return;
      current = { level: /^h\d$/.test(tag) ? Number(tag[1]) : 4, heading: text.slice(0, 300), tag, firstText: "", text: "", adjacent: false, _el: el };
      sections.push(current);
      return;
    }
    if ($el.find(TEXT_BLOCKS).length) return; // only leaf blocks
    const text = normaliseSpace($el.text());
    if (!text || !current) return;
    const cur = current as Section & { _el: Parameters<$T>[0] };
    if (!cur.firstText) {
      cur.firstText = text.slice(0, 600);
      const $h = $(cur._el);
      cur.adjacent = $h.parent().find($el).length > 0 || $h.parent().parent().find($el).length > 0;
    }
    if (cur.text.length < 1500) cur.text = normaliseSpace(`${cur.text} ${text}`).slice(0, 1500);
  });
  const cleanSections = sections.map((s) => ({ level: s.level, heading: s.heading, tag: s.tag, firstText: s.firstText, text: s.text, adjacent: s.adjacent }));

  const images: ImageRef[] = [];
  $("img").each((i, el) => {
    const $el = $(el);
    const src = abs($el.attr("src") ?? $el.attr("data-src") ?? $el.attr("data-lazy-src"));
    if (!src) return;
    const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
    const $pic = $el.closest("picture");
    images.push({
      src,
      alt: $el.attr("alt") ?? null,
      loading: $el.attr("loading")?.toLowerCase() ?? null,
      fetchpriority: $el.attr("fetchpriority")?.toLowerCase() ?? null,
      widthAttr: num($el.attr("width")),
      heightAttr: num($el.attr("height")),
      index: i,
      modernSource: $pic.find('source[type="image/webp"], source[type="image/avif"]').length > 0,
      jsLazy: !!($el.attr("data-src") || $el.attr("data-lazy-src")) || /\blazy/.test($el.attr("class") ?? ""),
    });
  });

  const links: LinkRef[] = [];
  $("a[href]").each((_, el) => {
    const href = abs($(el).attr("href"));
    if (!href) return;
    links.push({
      href,
      text: normaliseSpace($(el).text()).slice(0, 120),
      internal: isInternal(href),
      inNavOrFooter: $(el).closest("nav, header, footer").length > 0,
    });
  });

  const footerText = normaliseSpace($("footer").text()).slice(0, 2000);
  const visibleText = normaliseSpace($("body").text() || $.root().text());
  let mainText: string;
  if ($("main").length) mainText = normaliseSpace($("main").text());
  else if ($("article").length === 1) mainText = normaliseSpace($("article").text());
  else {
    const $body = $("body").clone();
    $body.find("header, nav, footer, aside").remove();
    mainText = normaliseSpace($body.text());
  }

  const copyMatch = /(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/i.exec(footerText || visibleText);
  const copyrightYear = copyMatch ? Number(copyMatch[1]) : null;

  let spaShell = false;
  $("#root, #__next, #app, #___gatsby, [data-reactroot]").each((_, el) => {
    if (normaliseSpace($(el).text()).length < 20) spaShell = true;
  });
  if (wordCount(visibleText) > 80) spaShell = false;

  const h1 = headings.find((h) => h.level === 1)?.text ?? "";
  return {
    url: opts.url,
    finalUrl,
    status: opts.status,
    headers,
    htmlBytes: opts.htmlBytes,
    ttfbMs: opts.ttfbMs,
    depth: opts.depth,
    role: classifyRole(finalUrl, title, h1),
    title,
    metaRobots,
    xRobotsTag: headers["x-robots-tag"] ?? null,
    canonical: abs($('link[rel="canonical"]').attr("href")),
    lang: $("html").attr("lang") ?? null,
    metaDescription: $('meta[name="description"]').attr("content") ?? null,
    headings,
    sections: cleanSections,
    visibleText: visibleText.slice(0, 200_000),
    mainText: mainText.slice(0, 200_000),
    wordCount: wordCount(visibleText),
    mainWordCount: wordCount(mainText),
    images,
    scripts,
    stylesheets,
    embeds,
    links,
    jsonLd,
    microdataTypes: [...microdataTypes],
    rdfaTypes: [...rdfaTypes],
    dates: collectDates($, jsonLd, headers),
    copyrightYear,
    footerText,
    spaShell,
    textHash: createHash("sha1").update(mainText.toLowerCase()).digest("hex"),
  };
}
