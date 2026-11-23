import { z } from "zod";
import { bodyText, politeFetch } from "@/lib/crawler/fetcher";
import { extractPage } from "@/lib/crawler/extract";
import { isAllowed, pathOf, robotsFromStatus } from "@/lib/crawler/robots";
import { OUR_UA_TOKEN } from "@/lib/crawler/crawl";
import type { ExternalSource } from "@/lib/llm/external";
import type { LlmClient } from "@/lib/llm/client";
import type { AuditInput } from "@/lib/schemas/input";
import { webSearch, type SearchResult } from "./search";

/**
 * Phase 5 external stage: search the web for the business, its people and its market, then
 * classify each result (is it about this business? what kind of source is it?). The checks in
 * category 9 and 6.2 are scored from these classified results; 9.5, 9.7 and 9.9 additionally
 * get an AI judgement on the text (see runExternalReview).
 */

export const SOURCE_KINDS = [
  "review_platform",
  "directory",
  "news",
  "industry_publication",
  "professional_body",
  "award_or_accreditation",
  "ranking_or_comparison",
  "testimonial_or_case_study",
  "social",
  "own_site",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const KIND_LABEL: Record<SourceKind, string> = {
  review_platform: "Review platform",
  directory: "Directory or listing",
  news: "News",
  industry_publication: "Industry publication",
  professional_body: "Professional or official body",
  award_or_accreditation: "Award or accreditation",
  ranking_or_comparison: "Ranking or comparison",
  testimonial_or_case_study: "Testimonial or case study",
  social: "Social media",
  own_site: "Your own site",
  other: "Other site",
};

export type QueryPurpose = "brand" | "local" | "reviews" | "recognition" | "ranking" | "domain" | "person" | "expertise";

export interface PlannedQuery {
  purpose: QueryPurpose;
  query: string;
  /** For person/expertise queries. */
  person?: string;
}

export interface SearchLog extends PlannedQuery {
  count: number;
  cached: boolean;
  error?: string;
}

export interface FoundResult extends SearchResult {
  n: number;
  host: string;
  purposes: QueryPurpose[];
  /** People searched for whose query returned this result. */
  personQueries: string[];
  about: "yes" | "no" | "unsure";
  kind: SourceKind;
  /** Supplied people this source connects with the business. */
  peopleLinked: string[];
  /** Supplied people this source shows with publications, talks, titles or roles in the field. */
  peopleCredentials: string[];
  /** The page contains the business's web address (a stand-in for a link). */
  mentionsDomain: boolean;
  /** Fuller page text, for the few sources fetched for the AI review. */
  pageText?: string;
}

export interface GatheredExternal {
  provider: "serper" | "brave";
  businessName: string;
  domain: string;
  searches: SearchLog[];
  results: FoundResult[];
  classifiedBy: "ai" | "rules";
  classifyError?: string;
  mentions: ExternalSource[];
  reviews: ExternalSource[];
}

// ── Known hosts (fallback classification, and hints for the AI) ─────────────
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|pinterest|threads|snapchat|reddit)\.com$/i;
const REVIEW =
  /(^|\.)(trustpilot\.com|reviews\.co\.uk|reviews\.io|feefo\.com|checkatrade\.com|trustatrader\.com|ratedpeople\.com|mybuilder\.com|yelp\.(com|co\.uk)|tripadvisor\.(com|co\.uk)|treatwell\.co\.uk|fresha\.com|booksy\.com|whatclinic\.com|doctify\.com|iwantgreatcare\.org|bark\.com|houzz\.(com|co\.uk)|reviewsolicitors\.co\.uk|google\.com)$/i;
const DIRECTORY =
  /(^|\.)(yell\.com|thomsonlocal\.com|scoot\.co\.uk|freeindex\.co\.uk|cylex-uk\.co\.uk|hotfrog\.co\.uk|192\.com|find-and-update\.company-information\.service\.gov\.uk|company-information\.service\.gov\.uk|endole\.co\.uk|opencorporates\.com|companycheck\.co\.uk|bizdb\.co\.uk|nextdoor\.co\.uk|applemaps|bing\.com|yably\.co\.uk|misterwhat\.co\.uk|uksmallbusinessdirectory\.co\.uk)$/i;
const NEWS =
  /(^|\.)(bbc\.co\.uk|theguardian\.com|telegraph\.co\.uk|independent\.co\.uk|thetimes\.co\.uk|dailymail\.co\.uk|mirror\.co\.uk|express\.co\.uk|standard\.co\.uk|metro\.co\.uk|inews\.co\.uk|yorkshireeveningpost\.co\.uk|manchestereveningnews\.co\.uk|nationalworld\.com)$|(news|gazette|chronicle|echo|herald|post|journal|examiner|courier|mercury|advertiser)\.co\.uk$/i;
