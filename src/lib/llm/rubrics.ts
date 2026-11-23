import type { CheckStatus } from "@/lib/schemas/check";

/**
 * What the AI review judges. Each criterion maps to one check ID. The model returns a status
 * and verbatim quotes per criterion; code combines chunk verdicts and computes all scores.
 *
 * mode "worst": the criterion looks for problems, so the worst chunk decides
 *   (Fail/Partial must quote the problem).
 * mode "best": the criterion looks for something good existing anywhere on the site, so the
 *   best chunk decides (Pass/Partial must quote it).
 */
export interface Criterion {
  id: string;
  /** Short label used in prompts and progress messages. */
  label: string;
  /** Instructions to the model, including what Pass, Partial and Fail mean. */
  rubric: string;
  mode: "worst" | "best";
  /** What to report when every chunk says the criterion doesn't apply. */
  notApplicable: { status: CheckStatus; issue: string };
  /** Plain-English fix shown when the check fails (code-owned, not model-written). */
  fix: string;
}

export type GroupId = "answers" | "trust" | "data" | "faq";

export interface RubricGroup {
  id: GroupId;
  label: string;
  criteria: string[];
  /** Which pages to send. */
  pages: "all" | "faq";
  images?: boolean;
  footer?: boolean;
}

const C = (c: Criterion) => c;

