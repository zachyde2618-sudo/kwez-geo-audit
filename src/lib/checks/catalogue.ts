import type { ApiKeyName } from "@/config";
import type { Effort, Impact, Method } from "@/lib/schemas/check";

export interface CategoryDef {
  id: number;
  slug: string;
  name: string;
  weight: number;
  blurb: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 1, slug: "crawlers", name: "AI and search crawler accessibility", weight: 15, blurb: "Can AI assistants and search engines reach and read your site?" },
  { id: 2, slug: "speed", name: "Website speed and processing efficiency", weight: 10, blurb: "Is your site fast and light enough for crawlers to process fully?" },
  { id: 3, slug: "content", name: "AI-friendly content structure and language", weight: 15, blurb: "Is your content written so AI can lift clear answers from it?" },
  { id: 4, slug: "faq", name: "AI-focused FAQ library", weight: 10, blurb: "Do your FAQs answer the questions people actually ask AI?" },
  { id: 5, slug: "schema", name: "Structured data and schema markup", weight: 10, blurb: "Does your site label itself in a format machines understand?" },
  { id: 6, slug: "authority", name: "Company and founder authority", weight: 10, blurb: "Are you and your team recognisable, credible entities?" },
  { id: 7, slug: "research", name: "Original research and unique data", weight: 5, blurb: "Do you publish anything AI would want to cite?" },
  { id: 8, slug: "maintenance", name: "Content accuracy, relevance and maintenance", weight: 5, blurb: "Is your content accurate and kept up to date?" },
  { id: 9, slug: "third-party", name: "Third-party authority, mentions and citations", weight: 20, blurb: "What does the rest of the internet, and AI itself, say about you?" },
];

export interface CheckMeta {
  id: string;
  categoryId: number;
  /** Check name from the Kwez checklist. */
  title: string;
  /** Plain-English to-do title for clients. */
  todoTitle: string;
  /** One sentence on why it matters. */
  why: string;
  /** Method code from the checklist, e.g. "A+L". */
  methodCode: string;
  /** Primary method reported when the check cannot run at all. */
  method: Method;
  weight: 1 | 2 | 3;
  effort: Effort;
  impact: Impact;
  fixTag: "diy" | "kwez";
  allowsPartial: boolean;
  /** Keys that must all be present for the check to run. */
  requires?: ApiKeyName[];
  /** At least one of these keys must be present. */
  requiresAny?: ApiKeyName[];
  /** Subgroup heading (category 9). */
  group?: string;
}

const methodOf = (code: string): Method =>
  ({ A: "automated", L: "llm", E: "external", M: "manual" } as const)[code[0] as "A" | "L" | "E" | "M"];

const impactOf = (w: 1 | 2 | 3): Impact => (w === 3 ? "High" : w === 2 ? "Medium" : "Low");

type Opts = Partial<Pick<CheckMeta, "impact" | "allowsPartial" | "requires" | "requiresAny" | "group">>;

function c(
  id: string,
  title: string,
  todoTitle: string,
  why: string,
  methodCode: string,
  weight: 1 | 2 | 3,
  effort: Effort,
  fixTag: "diy" | "kwez",
  opts: Opts = {},
): CheckMeta {
  return {
    id,
    categoryId: Number(id.split(".")[0]),
    title,
    todoTitle,
    why,
    methodCode,
    method: methodOf(methodCode),
    weight,
    effort,
    impact: opts.impact ?? impactOf(weight),
    fixTag,
    allowsPartial: opts.allowsPartial ?? false,
    requires: opts.requires,
    requiresAny: opts.requiresAny,
    group: opts.group,
  };
}

