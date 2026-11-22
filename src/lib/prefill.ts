import { OUR_UA_TOKEN } from "@/lib/crawler/crawl";
import { classifyRole, extractPage, typesOf } from "@/lib/crawler/extract";
import { bodyText, politeFetch } from "@/lib/crawler/fetcher";
import { isAllowed, pathOf, robotsFromStatus } from "@/lib/crawler/robots";
import type { PageData } from "@/lib/crawler/types";
import { asArray, isOrgType, stringsIn } from "@/lib/checks/helpers";

export interface PrefillSuggestion {
  companyName?: string;
  industry?: string;
  town?: string;
  country?: string;
  socialUrls: string[];
  people: { fullName: string; jobTitle: string; linkedinUrl: string }[];
  /** Where each suggestion came from, so the user can judge it. */
  sources: string[];
}

const SOCIAL = /^https?:\/\/(www\.)?(facebook|instagram|twitter|x|youtube|tiktok|pinterest|threads)\.(com|net)\/|^https?:\/\/(www\.|uk\.)?linkedin\.com\/company\//i;
const COUNTRY: Record<string, string> = { GB: "United Kingdom", UK: "United Kingdom", IE: "Ireland", US: "United States" };

/** Read the homepage (and About/Team page if linked) and suggest form values. Only reports what's on the page. */
export async function prefillFromSite(url: string, signal: AbortSignal): Promise<PrefillSuggestion> {
  const origin = new URL(url).origin;
  const robotsRes = await politeFetch(`${origin}/robots.txt`, { signal, accept: "text/plain" });
  const robots = robotsFromStatus(robotsRes.status, robotsRes.status === 200 ? bodyText(robotsRes) : "");
  const out: PrefillSuggestion = { socialUrls: [], people: [], sources: [] };
  if (!isAllowed(robots, OUR_UA_TOKEN, pathOf(url)).allowed) {
    out.sources.push("robots.txt asks crawlers like ours not to read the homepage, so nothing was pre-filled.");
    return out;
  }

  const fetchPage = async (u: string): Promise<PageData | null> => {
    const r = await politeFetch(u, { signal });
    if (r.status !== 200 || !r.contentType.includes("html")) return null;
    return extractPage({ url: u, finalUrl: r.finalUrl, status: r.status, headers: r.headers, html: bodyText(r), htmlBytes: r.bytes, ttfbMs: r.ttfbMs, depth: 0, siteHosts: [new URL(r.finalUrl).hostname] });
  };

  const home = await fetchPage(url);
  if (!home) {
    out.sources.push("The homepage couldn't be read.");
    return out;
  }
  const pages = [home];
  const aboutLink = home.links.find((l) => l.internal && ["about", "team"].includes(classifyRole(l.href)));
  if (aboutLink && isAllowed(robots, OUR_UA_TOKEN, pathOf(aboutLink.href)).allowed) {
    const about = await fetchPage(aboutLink.href);
    if (about) pages.push(about);
  }

  const nodes = pages.flatMap((p) => p.jsonLd.flatMap((b) => b.nodes.map((n) => ({ n, p }))));
  const org = nodes.find(({ n }) => typesOf(n).some(isOrgType));
  if (org) {
    if (typeof org.n.name === "string") {
      out.companyName = org.n.name;
      out.sources.push(`Company name from ${typesOf(org.n)[0]} schema on ${org.p.finalUrl}`);
    }
    const t = typesOf(org.n)[0];
    if (t && !["Organization", "Corporation", "LocalBusiness"].includes(t)) {
      out.industry = t.replace(/([a-z])([A-Z])/g, "$1 $2");
      out.sources.push(`Industry from schema type "${t}"`);
    }
    const addr = asArray<Record<string, unknown>>(org.n.address)[0];
    if (addr && typeof addr.addressLocality === "string") {
      out.town = addr.addressLocality;
      out.sources.push("Town from schema address");
    }
    if (addr && typeof addr.addressCountry === "string") out.country = COUNTRY[addr.addressCountry.toUpperCase()] ?? addr.addressCountry;
    out.socialUrls.push(...stringsIn(org.n.sameAs).filter((s) => SOCIAL.test(s)));
  } else if (home.title) {
    const parts = home.title.split(/\s[|–—-]\s/);
    out.companyName = parts.length > 1 ? parts[0].trim() : undefined;
    if (out.companyName) out.sources.push(`Company name from the homepage title "${home.title}"`);
  }

  for (const l of home.links) if (l.inNavOrFooter && SOCIAL.test(l.href)) out.socialUrls.push(l.href);
  out.socialUrls = [...new Set(out.socialUrls)].slice(0, 10);
  if (out.socialUrls.length) out.sources.push(`${out.socialUrls.length} social profile link(s) from schema sameAs and the header/footer`);

  const byName = new Map<string, PrefillSuggestion["people"][number]>();
  for (const { n } of nodes) {
    if (!typesOf(n).includes("Person") || typeof n.name !== "string") continue;
    const key = n.name.toLowerCase().trim();
    const p = byName.get(key) ?? { fullName: n.name.trim(), jobTitle: "", linkedinUrl: "" };
    if (!p.jobTitle && typeof n.jobTitle === "string") p.jobTitle = n.jobTitle;
    if (!p.linkedinUrl) p.linkedinUrl = stringsIn(n.sameAs).find((s) => /linkedin\.com\/(in|pub)\//i.test(s)) ?? "";
    byName.set(key, p);
  }
  out.people = [...byName.values()];
  out.people = out.people.slice(0, 5);
  if (out.people.length) out.sources.push(`${out.people.length} person/people from Person schema`);
  return out;
}
