/**
 * Parse a block of pasted text (e.g. copied from a Google Doc or notes) into audit form fields.
 *
 * Text is split into sections by headings. A heading is a known label on its own line, or a
 * label followed by a colon with the value on the same line:
 *
 *   Website: example.co.uk
 *   Services: rewiring, EV chargers
 *   People:
 *   - Jo Bloggs, Managing Director, https://www.linkedin.com/in/jo-bloggs
 *
 * Markdown/Docs decoration (#, **, bullets, numbering) is ignored. Runs entirely in the browser:
 * no network, no API calls. Values are returned in the same shape the form keeps in state.
 */

export interface PastedPerson { fullName: string; jobTitle: string; linkedinUrl: string; otherUrls: string }
export interface PastedCompetitor { name: string; url: string }

export interface PastedDetails {
  url?: string;
  companyName?: string;
  industry?: string;
  town?: string;
  country?: string;
  /** Comma-separated, as in the form. */
  services?: string;
  /** One per line, as in the form. */
  questions?: string;
  competitors?: PastedCompetitor[];
  people?: PastedPerson[];
  chNumber?: string;
  gbpUrl?: string;
  reviewUrls?: string;
  socialUrls?: string;
  pressUrls?: string;
  maxPages?: string;
  runVisibility?: boolean;
  promptCount?: string;
}
export type PastedField = keyof PastedDetails;

export const PASTE_FIELD_LABELS: Record<PastedField, string> = {
  url: "Website",
  companyName: "Company name",
  industry: "Industry",
  town: "Town or city",
  country: "Country",
  services: "Services",
  questions: "Questions",
  competitors: "Competitors",
  people: "People",
  chNumber: "Companies House number",
  gbpUrl: "Google Business Profile",
  reviewUrls: "Review profiles",
  socialUrls: "Social profiles",
  pressUrls: "Press coverage or awards",
  maxPages: "Max pages",
  runVisibility: "Run AI visibility tests",
  promptCount: "Number of test prompts",
};

const ALIASES: Record<PastedField, string[]> = {
  url: ["website", "website address", "web address", "site", "url", "domain", "website url"],
  companyName: ["company", "company name", "business", "business name", "name of business", "trading name"],
  industry: ["industry", "sector", "industry or sector", "trade"],
  town: ["town", "city", "town or city", "location", "area"],
  country: ["country"],
  services: ["services", "products", "products or services", "main products or services", "main services", "products and services", "services offered"],
  questions: ["questions", "example questions", "customer questions", "questions a customer might ask an ai", "questions customers ask", "prompts to test"],
  competitors: ["competitors", "competitor", "competition", "rivals"],
  people: ["people", "team", "staff", "founders", "key people", "key staff", "founders and key staff", "directors"],
  chNumber: ["companies house number", "companies house", "company number", "company registration number", "registration number", "crn"],
  gbpUrl: ["google business profile", "google business profile link", "google business", "gbp", "google my business", "google maps"],
  reviewUrls: ["reviews", "review profiles", "review links", "review sites", "review platforms"],
  socialUrls: ["social", "socials", "social profiles", "social media", "social links", "social media links"],
  pressUrls: ["press", "press coverage", "awards", "press coverage or awards", "press and awards", "press or awards", "media coverage"],
  maxPages: ["max pages", "max pages to crawl", "pages to crawl", "pages"],
  runVisibility: ["run ai visibility tests", "ai visibility tests", "ai visibility", "visibility tests"],
  promptCount: ["number of test prompts", "test prompts", "prompt count", "number of prompts"],
};

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const LABEL_TO_FIELD = new Map<string, PastedField>(
  (Object.entries(ALIASES) as [PastedField, string[]][]).flatMap(([f, as]) => as.map((a) => [norm(a), f] as const)),
);

/** Strip markdown/Docs decoration from a heading candidate: "## **Website**" → "Website". */
const cleanLabel = (s: string) => s.replace(/^#+\s*/, "").replace(/[*_]/g, "").trim();
/** Strip list markers: "- x", "* x", "• x", "1. x", "1) x". */
const stripBullet = (s: string) => s.replace(/^\s*(?:[-*•·◦▪–—]|\d{1,2}[.)])(?:\s+|$)/, "").trim();
/** Template hints like "(one per line)" are not values. */
const isHint = (s: string) => /^\(.*\)$/.test(s.trim());

function matchHeading(line: string): { field: PastedField; rest: string } | null {
  const t = line.replace(/ /g, " ").trim();
  if (!t) return null;
  // "Label: value" (value may be empty). Ignore URLs like "https://…".
  const m = /^([^:：]{1,60})[:：](.*)$/.exec(t);
  if (m && !/^\s*\/\//.test(m[2])) {
    const field = LABEL_TO_FIELD.get(norm(cleanLabel(stripBullet(m[1]))));
    if (field) {
      const rest = m[2].replace(/^\s*\*+\s*/, "").trim();
      return { field, rest: isHint(rest) ? "" : rest };
    }
  }
  // A label on its own line ("People", "## People", "**People**").
  const field = LABEL_TO_FIELD.get(norm(cleanLabel(t)));
  return field ? { field, rest: "" } : null;
}