export const CRITERIA: Record<string, Criterion> = Object.fromEntries(
  [
    // ── Answers & language ────────────────────────────────────────────────
    C({
      id: "1.2",
      label: "Plain statement of what, who for and where",
      rubric:
        "Do the pages state plainly, in short explicit sentences, what the business does, who it serves and where it operates (e.g. \"We are domestic electricians serving homeowners across Leeds\")? Pass: all three stated explicitly somewhere prominent (homepage or About). Partial: one or two of the three stated plainly, or only implied. Fail: none stated plainly. Quote the clearest statement(s).",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had no descriptive text about the business." },
      fix: "On your homepage and About page, add one plain sentence that says what you do, who it's for and where, e.g. \"We're NICEIC-registered electricians fixing and installing home electrics across Leeds and West Yorkshire.\"",
    }),
    C({
      id: "1.3",
      label: "Uses the words customers use",
      rubric:
        "Compare the vocabulary on the pages with the terms a customer of this business would type into an AI assistant or search engine (use the business context, services and example questions supplied). Pass: the main customer terms (service names, problems, place names) appear naturally in the text. Partial: some common terms are missing or replaced by in-house or jargon terms. Fail: the text mostly uses generic or internal language and misses the obvious customer terms. Quote text that shows the terms being used (for Pass/Partial); name missing terms in the finding.",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too little text to compare with customer vocabulary." },
      fix: "Use the exact words customers search for in headings and the first lines of key pages: service names, common problems and the towns you cover.",
    }),
    C({
      id: "3.1",
      label: "Direct answer first",
      rubric:
        "Under each heading on service, FAQ, about and article pages, does the first sentence give the direct answer or key fact, before background or sales preamble? Pass: almost all sections lead with the answer. Partial: some do, some open with preamble. Fail: most sections open with preamble, scene-setting or marketing copy. For Partial/Fail quote one or more opening sentences that are preamble.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: no sections with headings and answer text were found to assess." },
      fix: "Rewrite the first sentence under each heading so it answers the heading directly (who, what, how much, how long), then add detail afterwards.",
    }),
    C({
      id: "3.2",
      label: "No vague language",
      rubric:
        "Is the copy free of vague, unverifiable marketing language such as \"world-class solutions\", \"second to none\", \"we go above and beyond\", \"quality service at competitive prices\" that gives an AI nothing factual to repeat? Pass: claims are specific. Partial: a few vague phrases among mostly specific copy. Fail: vague phrases are common or carry key messages. For Partial/Fail quote the vague phrases.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too little copy to assess." },
      fix: "Replace each vague claim with a specific fact: a number, a named qualification, a price range, a turnaround time or a named result.",
    }),
    C({
      id: "3.3",
      label: "Precise names, numbers, places, prices and dates",
      rubric:
        "Does the copy use precise, consistently named facts a machine can extract: exact service names, numbers, prices or price ranges, place names, dates, durations, qualifications? Pass: key pages are rich in specific facts. Partial: some specifics but key facts (e.g. prices, areas, timescales) are missing or vague. Fail: almost no concrete facts. Quote the best examples of specific facts for Pass/Partial; for Fail quote vague text where a fact is missing.",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too little copy to assess." },
      fix: "Add the concrete facts customers ask about: prices or price ranges, areas covered, timescales, qualifications and dates, written the same way on every page.",
    }),
    C({
      id: "3.4",
      label: "Question-style headings",
      rubric:
        "Look at the headings outline. Are headings phrased as the questions customers ask, where that is natural (e.g. \"How much does a rewire cost?\" rather than \"Pricing\")? Pass: many content headings are natural questions. Partial: a few are. Fail: almost none are, and labels like \"Our services\" are used where a question would fit. For Pass/Partial quote question headings; for Fail quote label headings that should be questions.",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages have no content headings." },
      fix: "Rephrase content headings as the questions customers ask, e.g. \"How long does an EV charger installation take?\" instead of \"Installation\".",
    }),
    C({
      id: "3.5",
      label: "Question and answer side by side",
      rubric:
        "Where a page poses a question (as a heading or in bold), does the answer appear immediately after it, rather than further down, in a different tab, or on another page (\"see our pricing page\")? Pass: answers sit directly under their questions. Partial: most do but some answers are deferred or missing. Fail: questions are often left without an immediate answer. For Partial/Fail quote a question whose answer is missing or deferred; for Pass quote a question followed by its answer.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: no questions were found in the page text." },
      fix: "Put each answer directly under its question, in the same section, without sending readers to another page or tab.",
    }),
    C({
      id: "3.6",
      label: "Topical relevance",
      rubric:
        "Given the business context, do the pages cover the business's core services and the questions customers ask about them consistently and in depth (each core service explained, not just listed)? Pass: every core service has substantive explanatory content. Partial: some core services are only listed or mentioned once. Fail: the site barely explains its core topics, or content drifts off-topic. Quote text showing the depth (Pass) or the thin mention (Partial/Fail); name uncovered services in the finding.",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too little content." },
      fix: "Give each core service its own section or page explaining what it involves, typical cost, timescales and common questions.",
    }),
    C({
      id: "3.7",
      label: "Question → answer → detail",
      rubric:
        "Do explanatory sections follow the pattern: the question (heading), a short self-contained answer (one or two sentences), then supporting detail? Pass: this is the usual pattern. Partial: some sections follow it. Fail: answers are buried in long paragraphs or there is no short answer before the detail. Quote an example section opening for Partial/Fail.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: no explanatory sections with headings were found." },
      fix: "Structure each section as: the question as a heading, a one- or two-sentence answer, then detail, examples and links.",
    }),

    // ── Trust & accuracy ─────────────────────────────────────────────────
    C({
      id: "1.4",
      label: "Key facts available as plain text",
      rubric:
        "Are the key facts a customer needs (what services are offered, prices or how pricing works, areas covered, how to contact or book) written as plain text on the pages, rather than only in PDFs, images, downloads or phrases like \"call us for a price\" / \"download our price list\"? Use the IMAGES list: an image whose file name or alt text suggests it holds prices, a menu, a price list or opening hours counts as information held in an image. Pass: key facts are in plain text. Partial: some key facts are only in images/PDFs or withheld. Fail: most key facts are not in the text. Quote the text that defers or hides facts (Partial/Fail).",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too little text." },
      fix: "Write your key facts (services, prices or price ranges, areas covered, contact and booking details) into the page text, not only in PDFs, images or \"call us\" prompts.",
    }),
    C({
      id: "2.13",
      label: "Information in images repeated as text",
      rubric:
        "Use the IMAGES list (file names and alt text) and the page text. Do any images appear to carry important information (prices, awards, certificates, accreditation logos, opening hours, infographics, statistics) that is NOT also stated in the page text? Pass: no such images, or their information is repeated in the text. Fail: important information appears to exist only in an image. Quote the image line (file name/alt text) for Fail; for Pass quote the text that repeats an image's information if relevant. Answer not_applicable if there are no images.",
      mode: "worst",
      notApplicable: { status: "pass", issue: "" },
      fix: "Repeat anything important shown in images (prices, awards, accreditations, opening hours, figures) in the page text, and describe it in the alt text.",
    }),
    C({
      id: "6.3",
      label: "Claims backed by evidence",
      rubric:
        "Find claims of legitimacy, success or authority (e.g. \"award-winning\", \"accredited\", \"trusted by 500 clients\", \"Leeds' leading\", \"20 years' experience\", \"5-star rated\"). Is each backed on the page by verifiable detail: the award name and year, the accrediting body and registration number, named clients, a link to reviews, a date the business was founded? Pass: claims are backed. Partial: some are backed, some are bare. Fail: important claims are unsupported. Quote unsupported claims (Partial/Fail) or a well-backed claim (Pass). Answer not_applicable if the pages make no such claims.",
      mode: "worst",
      notApplicable: { status: "pass", issue: "" },
      fix: "Back every authority claim with checkable detail: name the award and year, give accreditation numbers with links to the register, name clients (with permission) and link to independent reviews.",
    }),
    C({
      id: "6.5",
      label: "Profiles with achievements and history",
      rubric:
        "Look only at personal profiles/bios of founders or staff. Do they include concrete professional history (previous roles, years of experience), qualifications or memberships, and specific achievements or results? Pass: profiles include all three kinds of detail. Partial: profiles are present but thin (e.g. a role and a hobby). Fail: profiles are one-line or generic. Quote from the profiles. Answer not_applicable if there are no personal profiles in these pages.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: no personal profiles were found on the reviewed pages (see check 6.4)." },
      fix: "Expand each profile with years of experience, previous roles, qualifications and memberships, and two or three specific achievements or results.",
    }),
    C({
      id: "6.8",
      label: "Specific, verifiable credibility evidence",
      rubric:
        "Is the credibility evidence on the site (case studies, testimonials, reviews, awards, accreditations, press) specific and verifiable: named or attributable clients, concrete results and dates, named awarding or accrediting bodies, links to sources? Pass: the evidence is specific. Partial: present but mostly generic (anonymous \"Great service! - J\" testimonials, logos with no names). Fail: little or no credibility evidence. Quote examples.",
      mode: "best",
      notApplicable: { status: "fail", issue: "The AI review found no case studies, testimonials, awards or accreditations on the reviewed pages." },
      fix: "Make proof specific: case studies with the client, the problem, what you did and the result; testimonials with a name and town; accreditations named with registration numbers and links.",
    }),
    C({
      id: "8.1",
      label: "Accurate and consistent facts",
      rubric:
        "Check the facts on these pages for errors and inconsistencies: contradictory phone numbers, addresses, prices, opening hours, years in business, team names or service areas between pages; facts that contradict the business context supplied; impossible or clearly outdated claims (judge against today's date). Pass: no inconsistencies found. Partial: minor inconsistencies or details that can't be verified. Fail: clear contradictions or errors in important facts. Quote each conflicting statement (both sides of a contradiction).",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: the reviewed pages had too few factual details to assess." },
      fix: "Correct the conflicting or inaccurate details so every page (and your schema markup and listings) gives the same facts.",
    }),
    C({
      id: "8.5",
      label: "Current statistics and modern language",
      rubric:
        "Judging against today's date, does the content use current statistics and modern language? Flag statistics more than 3 years old presented as current, references to past years as \"this year\", superseded rules or schemes (e.g. ended grants), discontinued products, and dated phrasing. Pass: nothing dated found. Partial: a few dated details. Fail: dated statistics or references in key content. Quote the dated text.",
      mode: "worst",
      notApplicable: { status: "pass", issue: "" },
      fix: "Update or remove out-of-date statistics, years and references, and date any figures you keep (\"in 2026, …\").",
    }),

    // ── Original research & data ─────────────────────────────────────────
    C({
      id: "7.1",
      label: "Original research",
      rubric:
        "Does the site publish original research or data that an AI assistant would find useful to cite: surveys, analysis of the business's own jobs or customers, price indexes, benchmarks, studies? Content that only repeats public figures does not count. Pass: at least one substantial piece of original research. Partial: small original data points (e.g. \"we fitted 300 chargers last year\") but no real research. Fail: none. Quote the research or data.",
      mode: "best",
      notApplicable: { status: "fail", issue: "The AI review found no original research or data on the reviewed pages." },
      fix: "Publish one piece of original research a year from your own work, e.g. average job costs, times or common faults across your jobs, with the method and sample size.",
    }),
    C({
      id: "7.2",
      label: "Specific statistics",
      rubric:
        "Do the pages include specific, relevant industry or company statistics (percentages, counts, averages, prices) with context explaining what they mean? Pass: several relevant statistics with context. Partial: a few, or numbers without context. Fail: no meaningful statistics. Quote the statistics.",
      mode: "best",
      notApplicable: { status: "fail", issue: "The AI review found no statistics or figures on the reviewed pages." },
      fix: "Add relevant statistics with context, e.g. \"Most three-bedroom rewires we did in 2026 took 5–7 days\", and explain what they mean for the customer.",
    }),
    C({
      id: "7.3",
      label: "Data dated and sourced",
      rubric:
        "For the statistics and data on these pages: does each figure have a date or period, a sample size or basis, and a source (the business's own records count as a source if stated)? Pass: figures are dated and sourced. Partial: some are. Fail: figures are undated and unsourced. Quote figures lacking a date/source (Partial/Fail) or a well-sourced figure (Pass). Answer not_applicable if there are no statistics.",
      mode: "worst",
      notApplicable: { status: "fail", issue: "No statistics or data were found to assess, so there's nothing AI can attribute to you." },
      fix: "Give every figure a date or period, the sample size and its source, e.g. \"(our 412 installations, Jan–Dec 2026)\".",
    }),
    C({
      id: "7.4",
      label: "Data unique to the company",
      rubric:
        "Is the data on these pages unique to this business (from its own jobs, customers, surveys or measurements), rather than figures copied from government, trade bodies or the press? Pass: at least some data is clearly the business's own. Partial: mostly third-party figures with a little of its own. Fail: all figures come from elsewhere. Quote the figures.",
      mode: "best",
      notApplicable: { status: "fail", issue: "No data was found on the reviewed pages, so there is nothing unique for AI to cite." },
      fix: "Publish figures only you have: from your own jobs, quotes, customer surveys or measurements.",
    }),
    C({
      id: "7.5",
      label: "Reason for AI to cite the site",
      rubric:
        "Does the site offer information an AI assistant could not easily find elsewhere and would want to cite: original data, detailed local pricing, expert step-by-step guidance, unique case results? Pass: clear examples exist. Partial: useful but generic content. Fail: nothing distinctive. Quote the most citable content.",
      mode: "best",
      notApplicable: { status: "fail", issue: "The AI review found nothing distinctive enough for AI assistants to cite." },
      fix: "Publish something only you can: real local price ranges, data from your jobs, or detailed expert guides answering specific customer questions.",
    }),

    // ── FAQ ──────────────────────────────────────────────────────────────
    C({
      id: "2.3",
      label: "FAQ uses customers' words",
      rubric:
        "Are the FAQ questions written in the words customers would use when asking an AI assistant (plain, conversational, including the service and place), rather than internal jargon? Use the business context and example questions. Pass: questions use natural customer wording. Partial: a mix. Fail: mostly jargon or generic. Quote FAQ questions.",
      mode: "best",
      notApplicable: { status: "fail", issue: "There's no FAQ, so there are no questions written the way customers ask them for AI assistants to match (see check 2.2)." },
      fix: "Rewrite FAQ questions in your customers' own words, including the service and the place, e.g. \"How much does it cost to rewire a house in Leeds?\"",
    }),
    C({
      id: "2.4",
      label: "Questions people actually ask AI",
      rubric:
        "Does the FAQ include the kind of full, conversational questions people actually ask AI assistants when choosing a provider (\"Who is the best … in [town]?\", \"How much does … cost?\", \"Is it worth …?\", \"How do I choose …?\"), rather than only housekeeping questions (\"How do I contact you?\", \"Where are you based?\")? Pass: several such questions. Partial: one or two. Fail: none. Quote the relevant questions; name missing question types in the finding.",
      mode: "best",
      notApplicable: { status: "fail", issue: "There's no FAQ, so none of the questions customers ask an AI (cost, timing, who's best, how to choose) are answered on the site (see check 2.2)." },
      fix: "Add the questions people ask AI when choosing a provider: cost, how long it takes, how to choose, whether it's worth it, and \"best X in [town]\".",
    }),
    C({
      id: "4.2",
      label: "FAQ reflects what customers value",
      rubric:
        "Do the FAQ questions address what buyers of this kind of business value: price, quality and qualifications, speed and availability, location/coverage, trust and guarantees? Pass: at least four of these themes are covered. Partial: two or three. Fail: one or none. Quote the questions that cover themes; name missing themes in the finding.",
      mode: "best",
      notApplicable: { status: "fail", issue: "There's no FAQ, so customers' concerns about price, quality, timing and trust aren't answered anywhere AI can quote (see check 2.2)." },
      fix: "Add FAQs on price, qualifications and quality, speed and availability, areas covered, and guarantees or insurance.",
    }),
    C({
      id: "4.3",
      label: "FAQ coverage of customer interests",
      rubric:
        "Compare the FAQ with the business's services and the example questions supplied. Is each core service and customer interest answered somewhere in the FAQ? Pass: all core services and interests are covered. Partial: some gaps. Fail: most are not covered. Quote covered questions; list the gaps in the finding.",
      mode: "best",
      notApplicable: { status: "fail", issue: "There's no FAQ, so common questions about your services have no answers on the site (see check 2.2)." },
      fix: "Add an FAQ answer for each core service and each customer theme that's missing (listed in the finding).",
    }),
    C({
      id: "4.4",
      label: "Self-contained answers",
      rubric:
        "Is each FAQ answer self-contained, so it still makes sense if quoted on its own (it repeats the subject rather than saying \"Yes, we do\" or \"See above\"), and gives a complete answer? Word counts are measured separately by code; judge self-containment and completeness only. Pass: answers stand alone. Partial: some rely on the question or other answers. Fail: most do. Quote answers that are not self-contained.",
      mode: "worst",
      notApplicable: { status: "fail", issue: "There's no FAQ, so there are no stand-alone answers for AI assistants to quote (see check 2.2)." },
      fix: "Make each FAQ answer stand on its own in 40–80 words: restate the subject, give the direct answer first, then one or two supporting facts.",
    }),

    // ── Third-party sources (data gathered in Phase 5; judged here) ───────
    C({
      id: "9.5",
      label: "Consistent external descriptions",
      rubric:
        "These are third-party pages that mention the business. Compare how they describe its name, services, specialisms and location with the business context supplied (the business's own description). Pass: descriptions are consistent. Partial: minor differences (old services, slightly different name). Fail: clear contradictions (wrong services, wrong location, a different or outdated business name). Quote the external descriptions. Answer not_applicable if no source describes the business.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: none of the third-party sources found describe the business." },
      fix: "Update your listings and profiles so every external description uses the same business name, services and location as your website.",
    }),
    C({
      id: "9.7",
      label: "Specific reviews",
      rubric:
        "These are customer reviews from independent platforms. Do they give specific detail an AI could repeat (the service received, the place, timescales, the result, a named staff member) rather than generic praise (\"Great service, would recommend\")? Pass: most reviews are specific. Partial: some are. Fail: almost all are generic. Quote examples. Answer not_applicable if the sources contain no actual review text (only star ratings, review counts or page furniture).",
      mode: "best",
      notApplicable: { status: "unable", issue: "Not checked: no review text was available to assess." },
      fix: "When you ask for reviews, prompt customers to mention the job, the town and the result, e.g. \"Could you mention what we did and how it went?\"",
    }),
    C({
      id: "9.9",
      label: "Claims confirmed by third parties",
      rubric:
        "The business context lists the key claims the website makes. These sources are third-party pages. Does any source independently confirm each key claim (e.g. the award appears on the awarding body's site, the accreditation on the register, the years in business in an official record)? Pass: the key claims are confirmed. Partial: some are. Fail: none are confirmed. Quote the confirming text. Answer not_applicable if the site makes no such claims.",
      mode: "best",
      notApplicable: { status: "pass", issue: "" },
      fix: "Make sure each claim on your site can be confirmed elsewhere: get listed on the awarding or accrediting body's register, and link to those pages from your site.",
    }),
    C({
      id: "9.14",
      label: "Consistent business details",
      rubric:
        "These are third-party listings and pages about the business. Compare the business name, address, phone number and website they show with the business's own details (in the business context). Ignore formatting differences (spacing, +44 vs 0, abbreviations like Rd/Road). Pass: every source that shows these details matches. Partial: minor differences (an old phone number or address on one listing, a slightly different name). Fail: clear conflicts (a different address or phone number on several listings, or a different business name). Quote the details from the listings. Answer not_applicable if no source shows an address or phone number, or if the website shows none to compare with.",
      mode: "worst",
      notApplicable: { status: "unable", issue: "Not checked: none of the listings found show an address or phone number to compare (online-only businesses often have none)." },
      fix: "Make your business name, address and phone number identical on your website, Google Business Profile and every directory and review listing.",
    }),
  ].map((c) => [c.id, c]),
);

/** Criteria judged on third-party sources rather than the crawled site. */
export const EXTERNAL_CRITERIA = ["9.5", "9.7", "9.9", "9.14"];

export const GROUPS: RubricGroup[] = [
  { id: "answers", label: "Answer structure and language", criteria: ["1.2", "1.3", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"], pages: "all" },
  { id: "trust", label: "Accuracy and credibility", criteria: ["1.4", "2.13", "6.3", "6.5", "6.8", "8.1", "8.5"], pages: "all", images: true, footer: true },
  { id: "data", label: "Original research and data", criteria: ["7.1", "7.2", "7.3", "7.4", "7.5"], pages: "all" },
  { id: "faq", label: "FAQ quality", criteria: ["2.3", "2.4", "4.2", "4.3", "4.4"], pages: "faq" },
];

export const SITE_CRITERIA = GROUPS.flatMap((g) => g.criteria);
