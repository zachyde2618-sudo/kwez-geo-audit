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
  competitors: ["competitors", "competitor", "competition", "rivals", "main competitors", "local competitors", "competitor websites"],
  people: [
    "people", "person", "team", "staff", "founders", "key people", "key person", "key staff", "founders and key staff",
    "directors", "team members", "team member", "staff member", "employees", "management", "owners",
    // Role headings ("Founder: Jo Bloggs") also count; the role becomes the job title.
    "founder", "co founder", "owner", "director", "managing director", "ceo",
  ],
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
/** "Person 2", "Competitor 1", "Competitor one" → the field for "person" / "competitor". */
function fieldForLabel(label: string): PastedField | undefined {
  const n = norm(label);
  return LABEL_TO_FIELD.get(n) ?? LABEL_TO_FIELD.get(n.replace(/\s+(?:\d{1,2}|one|two|three|four|five)$/, ""));
}
/** Role headings whose name doubles as the person's job title. */
const ROLE_TITLES: Record<string, string> = {
  founder: "Founder",
  "co founder": "Co-founder",
  owner: "Owner",
  director: "Director",
  "managing director": "Managing Director",
  ceo: "CEO",
};

/** Strip markdown/Docs decoration from a heading candidate: "## **Website**" → "Website". */
const cleanLabel = (s: string) => s.replace(/^#+\s*/, "").replace(/[*_]/g, "").trim();
/** Strip list markers: "- x", "* x", "• x", "1. x", "1) x". */
const stripBullet = (s: string) => s.replace(/^\s*(?:[-*•·◦▪–—]|\d{1,2}[.)])(?:\s+|$)/, "").trim();
/** Template hints like "(one per line)" are not values. */
const isHint = (s: string) => /^\(.*\)$/.test(s.trim());

function matchHeading(line: string): { field: PastedField; rest: string; role?: string } | null {
  const t = line.replace(/ /g, " ").trim();
  if (!t) return null;
  // "Label: value" (value may be empty). Ignore URLs like "https://…".
  const m = /^([^:：]{1,60})[:：](.*)$/.exec(t);
  if (m && !/^\s*\/\//.test(m[2])) {
    const label = cleanLabel(stripBullet(m[1]));
    const field = fieldForLabel(label);
    if (field) {
      const rest = m[2].replace(/^\s*\*+\s*/, "").trim();
      return { field, rest: isHint(rest) ? "" : rest, role: ROLE_TITLES[norm(label)] };
    }
  }
  // A label on its own line ("People", "## People", "**People**").
  // Role words ("Managing Director") on their own line are job titles, not headings.
  const label = cleanLabel(t);
  if (ROLE_TITLES[norm(label)]) return null;
  const field = fieldForLabel(label);
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

const BULLET_RE = /^\s*(?:[-*•·◦▪–—]|\d{1,2}[.)])(?:\s+|$)/;
const stripUrls = (s: string) => {
  let rest = s;
  for (const u of findUrls(s)) rest = rest.replace(u, " ");
  return rest.replace(/[()[\]]/g, " ").replace(/^[\s,|:–—-]+|[\s,|:–—-]+$/g, "").trim();
};
const splitParts = (s: string) => s.split(/\s+[-–—|]\s+|[,|\t]|:\s/).map((x) => x.trim()).filter(Boolean);

type EntryKind = "people" | "competitors";
type SubKey = "name" | "title" | "linkedin" | "links";
/** Labels used inside a person/competitor entry, e.g. "Name: Jo Bloggs", "LinkedIn: …", "Website: …". */
const SUB_LABELS: Record<EntryKind, Record<string, SubKey>> = {
  people: {
    name: "name", "full name": "name",
    title: "title", "job title": "title", role: "title", position: "title", job: "title",
    linkedin: "linkedin", "linkedin profile": "linkedin", "linkedin url": "linkedin", "linkedin link": "linkedin",
    "other profiles": "links", profiles: "links", links: "links", "other links": "links", "personal website": "links",
  },
  competitors: {
    name: "name", company: "name", "company name": "name", "business name": "name",
    website: "links", url: "links", site: "links", "web address": "links", link: "links",
  },
};
/** Competitor sub-labels that are also top-level headings ("Website:"); see the section loop for when they belong to an entry. */
const SHARED_SUB = new Set(["website", "url", "site", "web address", "company", "company name", "business name"]);

