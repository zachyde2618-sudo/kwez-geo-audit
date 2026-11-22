import { wordCount } from "@/lib/crawler/extract";
import type { PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import { allJsonLdNodes, asArray, ev, isOrgType, isResult, listSome, needCrawl, norm, okPages, relPath, sameUrl, stringsIn } from "./helpers";
import { judgementResult, llmCheck, withAiPart } from "./llm";
import type { CheckImpl } from "./types";
import { unable } from "./types";

const NAME_HEADING = /^[A-Z][a-zà-ÿ'’-]+(?: [A-Z][a-zà-ÿ'’.-]+){1,3}$/;
const NOT_NAME = /\b(our|about|team|services?|contact|why|how|what|the|meet|us|we|story|mission|values|people|home|faq|news|blog|reviews?|work|pricing|get|in|touch|book|call|free|quote|areas?|covered|case|studies)\b/i;

interface Bio {
  name: string;
  page: PageData;
  text: string;
  words: number;
}

/** Find bios: sections headed by a person's name with substantial text. */
export function findBios(pages: PageData[], names: string[]): Bio[] {
  const bios: Bio[] = [];
  const wanted = names.map(norm);
  for (const p of pages) {
    for (const s of p.sections) {
      const h = norm(s.heading);
      const matchesWanted = wanted.find((n) => n && h.includes(n));
      const looksLikeName = !wanted.length && NAME_HEADING.test(s.heading.trim()) && !NOT_NAME.test(s.heading);
      if (!matchesWanted && !looksLikeName) continue;
      const words = wordCount(s.text);
      if (words >= 30) bios.push({ name: s.heading, page: p, text: s.text, words });
    }
  }
  return bios;
}

function personNodes(ctx: Parameters<CheckImpl>[0]) {
  const c = ctx.data.crawl!;
  return allJsonLdNodes(c).filter(({ types, page }) => types.includes("Person") && page.status < 400);
}

/** People we know about: from the form, else from Person schema. */
function knownPeople(ctx: Parameters<CheckImpl>[0]): { name: string; title?: string; linkedin?: string }[] {
  if (ctx.input.people.length) return ctx.input.people.map((p) => ({ name: p.fullName, title: p.jobTitle || undefined, linkedin: p.linkedinUrl }));
  const seen = new Set<string>();
  return personNodes(ctx)
    .map(({ node }) => ({ name: typeof node.name === "string" ? node.name : "", title: typeof node.jobTitle === "string" ? node.jobTitle : undefined }))
    .filter((p) => p.name && !seen.has(norm(p.name)) && seen.add(norm(p.name)))
    .slice(0, 5);
}

