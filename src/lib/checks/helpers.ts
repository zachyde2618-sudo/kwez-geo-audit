import { HELP_SUBDOMAIN, KEY_ROLES } from "@/lib/crawler/crawl";
import { typesOf } from "@/lib/crawler/extract";
import type { CrawlData, PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import type { CheckContext, RawCheckResult } from "./types";
import { unable } from "./types";

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

export function relPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search || "/";
    // Pages on the business's help subdomain keep their host, so "/" isn't mistaken for the homepage.
    return HELP_SUBDOMAIN.test(u.hostname.replace(/^www\./, "")) ? `${u.hostname}${path}` : path;
  } catch {
    return url;
  }
}

export const ev = {
  url: (label: string, url: string): Evidence => ({ kind: "url", label, value: url, url }),
  measure: (label: string, value: string, url?: string): Evidence => ({ kind: "measurement", label, value, url }),
  snippet: (label: string, value: string, url?: string): Evidence => ({ kind: "snippet", label, value, url }),
  header: (label: string, value: string, url?: string): Evidence => ({ kind: "header", label, value, url }),
  note: (label: string, value: string, url?: string): Evidence => ({ kind: "note", label, value, url }),
};

/** Returns the crawl, or an Unable to Verify result explaining why there's no crawl data. */
export function needCrawl(ctx: CheckContext): CrawlData | RawCheckResult {
  const crawl = ctx.data.crawl;
  if (!crawl) return unable(`Not checked: the website could not be crawled${ctx.data.crawlError ? ` (${ctx.data.crawlError})` : ""}.`);
  if (!crawl.pages.length) {
    if (crawl.robots.status === 0) {
      return unable(`Not checked: robots.txt could not be fetched (${crawl.robots.error ?? "no response"}), so, following crawler rules, no pages were fetched. Check the site is online and re-run.`);
    }
    if (crawl.skippedByRobots.length) {
      return unable("Not checked: your robots.txt asks crawlers like ours not to fetch the homepage, so page content couldn't be read.", "", {
        evidence: [ev.url("robots.txt", crawl.robots.url)],
      });
    }
    const f = crawl.failedFetches[0];
    return unable(`Not checked: the homepage could not be fetched${f ? ` (${f.status || f.error})` : ""}.`);
  }
  return crawl;
}

export const isResult = (x: CrawlData | RawCheckResult): x is RawCheckResult => "status" in x;

export function homePage(crawl: CrawlData): PageData | undefined {
  return crawl.pages.find((p) => p.role === "home") ?? crawl.pages[0];
}

export function keyPages(crawl: CrawlData): PageData[] {
  return crawl.pages.filter((p) => KEY_ROLES.includes(p.role) && p.status < 400);
}

export function okPages(crawl: CrawlData): PageData[] {
  return crawl.pages.filter((p) => p.status >= 200 && p.status < 400);
}

export function allJsonLdNodes(crawl: CrawlData): { node: Record<string, unknown>; page: PageData; types: string[] }[] {
  const out: { node: Record<string, unknown>; page: PageData; types: string[] }[] = [];
  for (const page of crawl.pages) for (const b of page.jsonLd) for (const node of b.nodes) out.push({ node, page, types: typesOf(node) });
  return out;
}

export const ORG_TYPES = new Set([
  "Organization", "Corporation", "LocalBusiness", "ProfessionalService", "OnlineBusiness", "NGO", "EducationalOrganization",
  "Electrician", "Plumber", "HomeAndConstructionBusiness", "GeneralContractor", "RoofingContractor", "HVACBusiness", "HousePainter", "Locksmith",
  "LegalService", "Attorney", "Notary", "AccountingService", "FinancialService", "InsuranceAgency", "RealEstateAgent", "EmploymentAgency",
  "MedicalBusiness", "Dentist", "Physician", "MedicalClinic", "Optician", "Pharmacy", "VeterinaryCare",
  "FoodEstablishment", "Restaurant", "CafeOrCoffeeShop", "Bakery", "BarOrPub", "Store", "AutoRepair", "AutomotiveBusiness",
  "BeautySalon", "HairSalon", "HealthAndBeautyBusiness", "HealthClub", "SportsActivityLocation", "LodgingBusiness", "Hotel", "TravelAgency",
  "ChildCare", "DryCleaningOrLaundry", "EntertainmentBusiness", "MovingCompany", "SelfStorage", "TouristInformationCenter",
]);

export function isOrgType(t: string): boolean {
  return ORG_TYPES.has(t) || /(Business|Organization|Organisation|Service|Contractor|Agency|Store)$/.test(t);
}

/** Lower-case, strip punctuation and collapse whitespace, for fuzzy text containment. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function asArray<T = unknown>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

export function stringsIn(v: unknown): string[] {
  return asArray(v)
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as Record<string, unknown>)["@id"] === "string" ? ((x as Record<string, unknown>)["@id"] as string) : null))
    .filter((x): x is string => !!x);
}

export function sameUrl(a: string, b: string): boolean {
  const n = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return n(a) === n(b);
}

/** Find the FAQ: a page classified as FAQ, a page with FAQPage schema, or a FAQ-like heading. */
export function findFaq(crawl: CrawlData): { page: PageData; how: Evidence } | null {
  const pages = okPages(crawl);
  const hasFaqSchema = (p: PageData) => p.jsonLd.some((b) => b.nodes.some((n) => typesOf(n).includes("FAQPage")));
  const faqHeading = (p: PageData) => p.headings.find((h) => /frequently asked|\bfaqs?\b|common questions|your questions/i.test(h.text));
  // Question headings below the title: the Q&A pairs an AI could lift.
  const questions = (p: PageData) => p.sections.filter((s) => s.tag !== "h1" && /\?\s*$/.test(s.heading)).length;
  // Several pages can look like an FAQ (a help-centre front page, a pricing page with an FAQ
  // section, single help articles). Judge the one with the most questions and answers on it.
  const candidates = pages
    .map((p, i) => ({ p, i, role: p.role === "faq", schema: hasFaqSchema(p), heading: faqHeading(p) }))
    .filter((c) => c.role || c.schema || c.heading)
    .sort((a, b) => questions(b.p) - questions(a.p) || Number(b.schema) - Number(a.schema) || Number(b.role) - Number(a.role) || a.i - b.i);
  const best = candidates[0];
  if (!best) return null;
  if (best.role) return { page: best.p, how: ev.url("FAQ page", best.p.finalUrl) };
  if (best.schema) return { page: best.p, how: ev.measure("FAQPage schema found on", relPath(best.p.finalUrl), best.p.finalUrl) };
  return { page: best.p, how: ev.snippet(`FAQ heading (h${best.heading!.level})`, best.heading!.text, best.p.finalUrl) };
}

/** Plain sentence listing up to n items, then "and N more". */
export function listSome(items: string[], n = 5): string {
  if (items.length <= n) return items.join(", ");
  return `${items.slice(0, n).join(", ")} and ${items.length - n} more`;
}
