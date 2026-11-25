/**
 * Single source of truth for model IDs, API endpoints, prices and crawler limits.
 * Nothing else in the codebase should hardcode a model name or endpoint.
 *
 * Model IDs can be overridden with env vars so they can be updated without a code change.
 * Non-Anthropic defaults are verified against each provider's docs in the build phase that
 * uses them (see README "Model IDs"); treat them as overridable defaults.
 */

const env = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

const positiveInt = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const API_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PERPLEXITY_API_KEY",
  "PAGESPEED_API_KEY",
  "SEARCH_API_KEY",
  "COMPANIES_HOUSE_API_KEY",
] as const;
export type ApiKeyName = (typeof API_KEY_NAMES)[number];

/**
 * Fallback env var names per key. ANTHROPIC_API_KEY falls back to KWEZ_ANTHROPIC_API_KEY so the
 * app can run where ANTHROPIC_API_KEY is reserved or unset (e.g. hosted dev sessions).
 */
const KEY_FALLBACKS: Partial<Record<ApiKeyName, string[]>> = {
  ANTHROPIC_API_KEY: ["KWEZ_ANTHROPIC_API_KEY"],
};
/** Every env var a key can be read from (primary names plus fallbacks). Tests clear these. */
export const API_KEY_ENV_VARS: string[] = API_KEY_NAMES.flatMap((k) => [k, ...(KEY_FALLBACKS[k] ?? [])]);

/**
 * Read keys lazily so tests (and a restarted server) see the current environment.
 * Every key check (hasKey, keysConfigured, check `requires`) and read (LLM client) goes
 * through here, so fallbacks apply everywhere.
 */
export function getKey(name: ApiKeyName): string | undefined {
  const raw = env(name) ?? KEY_FALLBACKS[name]?.map(env).find((v) => v !== undefined);
  return raw === undefined ? undefined : cleanKey(raw);
}

/**
 * Undo common copy-paste mistakes in a key's value: the whole "NAME=value" line pasted as the
 * value (e.g. "KWEZ_ANTHROPIC_API_KEY=sk-ant-…"), surrounding quotes, or a "Bearer " prefix.
 */
