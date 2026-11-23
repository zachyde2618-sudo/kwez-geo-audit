import { config } from "@/config";
import { KIND_LABEL, MAX_PEOPLE_SEARCHED, type FoundResult, type GatheredExternal, type SourceKind } from "@/lib/external/gather";
import type { Evidence } from "@/lib/schemas/check";
import { MAX_SNIPPET_CHARS } from "@/lib/schemas/check";
import { ev } from "./helpers";
import { judgementResult } from "./llm";
import type { CheckContext, CheckImpl, RawCheckResult } from "./types";
import { unable } from "./types";
import { businessIdentity } from "@/lib/external/gather";
import type { VisibilityData } from "@/lib/visibility/run";

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

const checks: Record<string, CheckImpl> = {
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

  "9.14": judged("9.14", "your business details on other sites"),

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

  // ── AI visibility (asking Claude customers' questions) ────────────────────
  "9.10": visible((v, ctx) => {
    const { name } = businessIdentity(ctx.input);
    const answered = v.answers.filter((a) => !a.error);
    const hits = answered.filter((a) => a.mentioned);
    const recommended = hits.filter((a) => a.recommended);
    const evidence = [
      ev.measure(`Questions asked (${v.label}, with web search)`, `${answered.length} ${v.promptSource === "supplied" ? "of your example questions" : "questions a new customer might ask"}: named in ${hits.length}, recommended in ${recommended.length}`),
      ...answered.slice(0, 12).map((a) => answerEvidence(a, name)),
    ];
    const notes = [`Tested with ${v.label} (${v.model}). ChatGPT, Gemini and Perplexity are added when their API keys are configured.`];
    if (answered.length && hits.length / answered.length >= config.visibility.passShare) return { status: "pass", evidence, notes };
    return { status: "fail", evidence, notes, issue: `${v.label} named ${name} in ${hits.length} of ${answered.length} answers to questions a new customer might ask.` };
  }),

  "9.11": visible((v, ctx) => {
    const { name, domain } = businessIdentity(ctx.input);
    const cited = citedHosts(v);
    if (!cited.length) return unable(`Not checked: ${v.label}'s answers didn't use any websites as sources.`);
    const yours = new Set([domain, ...listedOn(ctx)]);
    const citingYou = cited.filter(([h]) => [...yours].some((y) => h === y || h.endsWith(`.${y}`)));
    const evidence = [ev.measure(`Sites ${v.label} used as sources most`, cited.slice(0, 10).map(([h, n]) => `${h} (${n})`).join(", ")), ...citingYou.slice(0, 3).map(([h, n]) => ev.measure("Cited site that features you", `${h}, cited ${n} time${n === 1 ? "" : "s"}`))];
    if (citingYou.length) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `None of the ${cited.length} sites ${v.label} used as sources when answering customers' questions is your site or a site we found listing ${name}.` };
  }),

  "9.12": visible((v, ctx) => {
    const { name } = businessIdentity(ctx.input);
    const answered = v.answers.filter((a) => !a.error);
    const tally = new Map<string, { name: string; n: number }>();
    for (const a of answered)
      for (const o of new Set(a.others.map((x) => x.toLowerCase()))) {
        const t = tally.get(o) ?? { name: a.others.find((x) => x.toLowerCase() === o)!, n: 0 };
        t.n++;
        tally.set(o, t);
      }
    const named = [...tally.values()].sort((a, b) => b.n - a.n);
    if (!named.length) return unable(`Not checked: ${v.label}'s answers didn't name any businesses to compare with.`);
    const you = answered.filter((a) => a.mentioned).length;
    const ahead = named.filter((c) => c.n > you);
    const evidence = [ev.measure(`Named in ${v.label}'s answers (of ${answered.length})`, [`${name}: ${you}`, ...named.slice(0, 8).map((c) => `${c.name}: ${c.n}`)].join("; "))];
    if (!ahead.length) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `${list(ahead.map((c) => `${c.name} (${c.n})`), 3)} ${ahead.length === 1 ? "is" : "are"} named more often than ${name} (${you}) in ${v.label}'s answers.` };
  }),

  "9.13": visible((v, ctx) => {
    const { domain } = businessIdentity(ctx.input);
    if (!ctx.data.external?.gathered) return unable("Not checked: telling which cited sites already list you needs the web search (SEARCH_API_KEY).");
    const listed = listedOn(ctx);
    const third = citedHosts(v).filter(([h]) => h !== domain && !h.endsWith(`.${domain}`)).slice(0, 6);
    if (!third.length) return unable(`Not checked: ${v.label}'s answers didn't use any other websites as sources.`);
    const on = third.filter(([h]) => listed.some((l) => h === l || h.endsWith(`.${l}`) || l.endsWith(`.${h}`)));
    const missing = third.filter((t) => !on.includes(t));
    const evidence = [ev.measure(`Sites ${v.label} uses as sources most`, third.map(([h, n]) => `${h} (${n})${on.some(([x]) => x === h) ? " ✓ lists you" : ""}`).join(", "))];
    if (on.length >= Math.ceil(third.length / 2)) return { status: "pass", evidence };
    return { status: "fail", evidence, issue: `You weren't found on ${list(missing.map(([h]) => h), 4)}, among the sites ${v.label} uses most as sources when answering your customers' questions.` };
  }),
};

