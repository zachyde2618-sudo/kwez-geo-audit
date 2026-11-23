import { KIND_LABEL, MAX_PEOPLE_SEARCHED, type FoundResult, type GatheredExternal, type SourceKind } from "@/lib/external/gather";
import type { Evidence } from "@/lib/schemas/check";
import { MAX_SNIPPET_CHARS } from "@/lib/schemas/check";
import { ev } from "./helpers";
import { judgementResult } from "./llm";
import type { CheckContext, CheckImpl, RawCheckResult } from "./types";
import { unable } from "./types";

/**
 * External checks (category 9 and 6.2), scored from web search results gathered and classified
 * in the pipeline's external stage (src/lib/external/gather.ts). 9.5, 9.7 and 9.9 add an AI
 * judgement on the source text (src/lib/llm/external.ts).
 */

const clip = (s: string) => (s.length > MAX_SNIPPET_CHARS ? `${s.slice(0, MAX_SNIPPET_CHARS - 1)}…` : s);
const hosts = (rs: FoundResult[]) => [...new Set(rs.map((r) => r.host))];
const list = (xs: string[], n = 4) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} and ${xs.length - n} more`);

/** The gathered search data, or an Unable to Verify result explaining why there is none. */
function needSearch(ctx: CheckContext): GatheredExternal | RawCheckResult {
  const ext = ctx.data.external;
  if (ext?.gathered) return ext.gathered as GatheredExternal;
  if (ext?.searchError) return unable(`Not checked: the web search failed (${ext.searchError}).`, "Check SEARCH_API_KEY and SEARCH_API_PROVIDER, then re-run the audit.");
  return unable("Not checked: the web search did not run.");
}
const isResult = (x: unknown): x is RawCheckResult => !!x && typeof x === "object" && "status" in x;

/** Results about this business, excluding social media. */
const relevant = (g: GatheredExternal) => g.results.filter((r) => r.about === "yes" && r.kind !== "social");
const ofKind = (rs: FoundResult[], kinds: SourceKind[]) => rs.filter((r) => kinds.includes(r.kind));

function resultEvidence(r: FoundResult): Evidence {
  const rating = r.rating ? ` (rated ${r.rating}${r.ratingCount ? ` from ${r.ratingCount} reviews` : ""})` : "";
  return {
    kind: "api",
    label: `${KIND_LABEL[r.kind]} · ${r.host}`,
    value: clip(`${r.title}${rating} — ${r.snippet}`),
    url: r.url,
    verification: "verified_externally",
  };
}

function scope(g: GatheredExternal, extra = ""): Evidence {
  const rel = relevant(g);
  const label = g.provider === "serper" ? "Google via Serper" : "Brave Search";
  return ev.measure(
    "Web search",
    `${g.searches.length} searches (${label}): ${rel.length} result(s) about ${g.businessName} on ${hosts(rel).length} site(s)${g.classifiedBy === "rules" ? "; matched by name, not AI" : ""}${extra}`,
  );
}

const top = (rs: FoundResult[], n = 5) => rs.slice(0, n).map(resultEvidence);

type Scorer = (g: GatheredExternal, ctx: CheckContext) => RawCheckResult;
const searched = (score: Scorer): CheckImpl => (ctx) => {
  const g = needSearch(ctx);
  return isResult(g) ? g : score(g, ctx);
};

/** For 9.5, 9.7, 9.9: an AI judgement on third-party text. */
const judged = (id: string, what: string): CheckImpl => (ctx) => {
  const g = needSearch(ctx);
  if (isResult(g)) return g;
  if (!ctx.data.external?.judgements?.[id]) return unable(`Not checked: the AI review of ${what} did not run.`);
  const r = judgementResult(ctx, id);
  return { ...r, evidence: [scope(g), ...(r.evidence ?? [])] };
};

const STRONG: SourceKind[] = ["news", "industry_publication", "professional_body", "award_or_accreditation"];

export const cat9: Record<string, CheckImpl> = {
  // 6.2 lives here because it is scored from the same search data.
  "6.2": searched((g, ctx) => {
    const people = ctx.input.people.map((p) => p.fullName.trim()).filter(Boolean).slice(0, MAX_PEOPLE_SEARCHED);
    if (!people.length) return unable("Not checked: no people were supplied. Add founders or key staff on the form to check their profiles.");
    if (g.classifiedBy !== "ai") return unable("Not checked: telling a person's publications and titles apart needs the AI review (ANTHROPIC_API_KEY).", "", { evidence: [scope(g)] });
    const found = new Map(people.map((p) => [p, g.results.filter((r) => r.kind !== "social" && r.peopleCredentials.includes(p))]));
    const withCreds = people.filter((p) => found.get(p)!.length);
    const evidence = [scope(g), ...people.flatMap((p) => top(found.get(p)!, 2))];
    if (withCreds.length) return { status: "pass", evidence, notes: withCreds.length < people.length ? [`Nothing found yet for ${list(people.filter((p) => !withCreds.includes(p)))}.`] : [] };
    return {
      status: "fail",
      evidence,
      issue: `No articles, talks, interviews, professional titles or registrations were found for ${list(people)} on other sites.`,
    };
  }),

  "9.1": searched((g) => {
    const rel = relevant(g);
    const strong = ofKind(rel, STRONG);
    const sites = hosts(rel);
    const evidence = [scope(g), ...top([...strong, ...rel.filter((r) => !strong.includes(r))])];
    if (strong.length || sites.length >= 3) return { status: "pass", evidence };
    return {
      status: "fail",
      evidence,
      issue: sites.length
        ? `Only ${sites.length} independent site${sites.length === 1 ? "" : "s"} (${list(sites)}) mention ${g.businessName}, and none is a news site, trade publication or official body.`
        : `No independent sites mentioning ${g.businessName} were found in ${g.searches.length} web searches.`,
    };
  }),

  "9.2": searched((g) => {
    const rel = relevant(g);
    const hits = ofKind(rel, ["news", "industry_publication", "directory", "professional_body"]);
    const evidence = [scope(g), ...top(hits)];
    if (hits.length) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `${g.businessName} wasn't found in news, industry publications or professional directories.` };
  }),

  "9.3": searched((g) => {
    const linking = relevant(g).filter((r) => r.mentionsDomain);
    const sites = hosts(linking);
    const strong = linking.filter((r) => STRONG.includes(r.kind) || /\.(gov\.uk|nhs\.uk|ac\.uk|org\.uk|org)$/.test(r.host));
    const evidence = [scope(g), ...top([...strong, ...linking.filter((r) => !strong.includes(r))])];
    const notes = [`This is an estimate from pages that show your web address (${g.domain}). A full backlink count needs an SEO tool such as Ahrefs or Semrush.`];
    if (strong.length && sites.length >= 3) return { status: "pass", evidence, notes };
    if (sites.length)
      return {
        status: "partial",
        evidence,
        notes,
        issue: `Only ${sites.length} other site${sites.length === 1 ? "" : "s"} (${list(sites)}) show your web address${strong.length ? "" : ", and none is a news, trade or official site"}.`,
      };
    return { status: "fail", evidence, notes, issue: `No other sites showing ${g.domain} were found.` };
  }),

  "9.4": searched((g, ctx) => {
    const rankingSearch = g.searches.find((s) => s.purpose === "ranking");
    if (!rankingSearch) return unable("Not checked: add the business's industry (and town) on the form so we can search for \"best … in …\" rankings.");
    const ranked = ofKind(relevant(g), ["ranking_or_comparison"]);
    const lists = g.results.filter((r) => r.purposes.includes("ranking") && r.kind === "ranking_or_comparison" && r.about !== "yes");
    const evidence = [scope(g, `; ranking search: "${rankingSearch.query}"`), ...top(ranked), ...top(lists, 3)];
    if (ranked.length) return { status: "pass", evidence };
    return {
      status: "fail",
      evidence,
      issue: `${g.businessName} wasn't found in "best ${ctx.input.industry}${ctx.input.town ? ` in ${ctx.input.town}` : ""}" lists or comparisons${lists.length ? `; ${lists.length} such list${lists.length === 1 ? "" : "s"} appeared without it` : ""}.`,
    };
  }),

  "9.5": judged("9.5", "third-party descriptions of the business"),

  "9.6": searched((g, ctx) => {
    const reviews = ofKind(relevant(g), ["review_platform"]);
    const supplied = ctx.input.identity.reviewUrls;
    const evidence = [scope(g), ...top(reviews), ...supplied.map((u) => ({ ...ev.url("Review profile you supplied", u), verification: "not_independently_checked" as const }))];
    if (reviews.length) return { status: "pass", evidence };
    if (supplied.length) return { status: "pass", evidence, notes: ["Based on the review profiles you supplied; they didn't appear in web search results."] };
    return { status: "fail", evidence, issue: `No reviews of ${g.businessName} on independent platforms (Google, Trustpilot and so on) were found.` };
  }),

  "9.7": judged("9.7", "reviews from independent platforms"),

  "9.8": searched((g) => {
    const refs = ofKind(relevant(g), ["testimonial_or_case_study"]);
    const evidence = [scope(g), ...top(refs)];
    if (refs.length) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `No testimonials, case studies or references to ${g.businessName}'s work were found on other sites.` };
  }),

  "9.9": judged("9.9", "third-party sources that could confirm your claims"),

  "9.15": searched((g, ctx) => {
    const people = ctx.input.people.map((p) => p.fullName.trim()).filter(Boolean);
    if (!people.length) return unable("Not checked: no people were supplied. Add founders or key staff on the form to check how other sites connect them to the business.");
    const checked = people.slice(0, MAX_PEOPLE_SEARCHED);
    const found = new Map(checked.map((p) => [p, g.results.filter((r) => r.about === "yes" && r.peopleLinked.includes(p))]));
    const missing = checked.filter((p) => !found.get(p)!.length);
    const evidence = [scope(g), ...checked.flatMap((p) => top(found.get(p)!, 2))];
    const notes = people.length > checked.length ? [`Only the first ${MAX_PEOPLE_SEARCHED} people were searched.`] : [];
    if (!missing.length) return { status: "pass", evidence, notes };
    return { status: "fail", evidence, notes, issue: `No third-party pages were found connecting ${list(missing)} with ${g.businessName}.` };
  }),

  "9.16": searched((g) => {
    const rec = ofKind(relevant(g), STRONG);
    const evidence = [scope(g), ...top(rec)];
    if (rec.length) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `No awards, accreditations, press coverage or professional bodies mentioning ${g.businessName} were found.` };
  }),
};