const c61: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const about = pages.find((p) => p.role === "about") ?? pages.find((p) => p.role === "team");
  const nodes = allJsonLdNodes(c);
  const org = nodes.find(({ types, node }) => types.some(isOrgType) && typeof node.name === "string");
  const persons = nodes.filter(({ types }) => types.includes("Person"));
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  if (about) evidence.push(ev.url("About page", about.finalUrl));
  else {
    problems.push("there's no About page");
    evidence.push(ev.measure("About page", `not found among ${pages.length} crawled pages`));
  }
  if (org) evidence.push(ev.measure(`${org.types[0]} schema`, `name "${org.node.name}" on ${relPath(org.page.finalUrl)}`, org.page.finalUrl));
  else {
    problems.push("no Organization/LocalBusiness schema names the company");
    evidence.push(ev.measure("Organization schema", "none found"));
  }
  const expectPeople = ctx.input.people.length > 0 || pages.some((p) => p.role === "team");
  if (persons.length) evidence.push(ev.measure("Person schema", listSome([...new Set(persons.map(({ node }) => String(node.name ?? "unnamed")))])));
  else if (expectPeople) {
    problems.push("your founders/team aren't marked up as Person entities");
    evidence.push(ev.measure("Person schema", "none found"));
  }
  const notes = [
    ctx.input.identity.companiesHouseNumber
      ? "Companies House record matching is added in build phase 5 (needs COMPANIES_HOUSE_API_KEY)."
      : "Add a Companies House number on the form to also check your official record matches.",
    "Wikipedia/Wikidata presence is checked in build phase 5 (informational).",
  ];
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `AI can't clearly identify your business and people: ${problems.join("; ")}.`,
      requiredChange: "Publish an About page that states your legal name, location, founding year and founders, and add Organization and Person schema markup describing them.",
      pages: about ? [about.finalUrl] : [],
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const c64: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const names = ctx.input.people.map((p) => p.fullName);
  const candidates = names.length ? pages : pages.filter((p) => ["about", "team"].includes(p.role));
  const bios = findBios(candidates, names);
  const schemaBios = personNodes(ctx).filter(({ node }) => typeof node.description === "string" && wordCount(node.description as string) >= 30);
  const evidence: Evidence[] = bios.slice(0, 5).map((b) => ev.snippet(`Bio for ${b.name} (${b.words} words) on ${relPath(b.page.finalUrl)}`, b.text.slice(0, 280), b.page.finalUrl));
  for (const s of schemaBios.slice(0, 3)) evidence.push(ev.snippet(`Person schema description for ${String(s.node.name)}`, String(s.node.description).slice(0, 280), s.page.finalUrl));
  const team = pages.find((p) => ["team", "about"].includes(p.role));

  if (names.length) {
    const without = names.filter((n) => !bios.some((b) => norm(b.name).includes(norm(n))) && !schemaBios.some((s) => norm(String(s.node.name)) === norm(n)));
    if (without.length) {
      evidence.push(ev.measure("People without an on-site bio", listSome(without)));
      return {
        status: "fail",
        evidence,
        issue: `${listSome(without)} ${without.length > 1 ? "don't have" : "doesn't have"} a detailed profile on your site.`,
        requiredChange: "Give each key person their own section on your About or Team page: name as a heading, then role, experience, qualifications and results (at least 60–100 words).",
        pages: team ? [team.finalUrl] : [],
      };
    }
    return { status: "pass", evidence };
  }
  if (bios.length || schemaBios.length) return { status: "pass", evidence };
  return {
    status: "fail",
    evidence: [ev.measure("Team bios", `No named profiles of 30+ words found on ${candidates.length} About/Team page(s)${candidates.length ? `: ${listSome(candidates.map((p) => relPath(p.finalUrl)))}` : ""}`)],
    issue: "Your site doesn't introduce the people behind the business.",
    requiredChange: "Add a Team or About page with a short profile for each founder or key person: name, role, experience and achievements.",
  };
};

