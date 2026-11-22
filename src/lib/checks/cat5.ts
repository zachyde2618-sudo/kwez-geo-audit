import { config } from "@/config";
import type { PageData } from "@/lib/crawler/types";
import type { Evidence } from "@/lib/schemas/check";
import { allJsonLdNodes, asArray, ev, isOrgType, isResult, listSome, needCrawl, norm, okPages, relPath, sameUrl, stringsIn } from "./helpers";
import type { CheckImpl } from "./types";

const COMMON = new Set([
  "WebSite", "WebPage", "Person", "FAQPage", "Product", "Service", "Offer", "BreadcrumbList", "Article", "BlogPosting", "NewsArticle",
  "Review", "AggregateRating", "PostalAddress", "ContactPoint", "VideoObject", "HowTo", "Event",
]);
const SOCIAL = /(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|bsky)\.(com|app)/i;

function typeSummary(pages: PageData[]) {
  const jsonLd = new Map<string, Set<string>>();
  const micro = new Set<string>();
  const rdfa = new Set<string>();
  for (const p of pages) {
    for (const b of p.jsonLd) for (const n of b.nodes) {
      const t = n["@type"];
      for (const x of asArray(t)) if (typeof x === "string") {
        const k = x.replace(/^https?:\/\/schema\.org\//, "");
        jsonLd.set(k, (jsonLd.get(k) ?? new Set()).add(relPath(p.finalUrl)));
      }
    }
    p.microdataTypes.forEach((t) => micro.add(t));
    p.rdfaTypes.forEach((t) => rdfa.add(t));
  }
  return { jsonLd, micro, rdfa, all: new Set([...jsonLd.keys(), ...micro, ...rdfa]) };
}

const c51: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const s = typeSummary(pages);
  const withAny = pages.filter((p) => p.jsonLd.some((b) => b.nodes.length) || p.microdataTypes.length || p.rdfaTypes.length);
  const evidence: Evidence[] = [ev.measure("Pages with schema markup", `${withAny.length} of ${pages.length}`)];
  if (s.jsonLd.size) evidence.push(ev.measure("JSON-LD types", listSome([...s.jsonLd.entries()].map(([t, ps]) => `${t} (${ps.size} page${ps.size > 1 ? "s" : ""})`), 8)));
  if (s.micro.size) evidence.push(ev.measure("Microdata types", listSome([...s.micro], 8)));
  if (s.rdfa.size) evidence.push(ev.measure("RDFa types", listSome([...s.rdfa], 8)));
  if (!s.all.size) {
    return {
      status: "fail",
      evidence,
      issue: "None of your pages has schema markup, so AI has to guess what your business is, where it is and what it offers.",
      requiredChange: "Add JSON-LD schema markup: at least Organization (or LocalBusiness) on every page, plus FAQPage on your FAQ and Person for your team.",
    };
  }
  return { status: "pass", evidence };
};

const c52: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const s = typeSummary(okPages(c));
  const types = [...s.all];
  const org = types.filter(isOrgType);
  const common = types.filter((t) => COMMON.has(t) || isOrgType(t));
  const evidence: Evidence[] = [ev.measure("Schema types found", types.length ? listSome(types, 10) : "none")];
  const missing: string[] = [];
  if (!org.length) missing.push("Organization or LocalBusiness");
  if (!types.includes("WebSite")) missing.push("WebSite");
  if (!types.includes("FAQPage")) missing.push("FAQPage");
  if (!types.includes("Person") && ctx.input.people.length) missing.push("Person");
  if (org.length && common.length >= 2) {
    return { status: "pass", evidence: [...evidence, ev.measure("Standard types in use", listSome(common, 8))], notes: missing.length ? [`Worth adding: ${missing.join(", ")}.`] : [] };
  }
  return {
    status: "fail",
    evidence,
    issue: org.length ? "Your markup uses only one standard type, which gives AI little structured information." : "Your markup doesn't identify your business with an Organization or LocalBusiness type.",
    requiredChange: `Add the standard schema types AI tools know best: ${missing.join(", ") || "WebSite, FAQPage, Service"}.`,
  };
};

