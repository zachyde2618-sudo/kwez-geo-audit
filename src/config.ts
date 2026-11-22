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

/** Read keys lazily so tests (and a restarted server) see the current environment. */
export function getKey(name: ApiKeyName): string | undefined {
  return env(name);
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
    endpoint: "https://api.anthropic.com/v1/messages",
    anthropicVersion: "2023-06-01",
    get judgeModel() {
      return env("ANTHROPIC_JUDGE_MODEL") ?? "claude-sonnet-5-5";
    },
    maxOutputTokensPerCall: 2_000,
    /** Hard cap across a whole audit (input + output). */
    maxTokensPerAudit: 400_000,
    maxRetriesOnInvalidOutput: 2,
  },

  /** AI visibility tests (9.10–9.13). */
  visibility: {
    cacheHours: 24,
    defaultPromptCount: 20,
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
    anthropic: { input: 3, output: 15 },
    openai: { input: 1.25, output: 10 },
    gemini: { input: 0.3, output: 2.5 },
    perplexity: { input: 1, output: 1, perRequest: 0.005 },
  },

  /** Numeric maps for the to-do priority formula. */
  priority: {
    impact: { High: 3, Medium: 2, Low: 1 },
    effort: { "Quick win": 1, Moderate: 2, Major: 3 },
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