const linkedinSlugTokens = (url: string) =>
  (/linkedin\.com\/(?:in|pub)\/([^/?#]+)/i.exec(url)?.[1] ?? "")
    .toLowerCase()
    .split(/[-_]/)
    .filter((t) => /^[a-z]{2,}$/.test(t));

const c66: CheckImpl = (ctx) => {
  if (!ctx.input.people.length) return unable("Not checked: no people were supplied. Add founders or key staff on the form to check their identities.");
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const persons = personNodes(ctx);
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  for (const person of ctx.input.people) {
    const n = norm(person.fullName);
    const page = pages.find((p) => norm(p.visibleText).includes(n));
    if (!page) {
      problems.push(`${person.fullName} isn't named anywhere on the crawled pages`);
      evidence.push(ev.measure(`"${person.fullName}" on site`, `not found on ${pages.length} pages`));
      continue;
    }
    evidence.push(ev.measure(`"${person.fullName}" on site`, `named on ${relPath(page.finalUrl)}`, page.finalUrl));
    if (person.jobTitle) {
      const text = norm(page.visibleText);
      const i = text.indexOf(n);
      const window = text.slice(Math.max(0, i - 200), i + n.length + 300);
      if (!window.includes(norm(person.jobTitle))) {
        problems.push(`${person.fullName}'s title "${person.jobTitle}" isn't shown next to their name`);
        evidence.push(ev.snippet(`Text around "${person.fullName}"`, window.slice(0, 280), page.finalUrl));
      }
    }
    const node = persons.find(({ node }) => typeof node.name === "string" && norm(node.name) === n);
    if (node && person.jobTitle && typeof node.node.jobTitle === "string" && norm(node.node.jobTitle) !== norm(person.jobTitle)) {
      problems.push(`schema says ${person.fullName} is "${node.node.jobTitle}", not "${person.jobTitle}"`);
      evidence.push(ev.measure(`Person schema jobTitle for ${person.fullName}`, String(node.node.jobTitle), node.page.finalUrl));
    }
    if (person.linkedinUrl) {
      const tokens = linkedinSlugTokens(person.linkedinUrl);
      const nameTokens = n.split(" ");
      const matches = tokens.filter((t) => nameTokens.includes(t)).length;
      evidence.push(ev.url(`LinkedIn URL for ${person.fullName}`, person.linkedinUrl));
      if (tokens.length && matches === 0) problems.push(`${person.fullName}'s LinkedIn address doesn't contain their name`);
    }
  }
  const notes = ["Comparison with names and titles in third-party search results is added in build phase 5. LinkedIn itself is never scraped."];
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Names or titles aren't consistent: ${listSome(problems, 3)}.`,
      requiredChange: "Use exactly the same full name and job title for each person on your site, in schema markup, on LinkedIn and on Companies House.",
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const c67: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const people = knownPeople(ctx);
  if (!people.length) return unable("Not checked: no people were supplied and none are described in your schema markup.");
  const nodes = allJsonLdNodes(c);
  const persons = personNodes(ctx);
  const orgs = nodes.filter(({ types }) => types.some(isOrgType));
  const allLinks = okPages(c).flatMap((p) => p.links.map((l) => ({ l, p })));
  const evidence: Evidence[] = [];
  const problems: string[] = [];
  for (const person of people) {
    const n = norm(person.name);
    const pn = persons.find(({ node }) => typeof node.name === "string" && norm(node.name) === n);
    const orgLinksPerson = orgs.some(({ node }) =>
      ["founder", "employee", "member", "founders", "employees"].some((k) => asArray<Record<string, unknown>>(node[k]).some((x) => typeof x?.name === "string" && norm(x.name) === n)),
    );
    const worksFor = pn && (pn.node.worksFor || pn.node.affiliation || pn.node.memberOf);
    const personSameAs = pn ? stringsIn(pn.node.sameAs) : [];
    const linkedinInSchema = personSameAs.some((s) => /linkedin\.com\/(in|pub)\//i.test(s));
    const siteLink = person.linkedin
      ? allLinks.find(({ l }) => sameUrl(l.href, person.linkedin!))
      : allLinks.find(({ l, p }) => /linkedin\.com\/(in|pub)\//i.test(l.href) && norm(p.visibleText).includes(n));
    evidence.push(
      ev.measure(
        person.name,
        [
          pn ? "Person schema: yes" : "Person schema: no",
          `linked to company in schema: ${worksFor || orgLinksPerson ? "yes" : "no"}`,
          `LinkedIn in schema sameAs: ${linkedinInSchema ? "yes" : "no"}`,
          `site links to their LinkedIn: ${siteLink ? `yes (${relPath(siteLink.p.finalUrl)})` : "no"}`,
        ].join("; "),
      ),
    );
    if (!worksFor && !orgLinksPerson) problems.push(`${person.name} isn't connected to the company in schema (worksFor/founder)`);
    if (!linkedinInSchema && !siteLink) problems.push(`nothing on the site points to ${person.name}'s LinkedIn`);
  }
  const notes = ["External pages naming each person together with the company are checked in build phase 5."];
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `AI can't reliably connect your people to your company: ${listSome(problems, 3)}.`,
      requiredChange: "In Person schema add worksFor (your Organization) and sameAs (their LinkedIn and other profiles), and link each bio to the person's LinkedIn profile.",
      notes,
    };
  }
  return { status: "pass", evidence, notes };
};

const CRED_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "Awards", re: /[^.]{0,80}\b(award[- ]winning|winner of|won the|shortlisted|finalist|awards?\b)[^.]{0,100}/i },
  { kind: "Accreditations", re: /[^.]{0,80}\b(accredited|certified|registered with|member of|chartered|NICEIC|Gas Safe|TrustMark|ISO ?\d{4,5}|FCA[- ]regulated|Which\?? Trusted Trader|Cyber Essentials|B Corp)[^.]{0,100}/i },
  { kind: "Press", re: /[^.]{0,60}\b(as (seen|featured) in|featured (in|on)|in the press|press coverage)[^.]{0,100}/i },
  { kind: "Testimonials", re: /[^.]{0,40}\b(testimonials?|what (our )?(clients|customers) say|reviews? from)[^.]{0,100}/i },
];

const c68: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const found = new Map<string, Evidence>();
  const cs = pages.find((p) => p.role === "case-study");
  if (cs) found.set("Case studies", ev.url("Case studies page", cs.finalUrl));
  const rv = pages.find((p) => p.role === "reviews");
  if (rv) found.set("Testimonials", ev.url("Reviews/testimonials page", rv.finalUrl));
  const rating = allJsonLdNodes(c).find(({ types }) => types.includes("AggregateRating") || types.includes("Review"));
  if (rating) found.set("Review markup", ev.measure(`${rating.types[0]} schema`, JSON.stringify(rating.node).slice(0, 200), rating.page.finalUrl));
  for (const p of pages) {
    for (const { kind, re } of CRED_PATTERNS) {
      if (found.has(kind)) continue;
      const m = re.exec(p.mainText);
      if (m) found.set(kind, ev.snippet(`${kind} on ${relPath(p.finalUrl)}`, m[0].trim(), p.finalUrl));
    }
    if (!found.has("Testimonials") && p.sections.some((s) => /testimonial|what (our )?(clients|customers) say|reviews/i.test(s.heading))) {
      const s = p.sections.find((s) => /testimonial|what (our )?(clients|customers) say|reviews/i.test(s.heading))!;
      found.set("Testimonials", ev.snippet(`Testimonials on ${relPath(p.finalUrl)}`, `${s.heading}: ${s.firstText}`.slice(0, 280), p.finalUrl));
    }
  }
  const evidence = [...found.values()];
  const kinds = [...found.keys()];
  if (kinds.length >= 2) return { status: "pass", evidence, notes: [`Found: ${kinds.join(", ")}.`] };
  return {
    status: "fail",
    evidence: evidence.length ? evidence : [ev.measure("Credibility evidence", `No case studies, testimonials, awards, accreditations or press found on ${pages.length} crawled pages`)],
    issue: kinds.length ? `Your site shows only one type of proof (${kinds[0]}).` : "Your site doesn't show proof of your track record.",
    requiredChange: "Add at least two kinds of proof: case studies with results, named client testimonials, accreditations and memberships, awards or press coverage, each linked to its source.",
  };
};

/** 6.3 is L+E: the AI checks whether claims are backed on the site; independent confirmation is check 9.9 (Phase 5). */
const c63: CheckImpl = (ctx) => {
  const r = judgementResult(ctx, "6.3");
  return { ...r, notes: [...(r.notes ?? []), "Checked against evidence on your own site. Whether third parties confirm your claims is check 9.9."] };
};

export const cat6: Record<string, CheckImpl> = { "6.1": c61, "6.3": c63, "6.4": c64, "6.5": llmCheck("6.5"), "6.6": c66, "6.7": c67, "6.8": withAiPart("6.8", c68) };