const REQUIRED: { test: (t: string) => boolean; label: string; check: (n: Record<string, unknown>) => string[] }[] = [
  {
    test: (t) => isOrgType(t) && t !== "Organization" && t !== "Corporation",
    label: "LocalBusiness",
    check: (n) => [!n.name && "name", !n.address && "address"].filter(Boolean) as string[],
  },
  { test: (t) => t === "Organization" || t === "Corporation", label: "Organization", check: (n) => [!n.name && "name", !n.url && "url"].filter(Boolean) as string[] },
  { test: (t) => t === "Person", label: "Person", check: (n) => (!n.name ? ["name"] : []) },
  {
    test: (t) => t === "FAQPage",
    label: "FAQPage",
    check: (n) => {
      const qs = asArray<Record<string, unknown>>(n.mainEntity);
      if (!qs.length) return ["mainEntity (the questions)"];
      const bad = qs.filter((q) => !q?.name || !(q.acceptedAnswer as Record<string, unknown> | undefined)?.text);
      return bad.length ? [`name/acceptedAnswer.text on ${bad.length} question(s)`] : [];
    },
  },
  { test: (t) => ["Article", "BlogPosting", "NewsArticle"].includes(t), label: "Article", check: (n) => (!n.headline ? ["headline"] : []) },
  { test: (t) => t === "Product", label: "Product", check: (n) => (!n.name ? ["name"] : []) },
  { test: (t) => t === "Service", label: "Service", check: (n) => (!n.name && !n.serviceType ? ["name or serviceType"] : []) },
  { test: (t) => t === "BreadcrumbList", label: "BreadcrumbList", check: (n) => (!asArray(n.itemListElement).length ? ["itemListElement"] : []) },
  { test: (t) => t === "AggregateRating", label: "AggregateRating", check: (n) => [!n.ratingValue && "ratingValue", !n.reviewCount && !n.ratingCount && "reviewCount or ratingCount"].filter(Boolean) as string[] },
  { test: (t) => t === "Review", label: "Review", check: (n) => [!n.author && "author", !n.reviewRating && !n.reviewBody && "reviewRating or reviewBody"].filter(Boolean) as string[] },
];