const OFFICIAL = /\.(gov\.uk|nhs\.uk|ac\.uk|police\.uk|gov|edu)$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ruleKind(host: string): SourceKind {
  if (SOCIAL.test(host)) return "social";
  if (REVIEW.test(host)) return "review_platform";
  if (DIRECTORY.test(host)) return "directory";
  if (NEWS.test(host)) return "news";
  if (OFFICIAL.test(host)) return "professional_body";
  return "other";
}

// ── Query plan ──────────────────────────────────────────────────────────────
export function businessIdentity(input: AuditInput): { name: string; domain: string } {
  const domain = hostOf(input.url);
  return { name: input.companyName.trim() || domain, domain };
}

const COUNTRY_CODES: Record<string, string> = {
  "united kingdom": "gb", uk: "gb", "great britain": "gb", england: "gb", scotland: "gb", wales: "gb", "northern ireland": "gb",
  ireland: "ie", "united states": "us", usa: "us", us: "us", canada: "ca", australia: "au", "new zealand": "nz",
};
export const countryCode = (country: string) => COUNTRY_CODES[country.trim().toLowerCase()] ?? "gb";

/** At most 3 people are searched (2 queries each) to keep an audit around a dozen searches. */
export const MAX_PEOPLE_SEARCHED = 3;

export function planQueries(input: AuditInput): PlannedQuery[] {
  const { name, domain } = businessIdentity(input);
  const q = (s: string) => `"${s.replace(/"/g, "")}"`;
  const notOwn = domain ? ` -site:${domain}` : "";
  const town = input.town.trim();
  const industry = input.industry.trim();
  const plan: PlannedQuery[] = [
    { purpose: "brand", query: `${q(name)}${notOwn}` },
    { purpose: "reviews", query: `${q(name)} reviews${town ? ` ${town}` : ""}${notOwn}` },
    { purpose: "recognition", query: `${q(name)} (award OR awards OR accredited OR featured OR shortlisted OR winner)${notOwn}` },
  ];
  if (town) plan.push({ purpose: "local", query: `${q(name)} ${town}${notOwn}` });
  if (industry) plan.push({ purpose: "ranking", query: `best ${industry}${town ? ` in ${town}` : ""}` });
  // Unquoted: Serper's free plan rejects a quoted web address ("Query pattern not allowed").
  if (domain && domain !== name) plan.push({ purpose: "domain", query: `${domain}${notOwn}` });
  for (const p of input.people.slice(0, MAX_PEOPLE_SEARCHED)) {
    const person = p.fullName.trim();
    if (!person) continue;
    plan.push({ purpose: "person", person, query: `${q(person)} ${q(name)}${notOwn}` });
    plan.push({
      purpose: "expertise",
      person,
      query: `${q(person)} ${industry || p.jobTitle || "(interview OR speaker OR author OR article)"}${notOwn}`,
    });
  }
  return plan;
}