function subField(line: string, kind: EntryKind): { key: SubKey; label: string; value: string } | null {
  const m = /^([^:：]{1,30})[:：](.*)$/.exec(line);
  if (!m || /^\s*\/\//.test(m[2])) return null;
  const label = norm(cleanLabel(m[1]));
  const key = SUB_LABELS[kind][label];
  return key ? { key, label, value: m[2].trim() } : null;
}

/** Words that mark a line as a job title rather than another person's name. */
const TITLE_WORDS =
  /\b(director|manager|founder|co-?founder|owner|ceo|cto|cfo|coo|md|chair|partner|head|lead|principal|officer|president|consultant|specialist|advisor|adviser|coordinator|assistant|administrator|engineer|developer|designer|installer|electrician|technician|surveyor|accountant|solicitor|therapist|practitioner|nurse|doctor|dr|clinician|aesthetician|dermatologist|surgeon|dentist|supervisor|associate|executive|secretary|marketing|sales|operations|finance)\b/i;

interface Entry { name: string; title: string; urls: string[] }

/**
 * Group a People/Competitors section into entries. Accepts any mix of:
 *   one per line            "Jo Bloggs, Managing Director, https://linkedin.com/in/jo"
 *   several lines per entry "Jo Bloggs" / "Managing Director" / "linkedin.com/in/jo"
 *   labelled lines          "Name: Jo Bloggs" / "Job title: …" / "LinkedIn: …"
 * Bullets, numbering, blank lines and a repeated "Name:" start a new entry.
 */
function groupEntries(lines: string[], kind: EntryKind, leftovers: string[]): Entry[] {
  const entries: Entry[] = [];
  const st: { cur: Entry | null } = { cur: null };
  const start = (): Entry => {
    const e: Entry = { name: "", title: "", urls: [] };
    entries.push(e);
    st.cur = e;
    return e;
  };
  for (const raw of lines) {
    if (!raw.trim()) {
      st.cur = null;
      continue;
    }
    const bulleted = BULLET_RE.test(raw);
    const l = stripBullet(raw);
    if (!l || isHint(l)) continue;
    if (bulleted) st.cur = null;

    const sf = subField(l, kind);
    if (sf) {
      if (!sf.value) continue;
      let e: Entry = st.cur ?? start();
      if (sf.key === "name") {
        if (e.name) e = start();
        e.name = stripUrls(sf.value) || e.name;
        e.urls.push(...findUrls(sf.value));
      } else if (sf.key === "title") e.title = sf.value;
      else {
        const urls = findUrls(sf.value);
        if (urls.length) e.urls.push(...urls);
        else leftovers.push(l);
      }
      continue;
    }

    const urls = findUrls(l);
    const text = stripUrls(l);
    if (!text) {
      // A link on its own line belongs to the entry above it.
      (st.cur ?? start()).urls.push(...urls);
      continue;
    }
    const parts = splitParts(text);
    const c = st.cur;
    if (c && c.name && !c.title && kind === "people" && parts.length === 1 && TITLE_WORDS.test(text)) {
      // "Jo Bloggs" then "Managing Director" on the next line.
      c.title = text;
      c.urls.push(...urls);
      continue;
    }
    if (c && !c.name && !c.title && c.urls.length) {
      // The link came first ("voltleeds.co.uk" then "Volt Leeds"): this text names it.
      Object.assign(c, entryFromParts(parts, kind));
      c.urls.push(...urls);
      continue;
    }
    const e = start();
    Object.assign(e, entryFromParts(parts, kind));
    e.urls.push(...urls);
  }
  return entries;
}

function entryFromParts(parts: string[], kind: EntryKind): { name: string; title: string } {
  return kind === "people" ? { name: parts[0] ?? "", title: parts.slice(1).join(", ") } : { name: parts.join(" "), title: "" };
}

function toPeople(entries: Entry[], leftovers: string[]): PastedPerson[] {
  const out: PastedPerson[] = [];
  for (const e of entries) {
    if (!e.name) {
      if (e.urls.length) leftovers.push(e.urls.join(", "));
      continue;
    }
    const urls = [...new Set(e.urls)];
    const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? "";
    out.push({ fullName: e.name, jobTitle: e.title, linkedinUrl: linkedin, otherUrls: urls.filter((u) => u !== linkedin).join(", ") });
  }
  return out;
}

function toCompetitors(entries: Entry[]): PastedCompetitor[] {
  return entries
    .filter((e) => e.name || e.urls.length)
    .map((e) => {
      const url = e.urls[0] ?? "";
      const fallbackName = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/:]/)[0];
      return { name: e.name || fallbackName, url };
    });
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
  let lastBlank = true;
  let lastWasSub = false;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/ /g, " ");
    const blank = !line.trim();
    // Inside People/Competitors, "Website:" or "Company:" directly under an entry belongs to that entry.
    const section: PastedField | null = current;
    const inEntries: boolean = section === "people" || section === "competitors";
    const sub: ReturnType<typeof subField> = inEntries && !lastBlank ? subField(stripBullet(line), section as EntryKind) : null;
    // A shared label ("Website:") belongs to the competitor above it when the business's own website is
    // already known, or when the entry is being written as labelled lines ("Name: …" then "Website: …").
    const ownsShared: boolean = !!sub && SHARED_SUB.has(sub.label) && ((sections.get("url") ?? []).some((x) => x.trim()) || lastWasSub);
    const h: ReturnType<typeof matchHeading> = ownsShared ? null : matchHeading(line);
    lastBlank = blank;
    lastWasSub = !!sub && !h;
    if (h) {
      const arr = sections.get(h.field) ?? [];
      // A repeated heading ("Person 1:", "Person 2:") starts a new entry.
      if (arr.length) arr.push("");
      let rest = h.rest;
      if (rest && h.role && h.field === "people" && splitParts(stripUrls(rest)).length === 1) {
        rest = [stripUrls(rest), h.role, ...findUrls(rest)].join(", ");
      }
      if (rest) arr.push(rest);
      sections.set(h.field, arr);
      current = h.field;
      continue;
    }
    if (blank) {
      if (current) sections.get(current)!.push("");
      continue;
    }
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

  const competitors = toCompetitors(groupEntries(get("competitors"), "competitors", unrecognised));
  if (competitors.length) d.competitors = competitors;
  const people = toPeople(groupEntries(get("people"), "people", unrecognised), unrecognised);
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