const c53: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const blocks = pages.flatMap((p) => p.jsonLd.map((b) => ({ b, p })));
  const evidence: Evidence[] = [ev.measure("JSON-LD blocks", `${blocks.length} across ${pages.filter((p) => p.jsonLd.length).length} of ${pages.length} pages`)];
  if (!blocks.length) {
    return {
      status: "fail",
      evidence,
      issue: "There's no JSON-LD markup to check, so there are no machine-readable links between your site, your people and your profiles.",
      requiredChange: "Add JSON-LD Organization markup with name, url, logo, address and sameAs links to your LinkedIn, social profiles and Companies House page.",
    };
  }
  const problems: string[] = [];
  const affected = new Set<string>();

  for (const { b, p } of blocks.filter(({ b }) => b.error)) {
    problems.push(`a JSON-LD block on ${relPath(p.finalUrl)} doesn't parse`);
    evidence.push(ev.snippet(`Parse error on ${relPath(p.finalUrl)}: ${b.error}`, b.raw.slice(0, 200), p.finalUrl));
    affected.add(p.finalUrl);
  }

  const nodes = allJsonLdNodes(c).filter(({ page }) => page.status < 400);
  const seenMissing = new Set<string>();
  for (const { node, page, types } of nodes) {
    for (const t of types) {
      const rule = REQUIRED.find((r) => r.test(t));
      if (!rule) continue;
      const miss = rule.check(node);
      const key = `${t}:${miss.join(",")}`;
      if (miss.length && !seenMissing.has(key)) {
        seenMissing.add(key);
        problems.push(`${t} is missing ${miss.join(", ")}`);
        evidence.push(ev.measure(`${t} on ${relPath(page.finalUrl)} missing`, miss.join(", "), page.finalUrl));
        affected.add(page.finalUrl);
      }
      break;
    }
  }

  // sameAs on the organisation
  const orgNodes = nodes.filter(({ types }) => types.some(isOrgType));
  const orgSameAs = [...new Set(orgNodes.flatMap(({ node }) => stringsIn(node.sameAs)))];
  if (orgNodes.length) {
    evidence.push(ev.measure("Organisation sameAs links", orgSameAs.length ? listSome(orgSameAs, 6) : "none"));
    if (!orgSameAs.length) problems.push("your Organization markup has no sameAs links to your profiles");
    const expected = [...ctx.input.identity.socialUrls];
    if (ctx.input.identity.companiesHouseNumber) expected.push(`${config.companiesHouse.publicSite}/${ctx.input.identity.companiesHouseNumber}`);
    const absent = expected.filter((u) => !orgSameAs.some((s) => sameUrl(s, u) || (u.includes("company-information") && s.includes(ctx.input.identity.companiesHouseNumber ?? "~"))));
    if (absent.length) {
      problems.push(`sameAs doesn't include ${absent.length} of your profile(s)`);
      evidence.push(ev.measure("Profiles missing from sameAs", listSome(absent.map(relPathOrUrl), 4)));
    }
  } else {
    problems.push("there's no Organization or LocalBusiness node to carry sameAs links");
  }

  // People's LinkedIn on Person nodes
  for (const person of ctx.input.people.filter((x) => x.linkedinUrl)) {
    const pn = nodes.find(({ types, node }) => types.includes("Person") && typeof node.name === "string" && norm(node.name) === norm(person.fullName));
    if (pn && !stringsIn(pn.node.sameAs).some((s) => sameUrl(s, person.linkedinUrl!))) {
      problems.push(`${person.fullName}'s Person markup doesn't link to their LinkedIn`);
      evidence.push(ev.measure(`Person "${person.fullName}" sameAs`, stringsIn(pn.node.sameAs).join(", ") || "none", pn.page.finalUrl));
    }
  }

  // FAQPage questions must match visible text
  for (const { node, page, types } of nodes.filter(({ types }) => types.includes("FAQPage"))) {
    void types;
    const visible = norm(page.visibleText);
    const qs = asArray<Record<string, unknown>>(node.mainEntity).map((q) => (typeof q?.name === "string" ? q.name : "")).filter(Boolean);
    const hidden = qs.filter((q) => !visible.includes(norm(q)));
    evidence.push(ev.measure(`FAQPage on ${relPath(page.finalUrl)}`, `${qs.length} questions, ${qs.length - hidden.length} match visible text`, page.finalUrl));
    if (hidden.length) {
      problems.push(`${hidden.length} FAQPage question(s) on ${relPath(page.finalUrl)} don't appear on the page`);
      evidence.push(ev.snippet("FAQ schema question not visible on page", hidden[0], page.finalUrl));
      affected.add(page.finalUrl);
    }
  }

  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Your schema markup has problems: ${listSome(problems, 4)}.`,
      requiredChange: "Fix the JSON-LD so it parses, fill in the required properties listed, add sameAs links to your LinkedIn, social and Companies House pages, and make FAQPage questions match the visible FAQ wording exactly.",
      pages: [...affected],
    };
  }
  return { status: "pass", evidence };
};

function relPathOrUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "");
}

const c54: CheckImpl = (ctx) => {
  const c = needCrawl(ctx);
  if (isResult(c)) return c;
  const pages = okPages(c);
  const contentInternal = pages.map((p) => new Set(p.links.filter((l) => l.internal && !l.inNavOrFooter).map((l) => l.href)).size);
  const avgInternal = contentInternal.reduce((a, b) => a + b, 0) / Math.max(pages.length, 1);
  const external = pages.flatMap((p) => p.links.filter((l) => !l.internal && !SOCIAL.test(new URL(l.href).hostname)).map((l) => ({ l, p })));
  const authoritative = external.filter(({ l }) => /\.(gov|gov\.uk|ac\.uk|nhs\.uk|edu|org|org\.uk)$|wikipedia\.org$|bbc\.co\.uk$/i.test(new URL(l.href).hostname));
  const sameAs = c.pages.some((p) => p.jsonLd.some((b) => b.nodes.some((n) => stringsIn(n.sameAs).length)));
  const broken = c.pages.filter((p) => p.status >= 400);
  const evidence: Evidence[] = [
    ev.measure("In-content internal links", `${avgInternal.toFixed(1)} per page on average (excluding menus and footers)`),
    ev.measure("Outbound links to other sites", `${new Set(external.map(({ l }) => l.href)).size} (excluding social media), ${new Set(authoritative.map(({ l }) => new URL(l.href).hostname)).size} authoritative domains (.gov, .ac.uk, .org…)`),
    ev.measure("sameAs links in schema", sameAs ? "present" : "none"),
    ev.measure("Broken pages among those crawled", broken.length ? listSome(broken.map((p) => `${relPath(p.url)} (${p.status})`)) : `none of ${c.pages.length}`),
  ];
  if (authoritative[0]) evidence.push(ev.url("Example authoritative link", authoritative[0].l.href));
  const problems: string[] = [];
  if (broken.length) problems.push(`${broken.length} linked page(s) are broken`);
  if (avgInternal < 1) problems.push("pages rarely link to each other within their content");
  if (!external.length) problems.push("no links out to other relevant sites");
  if (!sameAs) problems.push("no sameAs links in your schema markup");
  if (problems.length) {
    return {
      status: "fail",
      evidence,
      issue: `Your linking could be stronger: ${problems.join("; ")}.`,
      requiredChange: "Fix broken links, link related pages to each other within the text (e.g. each service to its FAQ and case studies), cite credible sources for facts, and add sameAs links to your schema.",
      pages: broken.map((p) => p.url),
    };
  }
  return { status: "pass", evidence };
};

export const cat5: Record<string, CheckImpl> = { "5.1": c51, "5.2": c52, "5.3": c53, "5.4": c54 };