// ── Helpers for the AI visibility checks ────────────────────────────────────
function needVisibility(ctx: CheckContext): VisibilityData | RawCheckResult {
  if (!ctx.input.options.runVisibility) return unable("Not checked: the AI visibility tests were switched off for this audit. Turn them on in the form's options to see whether AI assistants recommend this business.");
  if (ctx.data.visibilityError) return unable(`Not checked: the AI visibility tests failed (${ctx.data.visibilityError}).`);
  if (!ctx.data.visibility) return unable("Not checked: the AI visibility tests did not run.");
  return ctx.data.visibility;
}
function visible(score: (v: VisibilityData, ctx: CheckContext) => RawCheckResult): CheckImpl {
  return (ctx) => {
    const v = needVisibility(ctx);
    return isResult(v) ? v : score(v, ctx);
  };
}

function answerEvidence(a: VisibilityData["answers"][number], name: string): Evidence {
  let excerpt: string;
  if (a.mentioned) {
    const i = a.text.toLowerCase().indexOf(name.toLowerCase());
    excerpt = i >= 0 ? `…${a.text.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, " ")}…` : a.text.slice(0, 200);
  } else excerpt = a.others.length ? `Named instead: ${list(a.others, 5)}` : "No businesses named.";
  return { kind: "api", label: `${a.mentioned ? (a.recommended ? "✓ Recommended" : "✓ Named") : "✗ Not named"}: "${a.prompt}"`, value: clip(excerpt), verification: "verified_externally" };
}

/** Hosts cited across all answers, most cited first. */
function citedHosts(v: VisibilityData): [string, number][] {
  const n = new Map<string, number>();
  for (const a of v.answers)
    for (const c of a.cited) {
      try {
        const h = new URL(c.url).hostname.replace(/^www\./, "");
        n.set(h, (n.get(h) ?? 0) + 1);
      } catch {
        // ignore bad URLs
      }
    }
  return [...n].sort((a, b) => b[1] - a[1]);
}

/** Sites the web search found listing or mentioning the business. */
function listedOn(ctx: CheckContext): string[] {
  const g = ctx.data.external?.gathered as GatheredExternal | undefined;
  return g ? hosts(relevant(g)) : [];
}

/** Plain-English fixes, shown in the to-do list when a check fails. */
const FIXES: Record<string, string> = {
  "6.2": "Get your founders and key people published and listed: write or contribute articles for trade publications, speak at industry events, and make sure professional registrations and titles appear on their profiles and your site.",
  "9.1": "Get mentioned on reputable sites: local and trade press, industry associations and well-known directories. Pitch stories, join associations that list members, and keep a press page that links to the coverage.",
  "9.2": "List the business in the main directories for your trade and area (and Companies House details where relevant), and pitch your news to local and trade publications.",
  "9.3": "Earn links from respected sites in your field: supplier and partner pages, trade associations, local organisations and press coverage that link to your site.",
  "9.4": "Get included in \"best of\" lists and comparisons: contact the authors of the lists that appear for your trade and area, and ask happy customers to nominate you for local awards.",
  "9.6": "Collect reviews on independent platforms (Google, Trustpilot and the review sites for your trade): ask every happy customer, and link to your profiles from your site and emails.",
  "9.8": "Ask clients to reference your work on their own sites (case studies, partner pages, testimonials with their name and company), and link to those pages from your site.",
  "9.10": "Make it easy for AI assistants to recommend you: be listed on the sites they cite (check 9.13), collect independent reviews, get included in \"best of\" lists, and say plainly on your site what you do, for whom and where.",
  "9.11": "Get your business onto the sites AI assistants cite for your market (see check 9.13), and make sure your own pages answer the questions customers ask.",
  "9.12": "Close the gap with the businesses AI names instead of you: find out where they're listed, reviewed and written about, and get the same coverage.",
  "9.13": "Get listed, reviewed or written about on the sites AI assistants cite most for your market. Start with the ones named in this check.",
  "9.15": "Make sure other sites connect your people to the business: company pages on LinkedIn and directories, author bylines, speaker bios and Companies House should all name them with the company.",
  "9.16": "Win and publicise recognition from others: awards, accreditations, trade body membership and press coverage, each with a page on the awarding site that names you.",
};

export const cat9: Record<string, CheckImpl> = Object.fromEntries(
  Object.entries(checks).map(([id, impl]) => [
    id,
    async (ctx) => {
      const r = await impl(ctx);
      return (r.status === "fail" || r.status === "partial") && !r.requiredChange && FIXES[id] ? { ...r, requiredChange: FIXES[id] } : r;
    },
  ]),
);
