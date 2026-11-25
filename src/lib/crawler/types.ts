import type { RobotsTxt } from "./robots";

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** Uncompressed body size in bytes (capped at maxBodyBytes; see `truncated`). */
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  contentType: string;
  body: Buffer;
  redirects: string[];
  error?: string;
}

export interface Heading {
  level: number;
  text: string;
}

/** A heading (or <summary>/<dt>) and the text blocks that follow it, up to the next heading. */
export interface Section {
  level: number;
  heading: string;
  /** Tag the heading came from: h1–h6, summary or dt. */
  tag: string;
  /** Text of the first block after the heading. */
  firstText: string;
  /** All text up to the next heading (clipped). */
  text: string;
  /** True when the first block follows the heading within the same parent section. */
  adjacent: boolean;
}

export interface ImageRef {
  src: string;
  alt: string | null;
  loading: string | null;
  fetchpriority: string | null;
  widthAttr: number | null;
  heightAttr: number | null;
  /** Position among images on the page (0-based). */
  index: number;
  /** Inside a <picture> that offers a WebP/AVIF <source>. */
  modernSource: boolean;
  /** Has data-src / lazyload class (JS lazy-loading). */
  jsLazy: boolean;
}

export interface ScriptRef {
  src: string | null;
  async: boolean;
  defer: boolean;
  module: boolean;
  inHead: boolean;
  inlineBytes: number;
  type: string | null;
}

export interface StylesheetRef {
  href: string;
  inHead: boolean;
  media: string | null;
}

export interface EmbedRef {
  kind: "iframe" | "video";
  src: string;
  provider: string | null;
  loading: string | null;
  index: number;
}

export interface LinkRef {
  href: string;
  text: string;
  internal: boolean;
  inNavOrFooter: boolean;
}

export interface JsonLdBlock {
  raw: string;
  error: string | null;
  /** Flattened nodes that have an @type. */
  nodes: Record<string, unknown>[];
}

export interface DateSignal {
  source: string;
  value: string;
  date: string; // ISO
}

export type PageRole =
  | "home"
  | "about"
  | "team"
  | "services"
  /** A single product page (e.g. /products/vitamin-c-serum). */
  | "product"
  /** A product listing or category page (e.g. /collections/face). */
  | "collection"
  | "faq"
  | "contact"
  | "blog"
  | "post"
  | "case-study"
  | "reviews"
  | "research"
  /** Privacy, terms, shipping, returns, cookies and similar. */
  | "policy"
  | "other";

export interface PageData {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  htmlBytes: number;
  ttfbMs: number;
  depth: number;
  role: PageRole;
  title: string;
  metaRobots: Record<string, string>;
  xRobotsTag: string | null;
  canonical: string | null;
  lang: string | null;
  metaDescription: string | null;
  headings: Heading[];
  sections: Section[];
  visibleText: string;
  mainText: string;
  wordCount: number;
  mainWordCount: number;
  images: ImageRef[];
  scripts: ScriptRef[];
  stylesheets: StylesheetRef[];
  embeds: EmbedRef[];
  links: LinkRef[];
  jsonLd: JsonLdBlock[];
  microdataTypes: string[];
  rdfaTypes: string[];
  dates: DateSignal[];
  copyrightYear: number | null;
  /** Text of <footer> (clipped), used for prefill and NAP. */
  footerText: string;
  /** Empty SPA mount point detected (#root, #__next, #app with no text). */
  spaShell: boolean;
  textHash: string;
}

export interface AssetInfo {
  url: string;
  kind: "image" | "script" | "stylesheet";
  status: number;
  bytes: number;
  overLimit: boolean;
  contentType: string;
  thirdParty: boolean;
  width?: number;
  height?: number;
  /** Pages that reference it. */
  pages: string[];
  error?: string;
}

export interface BotProbe {
  agent: string;
  status: number;
  baselineStatus: number;
  blocked: boolean;
  error?: string;
}

export interface RenderComparison {
  url: string;
  rawWords: number;
  renderedWords: number;
  /** Share of rendered main-content words missing from the raw HTML (0–1). */
  jsOnlyShare: number;
  sample: string;
  error?: string;
}

export interface CrawlData {
  origin: string;
  hosts: string[];
  /** The business's help/FAQ/docs subdomains that were crawled too (e.g. support.example.com). */
  helpHosts?: string[];
  startedAt: string;
  robots: { url: string; status: number; body: string; parsed: RobotsTxt; error?: string };
  sitemap: { urls: { loc: string; lastmod?: string }[]; sources: string[]; error?: string };
  llmsTxt: { status: number; bytes: number; url: string };
  pages: PageData[];
  /** Pages we did not fetch because robots.txt disallows our crawler. */
  skippedByRobots: string[];
  failedFetches: { url: string; status: number; error?: string }[];
  /** Linked PDFs and other non-HTML documents discovered. */
  documents: { url: string; from: string; text: string }[];
  assets: AssetInfo[];
  botProbes: BotProbe[];
  renders: RenderComparison[] | null;
  renderError?: string;
}