export function cleanKey(value: string): string | undefined {
  let v = value.trim();
  for (let i = 0; i < 3; i++) {
    const before = v;
    v = v
      .replace(/^(?:export\s+)?[A-Z][A-Z0-9_]*\s*=\s*/, "")
      .replace(/^(["'`])(.*)\1$/, "$2")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (v === before) break;
  }
  return v || undefined;
}
/**
 * Hide API keys in text that is about to be saved or shown (error messages, logs). Covers every
 * configured key value plus anything shaped like an Anthropic key, so a key can never reach a
 * browser or a saved audit file even if a provider echoes it back in an error.
 */
export function redactSecrets(text: string): string {
  let out = text;
  const secrets = [...API_KEY_ENV_VARS.map((n) => env(n)), ...API_KEY_NAMES.map((n) => getKey(n)), env("APP_PASSWORD")]
    .filter((v): v is string => !!v && v.length >= 8)
    .sort((a, b) => b.length - a.length);
  for (const s of new Set(secrets)) out = out.split(s).join("[hidden]");
  return out.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[hidden]");
}

export function hasKey(name: ApiKeyName): boolean {
  return getKey(name) !== undefined;
}

export const config = {
  appName: "Kwez GEO Audit",
  brand: "Kwez",

  crawler: {
    get contactUrl() {
      return env("CRAWLER_CONTACT_URL") ?? "https://kwez.co.uk/geo-audit-bot";
    },
    get userAgent() {
      return `KwezGEOAudit/1.0 (+${this.contactUrl})`;
    },
    maxPagesDefault: 25,
    maxPagesLimit: 100,
    requestTimeoutMs: 15_000,
    /** Minimum gap between requests to the same domain (1 request/second). */
    minIntervalMsPerDomain: 1_000,
    /** Pages fetched for asset measurement (images/scripts/CSS) and the asset cap. */
    assetPages: 5,
    maxAssets: 40,
    maxRedirects: 5,
    /** Stop reading a response body after this many bytes (protects memory). */
    maxBodyBytes: 8 * 1024 * 1024,
    /** Probe the homepage with AI-bot-like user agents (check 1.6). Indicative only. */
    get botUaProbes() {
      return env("BOT_UA_PROBES") !== "false";
    },
    /** Compare raw vs rendered HTML with Playwright (check 1.5). Off by default. */
    get enablePlaywright() {
      return env("ENABLE_PLAYWRIGHT") === "true";
    },
    /** Allow auditing localhost / private IPs. Only for local fixture tests. */
    get allowLocalTargets() {
      return env("ALLOW_LOCAL_TARGETS") === "true";
    },
  },

  /** Agents checked in robots.txt (check 1.6/1.7). `kind` drives 1.7's Fail vs Partial. */
  aiAgents: [
    { token: "GPTBot", owner: "OpenAI", kind: "training" },
    { token: "OAI-SearchBot", owner: "OpenAI", kind: "search" },
    { token: "ChatGPT-User", owner: "OpenAI", kind: "search" },
    { token: "ClaudeBot", owner: "Anthropic", kind: "training" },
    { token: "Claude-SearchBot", owner: "Anthropic", kind: "search" },
    { token: "Claude-User", owner: "Anthropic", kind: "search" },
    { token: "PerplexityBot", owner: "Perplexity", kind: "search" },
    { token: "Perplexity-User", owner: "Perplexity", kind: "search" },
    { token: "Google-Extended", owner: "Google", kind: "training" },
    { token: "Googlebot", owner: "Google", kind: "core" },
    { token: "Bingbot", owner: "Microsoft", kind: "core" },
    { token: "Applebot-Extended", owner: "Apple", kind: "training" },
    { token: "CCBot", owner: "Common Crawl", kind: "training" },
    { token: "meta-externalagent", owner: "Meta", kind: "training" },
  ] as const,

  /**
   * User agents for homepage-only probes (1.1, 1.6). Our own token is appended so the
   * requests stay identifiable. A block here is "indicative only": firewalls that verify
   * bots by IP may block these probes while letting the real crawler through.
   */
  botProbeUserAgents: {
    Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
    "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    ClaudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    PerplexityBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  } as Record<string, string>,

  thresholds: {
    googlebotFetchLimitBytes: 2 * 1024 * 1024,
    htmlPassBytes: 500 * 1024,
    imageMaxBytes: 200 * 1024,
    pagespeedPassScore: 70,
    lcpPassSeconds: 2.5,
    staleContentMonths: 18,
    staleStatisticYears: 3,
    faqAnswerWords: { min: 40, max: 80 },
    competitorGapPoints: 20,
    provisionalCoveragePct: 60,
  },

  /** LLM used for qualitative (L) checks. */
  llm: {
    /** Base URL for the official Anthropic SDK (it appends /v1/messages). Set explicitly so an
     *  ANTHROPIC_BASE_URL in the server's environment can't silently redirect audit traffic. */
    baseUrl: "https://api.anthropic.com",
    get judgeModel() {
      return env("ANTHROPIC_JUDGE_MODEL") ?? "claude-sonnet-5-5";
    },
    /** Reasoning effort for judgements. Thinking tokens count towards maxOutputTokensPerCall. */
    effort: "medium" as "low" | "medium" | "high",
    maxOutputTokensPerCall: 8_000,
    /**
     * Hard cap across a whole audit (input + output, all calls and retries). 1M tokens is roughly
     * $2–3 at Sonnet prices; large, text-heavy sites need most of it. Override with AI_TOKEN_BUDGET.
     */
    get maxTokensPerAudit() {
      const n = Number(env("AI_TOKEN_BUDGET")?.replace(/[_,]/g, ""));
      return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 1_000_000;
    },
    maxRetriesOnInvalidOutput: 2,
    /** Page text is sent in chunks of at most this many characters (~4 chars per token). */
    chunkChars: 48_000,
    /** Parallel requests during the AI review stage. */
    concurrency: 3,
    requestTimeoutMs: 120_000,
  },

  /** AI visibility tests (9.10–9.13). */
  visibility: {
    cacheHours: 24,
    /** 9.10 passes when the business is named in at least this share of answers. */
    passShare: 0.2,
    /** 10 questions with Claude and web search cost roughly $0.50–1 per audit. */
    defaultPromptCount: 10,
    maxPromptCount: 100,
    providers: {
      anthropic: {
        label: "Claude",
        keyName: "ANTHROPIC_API_KEY" as ApiKeyName,
        endpoint: "https://api.anthropic.com/v1/messages",
        get model() {
          return env("ANTHROPIC_VISIBILITY_MODEL") ?? "claude-sonnet-5-5";
        },
      },
      openai: {
        label: "ChatGPT",
        keyName: "OPENAI_API_KEY" as ApiKeyName,
        endpoint: "https://api.openai.com/v1/responses",
        get model() {
          return env("OPENAI_MODEL") ?? "VERIFY-IN-PHASE-5";
        },
      },
      gemini: {
        label: "Gemini",
        keyName: "GEMINI_API_KEY" as ApiKeyName,
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
        get model() {
          return env("GEMINI_MODEL") ?? "VERIFY-IN-PHASE-5";
        },
      },
      perplexity: {
        label: "Perplexity",
        keyName: "PERPLEXITY_API_KEY" as ApiKeyName,
        endpoint: "https://api.perplexity.ai/chat/completions",
        get model() {
          return env("PERPLEXITY_MODEL") ?? "VERIFY-IN-PHASE-5";
        },
      },
    },
  },

  pagespeed: {
    endpoint: "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  },

  search: {
    get provider(): "brave" | "serper" {
      return env("SEARCH_API_PROVIDER") === "serper" ? "serper" : "brave";
    },
    endpoints: {
      brave: "https://api.search.brave.com/res/v1/web/search",
      serper: "https://google.serper.dev/search",
    },
    resultsPerQuery: 10,
    /** Approximate USD per query, for the cost line only (check the provider's pricing page). */
    usdPerQuery: { serper: 0.001, brave: 0.005 },
    /** Third-party pages (reviews, mentions) fetched for fuller text. EXTERNAL_FETCH_PAGES=0 turns it off. */
    get fetchPages() {
      const n = Number(env("EXTERNAL_FETCH_PAGES"));
      return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 12) : 6;
    },
  },

  companiesHouse: {
    endpoint: "https://api.company-information.service.gov.uk",
    publicSite: "https://find-and-update.company-information.service.gov.uk/company",
  },

  /**
   * Approximate prices in USD per million tokens, used only for cost estimates shown
   * before a run. Check providers' pricing pages; these are estimates, not invoices.
   */
  pricingUsdPerMTok: {
    /** Claude Sonnet 5.5 (the default judge and visibility model). */
    anthropic: { input: 2, output: 10 },
    /** Claude's server-side web search: $10 per 1,000 searches. */
    anthropicWebSearchPerRequest: 0.01,
    openai: { input: 1.25, output: 10 },
    gemini: { input: 0.3, output: 2.5 },
    perplexity: { input: 1, output: 1, perRequest: 0.005 },
  },

  /** Numeric maps for the to-do priority formula. */
  priority: {
    impact: { High: 3, Medium: 2, Low: 1 },
    effort: { "Quick win": 1, Moderate: 2, Major: 3 },
  },

  /** Protection against abuse and runaway API bills. Override the numbers with env vars. */
  security: {
    /**
     * Password for the whole app (browser sign-in box). Strongly recommended as soon as the app is
     * reachable by anyone else, because every audit spends money on API calls. Unset = no password.
     */
    get appPassword() {
      return env("APP_PASSWORD");
    },
    get appUsername() {
      return env("APP_USERNAME") ?? "kwez";
    },
    /** Audits (new or "run again") that may run at the same time. */
    get maxConcurrentAudits() {
      return positiveInt(env("MAX_CONCURRENT_AUDITS"), 3);
    },
    /** Audits that may be started per hour, from everyone together. */
    get auditsPerHour() {
      return positiveInt(env("AUDITS_PER_HOUR"), 20);
    },
    /** Website "fill in for me" lookups per minute, per visitor. */
    prefillPerMinute: 10,
    /** Largest request body the API accepts (the audit form is a few KB). */
    maxBodyBytes: 64 * 1024,
  },

  storage: {
    get auditsDir() {
      return env("AUDITS_DIR") ?? `${process.cwd()}/data/audits`;
    },
    get cacheDir() {
      return env("CACHE_DIR") ?? `${process.cwd()}/data/cache`;
    },
  },
} as const;