const LLM: Opts = { requires: ["ANTHROPIC_API_KEY"] };
const SEARCH: Opts = { requires: ["SEARCH_API_KEY"] };
const AI_KEYS: ApiKeyName[] = ["OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "ANTHROPIC_API_KEY"];
const G_BRAND = "External brand visibility";
const G_REVIEWS = "Independent reviews and credibility";
const G_AI = "AI citations and recommendations";
const G_ENTITY = "External entity consistency";

export const CHECKS: CheckMeta[] = [
  // ── Category 1 ────────────────────────────────────────────────────────────
  c("1.1", "Accessible to Googlebot", "Make sure Google can reach your key pages",
    "Google's index feeds AI Overviews and Gemini, so pages Google can't fetch are invisible to them.", "A", 3, "Quick win", "kwez"),
  c("1.2", "Information structured in AI-friendly language for quick retrieval", "Say plainly what you do, who it's for and where",
    "AI assistants repeat short, explicit statements; if your pages don't spell these out, assistants can't either.", "L", 2, "Moderate", "diy", LLM),
  c("1.3", "Uses relevant buzzwords", "Use the words your customers actually type",
    "AI matches questions to pages by vocabulary, so missing customer terms means missed answers.", "L", 1, "Quick win", "diy", LLM),
  c("1.4", "Path of least resistance: info easy to access and retrieve", "Put key facts within two clicks of your homepage, as plain text",
    "Crawlers rarely dig through PDFs, images or hidden tabs, so facts kept there are effectively missing.", "A+L", 2, "Moderate", "kwez"),
  c("1.5", "Crawlers can access, read and reformat content", "Make sure your main content is in the page itself, not added later by JavaScript",
    "Most AI crawlers don't run JavaScript, so text that only appears after scripts run is invisible to them.", "A", 3, "Major", "kwez"),
  c("1.6", "No restrictions preventing AI crawlers", "Remove blocks that stop AI assistants reading your site",
    "If your robots.txt file or server turns AI crawlers away, assistants can't learn anything about you.", "A", 3, "Quick win", "kwez", { allowsPartial: true }),
  c("1.7", "No unnecessary AI crawler blocks", "Let AI search crawlers in, and decide deliberately about training crawlers",
    "Blocking search crawlers such as OAI-SearchBot stops ChatGPT citing you; blocking training-only crawlers is a trade-off.", "A", 2, "Quick win", "kwez", { allowsPartial: true, impact: "High" }),

  // ── Category 2 ────────────────────────────────────────────────────────────
  c("2.1", "Important pages load quickly and are easy to process", "Speed up your key pages on mobile",
    "Slow pages are crawled less and rank lower, which reduces how often AI tools find them.", "E", 3, "Major", "kwez"),
  c("2.2", "Has an FAQ page designed for AI processing", "Add a dedicated FAQ page",
    "AI assistants favour ready-made question-and-answer pairs they can quote directly.", "A", 2, "Moderate", "kwez"),
  c("2.3", "FAQ includes terms users put in AI queries", "Use your customers' own wording in your FAQs",
    "When FAQ wording matches how people phrase questions to AI, your answers are easier to match.", "L", 1, "Quick win", "diy", LLM),
  c("2.4", "FAQ questions replaced/supplemented with questions people ask AI", "Add the questions people really ask AI, like \"best X for Y\"",
    "People ask AI full, conversational questions; generic FAQs like \"How do I contact you?\" don't match them.", "L", 2, "Moderate", "diy", LLM),
  c("2.5", "Non-PDF resources under Googlebot's 2 MB fetch limit", "Keep every page file and script under 2 MB",
    "Google stops reading a file after its first 2 MB, so anything beyond that is ignored.", "A", 2, "Moderate", "kwez"),
  c("2.6", "HTML files lightweight, well under 2 MB", "Slim down heavy page code",
    "Lighter pages are fetched faster and more completely by every crawler.", "A", 2, "Moderate", "kwez", { allowsPartial: true }),
  c("2.7", "FAQ page well below 2 MB", "Keep your FAQ page lightweight",
    "Your FAQ is the page AI is most likely to quote, so it must load and parse fully.", "A", 1, "Quick win", "kwez", { allowsPartial: true }),
  c("2.8", "FAQ ordered by how often questions are asked", "Put the most-asked questions first",
    "Crawlers and readers give most weight to what comes first on a page.", "M", 1, "Quick win", "diy"),
  c("2.9", "Images compressed", "Compress images and use modern formats (WebP or AVIF)",
    "Heavy images slow every page and waste the time crawlers spend on your site.", "A", 2, "Quick win", "diy"),
  c("2.10", "Unnecessary JavaScript removed", "Remove scripts you don't need",
    "Every extra script slows the page and can delay or hide your content from crawlers.", "E/A", 2, "Moderate", "kwez"),
  c("2.11", "Heavy assets lazy-loaded", "Load images further down the page only when needed",
    "Lazy-loading lets the important text and top-of-page content arrive first.", "A", 1, "Quick win", "kwez"),
  c("2.12", "Loading prioritised, images last", "Load your text first and images last",
    "Prioritising text means crawlers and visitors get the content that matters straight away.", "A/E", 1, "Moderate", "kwez"),
  c("2.13", "Critical info in images/video also available as text", "Repeat anything important from images or video in text",
    "AI crawlers read text, not pictures: a price or award shown only in an image doesn't exist to them.", "A+L", 2, "Quick win", "diy"),
  c("2.14", "Videos have crawlable transcripts", "Add transcripts to your videos",
    "A transcript turns everything said in a video into text AI can read and quote.", "A", 1, "Moderate", "diy"),

  // ── Category 3 ────────────────────────────────────────────────────────────
  c("3.1", "Direct answers before additional explanation", "Answer the question in the first sentence under each heading",
    "AI assistants lift the first clear sentence; if it's preamble, they skip you.", "L", 3, "Moderate", "diy", LLM),
  c("3.2", "Vague language removed", "Replace vague claims with specifics",
    "Phrases like \"world-class solutions\" give AI nothing to repeat; facts do.", "L", 2, "Moderate", "diy", LLM),
  c("3.3", "Computer-friendly language", "Use precise names, numbers, places, prices and dates",
    "Specific, consistently named facts are what AI can extract and trust.", "L", 2, "Moderate", "diy", LLM),
  c("3.4", "Call-and-response format", "Phrase more headings as questions",
    "Question headings match the way people ask AI, making your answers easy to find.", "A+L", 2, "Quick win", "diy"),
  c("3.5", "AI can find a question and its answer side by side", "Put each answer directly under its question",
    "When the answer sits right after the question, AI can pair them with confidence.", "A+L", 3, "Moderate", "kwez"),
  c("3.6", "Strong topical relevance", "Cover your core services and customer questions consistently",
    "AI recommends sites that clearly and repeatedly cover a topic, not ones that mention it once.", "L", 2, "Major", "diy", LLM),
  c("3.7", "Follows Question → Answer → Additional detail", "Structure answers as: question, short answer, then detail",
    "This pattern lets AI quote the short answer and still link to your detail.", "L", 2, "Moderate", "diy", LLM),

  // ── Category 4 ────────────────────────────────────────────────────────────
  c("4.1", "Site analysed with a research question engine", "Research the exact questions customers ask AI",
    "Knowing the real questions lets you write FAQs AI will match.", "M", 1, "Moderate", "kwez"),
  c("4.2", "FAQ questions reflect what customers value", "Make your FAQs about what customers care about: price, quality, speed and trust",
    "Buyers ask AI about price, quality, location and trust; FAQs that answer those get recommended.", "L", 2, "Moderate", "diy", LLM),
  c("4.3", "FAQs built around those customer interests", "Fill the gaps in your FAQ coverage",
    "Every customer theme without an answer is a question AI will answer using someone else.", "L", 2, "Moderate", "kwez", LLM),
  c("4.4", "Q&As streamlined to match AI language and answer habits", "Keep each FAQ answer to 40–80 self-contained words",
    "Short, complete answers are the right size for AI to quote word for word.", "L", 2, "Quick win", "diy", LLM),

  // ── Category 5 ────────────────────────────────────────────────────────────
  c("5.1", "Structured schema markup present", "Add schema markup to your pages",
    "Without it, AI tools have to guess what your business is, where it is and what you offer.", "A", 3, "Moderate", "kwez"),
  c("5.2", "Familiar standard formats (AI familiarity bias)", "Use the standard schema types AI tools recognise",
    "Common types like Organization and FAQPage are the ones AI systems are trained to read.", "A", 2, "Moderate", "kwez"),
  c("5.3", "JSON-LD implemented correctly", "Fix errors in your schema markup and link it to your profiles",
    "Broken or incomplete markup is ignored, and missing profile links stop AI connecting you to your reputation.", "A", 3, "Quick win", "kwez"),
  c("5.4", "Relevant links created", "Link related pages together and to trusted sources",
    "Links show crawlers how your content fits together and that you cite credible sources.", "A", 2, "Moderate", "diy"),

  // ── Category 6 ────────────────────────────────────────────────────────────
  c("6.1", "Company and founders established as authoritative entities", "Establish your company and founders as clearly identified entities",
    "AI recommends businesses it can identify with confidence, with a clear About page, markup and official records.", "A+E", 3, "Moderate", "kwez"),
  c("6.2", "Founders/key people have relevant publications or titles", "Get your founders' expertise published and listed",
    "Articles, talks and roles in your field show AI your people are credible experts.", "E", 2, "Major", "diy", SEARCH),
  c("6.3", "Legitimacy, success and authority claims backed by real-world evidence", "Back up every claim like \"award-winning\" with proof",
    "Unsupported claims are discounted by AI and by customers; linked evidence is trusted.", "L+E", 3, "Moderate", "diy", LLM),
  c("6.4", "Detailed personal profiles exist on the site", "Add a team page with individual bios",
    "People buy from people, and AI looks for named experts behind a business.", "A", 2, "Moderate", "diy"),
  c("6.5", "Profiles include achievements, successes, professional history", "Expand bios with experience, credentials and results",
    "Detailed bios give AI concrete reasons to describe your team as experts.", "L", 2, "Quick win", "diy", LLM),
  c("6.6", "Identities consistent across the internet", "Use the same names and job titles everywhere",
    "Mismatched names or titles make it harder for AI to be sure it's the same person.", "E", 2, "Quick win", "diy"),
  c("6.7", "AI can connect people and organisations across sources", "Link your people to your company in markup and on their profiles",
    "Explicit links between people and company let AI connect your team's reputation to your business.", "A+E", 2, "Quick win", "kwez"),
  c("6.8", "Site provides evidence strengthening credibility", "Show case studies, awards, accreditations and reviews",
    "Visible proof of results is what turns a mention into a recommendation.", "A+L", 2, "Moderate", "diy"),

  // ── Category 7 ────────────────────────────────────────────────────────────
  c("7.1", "Publishes original research AI would find useful", "Publish original research AI can cite",
    "AI assistants cite sources of original data, which earns you mentions people can't get elsewhere.", "L", 2, "Major", "kwez", LLM),
  c("7.2", "Includes specific industry/company statistics or reports", "Include specific statistics with context",
    "Concrete numbers are among the most-quoted content in AI answers.", "A+L", 2, "Moderate", "diy"),
  c("7.3", "Data is streamlined and specific", "Give every figure a date, sample size and source",
    "AI trusts figures it can attribute and date.", "L", 1, "Quick win", "diy", LLM),
  c("7.4", "Data is unique to the company", "Publish data only you have",
    "If your figures are just copied from elsewhere, AI will cite the original instead.", "L", 2, "Major", "kwez", LLM),
  c("7.5", "Gives AI a reason to use its information", "Give AI something to cite that it can't find elsewhere",
    "Unique, useful information is the main reason an AI chooses your site as a source.", "L", 2, "Major", "kwez", LLM),
  c("7.6", "Publishes new original data regularly", "Publish new data at least once a year",
    "Fresh data keeps you the current source AI turns to.", "A+L", 1, "Major", "diy"),

  // ── Category 8 ────────────────────────────────────────────────────────────
  c("8.1", "Accurate and relevant data", "Correct inaccurate or unverifiable details",
    "Wrong prices, addresses or dates get repeated by AI, or make it distrust your site.", "L+E", 2, "Quick win", "diy", { ...LLM, allowsPartial: true }),
  c("8.2", "Pages up to date", "Refresh pages that haven't been updated in 18 months",
    "AI favours current information, and stale pages suggest a business may have moved on.", "A", 2, "Moderate", "diy"),
  c("8.3", "Established content maintenance schedule", "Set a regular content review schedule",
    "A routine keeps facts current without big, costly rewrites.", "M", 1, "Quick win", "kwez"),
  c("8.4", "Updates are meaningful, not just date changes", "Make real content updates, not just date changes",
    "Changing a date without changing content doesn't fool search engines and can erode trust.", "M/A", 1, "Moderate", "diy"),
  c("8.5", "Modern language and current statistics", "Update old statistics and dated wording",
    "Out-of-date figures make AI less likely to rely on your page.", "L", 1, "Quick win", "diy", LLM),
  c("8.6", "Ongoing subscription to keep FAQs relevant", "Keep your FAQs current with ongoing updates",
    "The questions people ask AI change; FAQs need to keep up.", "M", 1, "Moderate", "kwez"),

  // ── Category 9 ────────────────────────────────────────────────────────────
  c("9.1", "Mentioned on reputable third-party sites", "Get mentioned on reputable sites",
    "AI learns who to recommend largely from what other sites say, not what you say about yourself.", "E", 3, "Major", "kwez", { ...SEARCH, group: G_BRAND }),
  c("9.2", "Appears in industry publications, news or professional directories", "Get listed in industry directories and publications",
    "Directories and trade press are sources AI checks to confirm a business is real and relevant.", "E", 2, "Moderate", "diy", { ...SEARCH, group: G_BRAND }),
  c("9.3", "Backlinks from authoritative relevant sites", "Earn links from respected sites in your field",
    "Links from trusted sites signal that your business is worth citing.", "E", 2, "Major", "kwez", { ...SEARCH, allowsPartial: true, group: G_BRAND }),
  c("9.4", "Mentioned in independent comparisons, recommendations or rankings", "Get included in \"best of\" lists and comparisons",
    "AI answers to \"who's best for…\" questions draw heavily on published comparisons and rankings.", "E", 2, "Major", "kwez", { ...SEARCH, group: G_BRAND }),
  c("9.5", "Name, services and expertise described consistently externally", "Make sure others describe you the way you describe yourself",
    "Consistent descriptions help AI be confident about what you do.", "E+L", 2, "Moderate", "diy", { requires: ["SEARCH_API_KEY", "ANTHROPIC_API_KEY"], group: G_BRAND }),
  c("9.6", "Genuine reviews on independent platforms", "Collect reviews on independent platforms",
    "Independent reviews are a strong trust signal for AI recommendations.", "E", 3, "Moderate", "diy", { ...SEARCH, group: G_REVIEWS }),
  c("9.7", "Reviews give specific detail", "Ask reviewers to mention specific details",
    "Detailed reviews (\"rewired our kitchen in two days\") give AI facts to repeat.", "E+L", 1, "Quick win", "diy", { requires: ["SEARCH_API_KEY", "ANTHROPIC_API_KEY"], group: G_REVIEWS }),
  c("9.8", "External testimonials, case studies or references", "Get clients to reference your work on their own sites",
    "Third-party references are independent proof of your work.", "E", 2, "Moderate", "diy", { ...SEARCH, group: G_REVIEWS }),
  c("9.9", "Third parties independently verify key site claims", "Get your key claims confirmed by independent sources",
    "Claims confirmed elsewhere are treated as facts; unconfirmed ones are treated as marketing.", "E+L", 2, "Major", "kwez", { requires: ["SEARCH_API_KEY", "ANTHROPIC_API_KEY"], group: G_REVIEWS }),
  c("9.10", "Mentioned or recommended by ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews", "Get AI assistants recommending you",
    "This is the end goal: being named when someone who doesn't know you asks AI for help.", "E", 3, "Major", "kwez", { requiresAny: AI_KEYS, group: G_AI }),
  c("9.11", "Which external sites AI cites for the company/competitors", "Know which sites AI trusts in your market",
    "The sites AI cites are the ones worth being listed on.", "E", 2, "Moderate", "kwez", { requiresAny: AI_KEYS, group: G_AI }),
  c("9.12", "Competitors get more AI mentions/citations", "Close the AI visibility gap with your competitors",
    "If AI names competitors instead of you, you're losing customers before they reach your site.", "E", 2, "Major", "kwez", { requiresAny: AI_KEYS, impact: "High", group: G_AI }),
  c("9.13", "Opportunities on sites AI frequently cites", "Get listed on the sites AI cites most",
    "A listing on a site AI already trusts is one of the quickest routes into AI answers.", "E+L", 2, "Moderate", "kwez", { requiresAny: AI_KEYS, group: G_AI }),
  c("9.14", "Name, website, location, business info (NAP) consistent externally", "Make your name, address and phone number identical everywhere",
    "Inconsistent business details make AI unsure which information is correct.", "E", 2, "Quick win", "diy", { group: G_ENTITY }),
  c("9.15", "Founders correctly associated with company on third-party sites", "Make sure other sites connect your founders to your company",
    "AI relies on third-party pages to confirm who runs a business.", "E", 2, "Moderate", "diy", { ...SEARCH, group: G_ENTITY }),
  c("9.16", "Reputable sources evidence expertise, achievements, relevance", "Win awards, press and accreditations that others publish",
    "Recognition published by others is the strongest authority signal there is.", "E", 2, "Major", "kwez", { ...SEARCH, group: G_ENTITY }),
];

export const CHECK_BY_ID = new Map(CHECKS.map((m) => [m.id, m]));
export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