const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s,|]*)?/gi;
const LOCAL_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s,|]*)?/gi;
const findUrls = (s: string) => [...(s.match(LOCAL_URL_RE) ?? []), ...(s.replace(LOCAL_URL_RE, " ").match(URL_RE) ?? [])];

/** Split a list section into items: one per line, and comma-separated items within a line. */
function listItems(lines: string[]): string[] {
  return lines.flatMap((l) => stripBullet(l).split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
}
const lineItems = (lines: string[]) => lines.map(stripBullet).filter((l) => l && !isHint(l));

function parsePerson(line: string): PastedPerson | null {
  const urls = findUrls(line);
  let rest = line;
  for (const u of urls) rest = rest.replace(u, " ");
  const parts = rest.split(/\s+[-–—|]\s+|[,|\t]|:\s/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length && !urls.length) return null;
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? "";
  return {
    fullName: parts[0] ?? "",
    jobTitle: parts.slice(1).join(", "),
    linkedinUrl: linkedin,
    otherUrls: urls.filter((u) => u !== linkedin).join(", "),
  };
}

function parseCompetitor(line: string): PastedCompetitor | null {
  const url = findUrls(line)[0] ?? "";
  const name = (url ? line.replace(url, " ") : line)
    .replace(/[()[\]]/g, " ")
    .split(/\s+[-–—|]\s+|[,|\t]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!name && !url) return null;
  const fallbackName = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/:]/)[0];
  return { name: name || fallbackName, url };
}

export interface PasteResult {
  details: PastedDetails;
  /** Fields that received a value, in form order. */
  filled: PastedField[];
  /** Lines that weren't under a recognised heading (shown to the user, never guessed at). */
  unrecognised: string[];
}

export function parsePastedDetails(text: string): PasteResult {
  const sections = new Map<PastedField, string[]>();
  const unrecognised: string[] = [];
  let current: PastedField | null = null;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/ /g, " ");
    const h = matchHeading(line);
    if (h) {
      current = h.field;
      const arr = sections.get(current) ?? [];
      if (h.rest) arr.push(h.rest);
      sections.set(current, arr);
      continue;
    }
    if (!line.trim()) continue;
    if (current) sections.get(current)!.push(line);
    else unrecognised.push(line.trim());
  }

  const d: PastedDetails = {};
  const get = (f: PastedField) => sections.get(f) ?? [];
  const single = (f: "url" | "companyName" | "industry" | "town" | "country" | "chNumber") => {
    const [v, ...extra] = lineItems(get(f));
    if (v) d[f] = v;
    unrecognised.push(...extra); // one-value fields: surface anything else rather than drop it
  };
  single("url");
  single("companyName");
  single("industry");
  single("town");
  single("country");
  single("chNumber");

  const services = listItems(get("services"));
  if (services.length) d.services = services.join(", ");
  const questions = lineItems(get("questions"));
  if (questions.length) d.questions = questions.join("\n");

  const competitors = lineItems(get("competitors")).map(parseCompetitor).filter((c): c is PastedCompetitor => !!c);
  if (competitors.length) d.competitors = competitors;
  const people = lineItems(get("people")).map(parsePerson).filter((p): p is PastedPerson => !!p && !!p.fullName);
  if (people.length) d.people = people;

  // Link-only fields: lines with no link in them are surfaced, not silently dropped.
  const linkLines = (f: PastedField) => {
    const ls = lineItems(get(f));
    unrecognised.push(...ls.filter((l) => !findUrls(l).length));
    return findUrls(ls.join(" "));
  };
  const gbp = linkLines("gbpUrl")[0];
  if (gbp) d.gbpUrl = gbp;
  for (const f of ["reviewUrls", "socialUrls", "pressUrls"] as const) {
    const urls = linkLines(f);
    if (urls.length) d[f] = urls.join(", ");
  }

  const num = (f: "maxPages" | "promptCount") => {
    const n = /\d+/.exec(get(f).join(" "))?.[0];
    if (n) d[f] = n;
  };
  num("maxPages");
  num("promptCount");
  const vis = norm(get("runVisibility").join(" "));
  if (vis) {
    if (/^(yes|y|true|on|1|run|enable|enabled)\b/.test(vis)) d.runVisibility = true;
    else if (/^(no|n|false|off|0|skip|disable|disabled)\b/.test(vis)) d.runVisibility = false;
  }

  const order = Object.keys(PASTE_FIELD_LABELS) as PastedField[];
  return { details: d, filled: order.filter((f) => d[f] !== undefined), unrecognised };
}

/** A template users can keep in a Google Doc or notes and fill in. Blank headings are ignored. */
export const PASTE_TEMPLATE = `Website:
Company name:
Industry:
Town:
Country: United Kingdom
Services: (comma-separated, e.g. rewiring, EV charger installation)
Questions: (one per line)
-
Competitors: (one per line: name, website)
-
People: (one per line: full name, job title, LinkedIn link)
-
Companies House number:
Google Business Profile:
Review profiles:
Social profiles:
Press coverage or awards:
`;