// ── Classification ──────────────────────────────────────────────────────────
const Classification = z.object({
  results: z.array(
    z.object({
      n: z.number().int(),
      about_business: z.enum(["yes", "no", "unsure"]),
      kind: z.enum(SOURCE_KINDS),
      people_linked: z.array(z.string()),
      people_credentials: z.array(z.string()),
    }),
  ),
});
type Classification = z.infer<typeof Classification>;

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "about_business", "kind", "people_linked", "people_credentials"],
        properties: {
          n: { type: "integer" },
          about_business: { type: "string", enum: ["yes", "no", "unsure"] },
          kind: { type: "string", enum: [...SOURCE_KINDS] },
          people_linked: { type: "array", items: { type: "string" } },
          people_credentials: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const CLASSIFY_SYSTEM = `You classify web search results for a Generative Engine Optimisation audit of one business.
For every numbered result decide:
- about_business: "yes" only if the result is clearly about THIS business (same name AND consistent with its location, trade or website); "no" if it is about something else (another business with a similar name, a generic word, an unrelated person); "unsure" if the snippet can't tell. For results of a "best … in …" ranking search, answer "yes" only if the title or snippet shows THIS business is listed.
- kind: what sort of source it is: review_platform (customer review sites), directory (business listings, Companies House, local directories), news (newspapers, local news), industry_publication (trade press, specialist magazines and blogs), professional_body (regulators, trade associations, registers, official .gov/.nhs sites), award_or_accreditation (awards, shortlists, accreditation schemes), ranking_or_comparison ("best of" lists, comparisons, top-10s), testimonial_or_case_study (a client or partner describing work done), social, own_site, other.
- people_linked: which of the listed people this result connects with the business (exact names from the list; empty if none).
- people_credentials: which of the listed people this result shows with publications, talks, interviews, professional titles, registrations or awards in their field (exact names from the list).
Judge only from the title, URL and snippet given. Include every result number exactly once.`;

function heuristicAbout(r: SearchResult, name: string, domain: string, town: string): "yes" | "no" | "unsure" {
  const hay = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
  const hasName = name.length > 2 && hay.includes(name.toLowerCase());
  const hasDomain = !!domain && hay.includes(domain.toLowerCase());
  if (hasDomain) return "yes";
  if (hasName && (!town || hay.includes(town.toLowerCase()) || name.split(/\s+/).length >= 2)) return "yes";
  return hasName ? "unsure" : "no";
}

async function classify(
  results: FoundResult[],
  input: AuditInput,
  identity: { name: string; domain: string },
  client: LlmClient,
  signal: AbortSignal,
): Promise<void> {
  const people = input.people.map((p) => p.fullName.trim()).filter(Boolean);
  const context = [
    `Business: ${identity.name}`,
    `Website: ${identity.domain}`,
    input.industry && `Trade or industry: ${input.industry}`,
    input.town && `Town or city: ${input.town}, ${input.country}`,
    input.services.length && `Services: ${input.services.join(", ")}`,
    people.length && `People: ${input.people.map((p) => `${p.fullName}${p.jobTitle ? ` (${p.jobTitle})` : ""}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const batches: FoundResult[][] = [];
  for (let i = 0; i < results.length; i += 40) batches.push(results.slice(i, i + 40));
  for (const [bi, batch] of batches.entries()) {
    const user = `${context}\n\nSearch results:\n${batch
      .map((r) => `[${r.n}] (found by: ${r.purposes.join(", ")}) ${r.title}\nURL: ${r.url}\n${r.snippet}${r.rating ? `\nRating: ${r.rating} from ${r.ratingCount ?? "?"} reviews` : ""}`)
      .join("\n\n")}`;
    const nums = new Set(batch.map((r) => r.n));
    const out: Classification = await client.judge({
      purpose: `Web search: classify results (batch ${bi + 1} of ${batches.length})`,
      system: CLASSIFY_SYSTEM,
      user,
      jsonSchema: CLASSIFY_SCHEMA,
      parse: (raw) => Classification.parse(raw),
      validate: (v) => {
        const seen = new Set(v.results.map((x) => x.n));
        const missing = [...nums].filter((n) => !seen.has(n));
        const extra = v.results.filter((x) => !nums.has(x.n)).map((x) => x.n);
        return [
          ...(missing.length ? [`results missing: ${missing.join(", ")}`] : []),
          ...(extra.length ? [`unknown result numbers: ${extra.join(", ")}`] : []),
        ];
      },
      signal,
    });
    const byN = new Map(out.results.map((x) => [x.n, x]));
    const known = (names: string[]) => names.filter((n) => people.some((p) => p.toLowerCase() === n.trim().toLowerCase())).map((n) => people.find((p) => p.toLowerCase() === n.trim().toLowerCase())!);
    for (const r of batch) {
      const c = byN.get(r.n);
      if (!c) continue;
      r.about = c.about_business;
      // Hard facts from the URL override the model.
      const rk = ruleKind(r.host);
      r.kind = rk === "social" ? "social" : c.kind === "own_site" ? "other" : c.kind;
      r.peopleLinked = known(c.people_linked);
      r.peopleCredentials = known(c.people_credentials);
    }
  }
}

// ── Fetching a few sources for fuller text ──────────────────────────────────
const robotsCache = new Map<string, Promise<ReturnType<typeof robotsFromStatus>>>();

async function fetchSourceText(url: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const u = new URL(url);
    let robots = robotsCache.get(u.origin);
    if (!robots) {
      robots = politeFetch(`${u.origin}/robots.txt`, { signal, accept: "text/plain,*/*;q=0.5" }).then((r) =>
        robotsFromStatus(r.status, r.status >= 200 && r.status < 300 ? bodyText(r).slice(0, 200_000) : ""),
      );
      robotsCache.set(u.origin, robots);
    }
    if (!isAllowed(await robots, OUR_UA_TOKEN, pathOf(url)).allowed) return undefined;
    const res = await politeFetch(url, { signal, maxBytes: 2 * 1024 * 1024 });
    if (res.status < 200 || res.status >= 300 || !/html/i.test(res.contentType)) return undefined;
    const page = extractPage({ url, finalUrl: res.finalUrl, status: res.status, headers: res.headers, html: bodyText(res), htmlBytes: res.bytes, ttfbMs: res.ttfbMs, depth: 0, siteHosts: [u.hostname] });
    const text = (page.mainText.length > 400 ? page.mainText : page.visibleText).trim();
    return text ? text.slice(0, 6_000) : undefined;
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

const sourceText = (r: FoundResult) =>
  [r.pageText ?? r.snippet, r.rating ? `Rating shown in search results: ${r.rating}${r.ratingCount ? ` from ${r.ratingCount} reviews` : ""}` : ""].filter(Boolean).join("\n\n");

// ── Main entry ──────────────────────────────────────────────────────────────
export async function gatherExternal(opts: {
  input: AuditInput;
  signal: AbortSignal;
  progress: (m: string) => void;
  /** When given, results are classified by AI; otherwise by simple rules. */
  client?: LlmClient;
  /** Fetch up to this many review/mention pages for fuller text (0 to disable). */
  fetchPages?: number;
}): Promise<GatheredExternal> {
  const { input, signal, progress } = opts;
  const identity = businessIdentity(input);
  const country = countryCode(input.country);
  const plan = planQueries(input);
  const searches: SearchLog[] = [];
  const byUrl = new Map<string, FoundResult>();
  let n = 0;
  let provider: "serper" | "brave" = "serper";

  progress(`Searching the web: ${plan.length} searches about ${identity.name}…`);
  for (const p of plan) {
    signal.throwIfAborted();
    try {
      const res = await webSearch({ query: p.query, country, signal });
      provider = res.provider;
      searches.push({ ...p, count: res.results.length, cached: res.cached });
      for (const r of res.results) {
        const key = r.url.replace(/#.*$/, "").replace(/\/$/, "");
        let found = byUrl.get(key);
        if (!found) {
          const host = hostOf(r.url);
          const own = !!identity.domain && (host === identity.domain || host.endsWith(`.${identity.domain}`));
          found = {
            ...r,
            n: ++n,
            host,
            purposes: [],
            personQueries: [],
            about: "unsure",
            kind: own ? "own_site" : ruleKind(host),
            peopleLinked: [],
            peopleCredentials: [],
            mentionsDomain: !!identity.domain && `${r.title} ${r.snippet}`.toLowerCase().includes(identity.domain),
          };
          byUrl.set(key, found);
        }
        if (!found.purposes.includes(p.purpose)) found.purposes.push(p.purpose);
        if (p.person && !found.personQueries.includes(p.person)) found.personQueries.push(p.person);
        if (p.purpose === "domain") found.mentionsDomain = true;
      }
    } catch (err) {
      if (signal.aborted) throw err;
      searches.push({ ...p, count: 0, cached: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (searches.every((s) => s.error)) throw new Error(searches[0]?.error ?? "web search failed");

  const results = [...byUrl.values()].filter((r) => r.kind !== "own_site");
  // Rule-based first pass (also the fallback when AI classification isn't available or fails).
  for (const r of results) {
    r.about = heuristicAbout(r, identity.name, identity.domain, input.town.trim());
    if (r.about === "yes") {
      r.peopleLinked = input.people.map((p) => p.fullName.trim()).filter((p) => p && r.personQueries.includes(p) && `${r.title} ${r.snippet}`.toLowerCase().includes(p.toLowerCase()));
    }
  }
  let classifiedBy: GatheredExternal["classifiedBy"] = "rules";
  let classifyError: string | undefined;
  if (opts.client && results.length) {
    progress(`Web search: sorting ${results.length} results with AI…`);
    try {
      await classify(results, input, identity, opts.client, signal);
      classifiedBy = "ai";
    } catch (err) {
      if (signal.aborted) throw err;
      classifyError = err instanceof Error ? err.message : String(err);
      progress(`Web search: AI sorting failed (${classifyError}); using simple matching instead`);
    }
  }

  const relevant = results.filter((r) => r.about === "yes" && r.kind !== "social");
  const reviewResults = relevant.filter((r) => r.kind === "review_platform");
  const fetchBudget = opts.fetchPages ?? 6;
  if (fetchBudget > 0) {
    const toFetch = [...reviewResults.slice(0, 3), ...relevant.filter((r) => r.kind !== "review_platform").slice(0, Math.max(0, fetchBudget - Math.min(3, reviewResults.length)))].slice(0, fetchBudget);
    if (toFetch.length) progress(`Web search: reading ${toFetch.length} third-party page(s)…`);
    for (const r of toFetch) {
      signal.throwIfAborted();
      r.pageText = await fetchSourceText(r.url, signal);
    }
  }

  const toSource = (r: FoundResult): ExternalSource => ({ url: r.url, title: r.title, text: sourceText(r) });
  progress(`Web search complete: ${relevant.length} relevant result(s) about ${identity.name} from ${new Set(relevant.map((r) => r.host)).size} site(s)`);
  return {
    provider,
    businessName: identity.name,
    domain: identity.domain,
    searches,
    results,
    classifiedBy,
    classifyError,
    mentions: relevant.slice(0, 25).map(toSource),
    reviews: reviewResults.slice(0, 8).map(toSource),
  };
}
