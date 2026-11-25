# Kwez GEO Audit: build notes

Handover notes for continuing the build. The full product brief was given in the first build session; this file records the decisions made and what is left.

## Status

| Phase | Status |
|---|---|
| 1. Scaffold, config, input form, check registry (all 72 checks), Zod schemas | Done |
| 2. Polite crawler + automated checks (categories 1, 2, 5, automated parts of 6 and 8), form prefill, fixture site e2e | Done |
| 3. Scoring engine (tested), animated ScoreGauge, category bars, prioritised to-do list, results layout | Done |
| 4. LLM checks: categories 3, 4, 7 + LLM parts of 1.2, 1.3, 1.4, 2.3, 2.4, 2.13, 6.3, 6.5, 6.8, 7.2, 7.6, 8.1, 8.5, 9.5, 9.7, 9.9 | Done (9.5/9.7/9.9 judges built; their sources arrive in Phase 5) |
| 5. External checks: web search (Serper/Brave) for 6.2, 9.1–9.9, 9.14–9.16; AI visibility with Claude (9.10–9.13) | Done. Still to do: PageSpeed (2.1), Companies House, ChatGPT/Gemini/Perplexity visibility |
| 6. Polish | Partly done: branding and eye loaders, paste box, past audits (favourites, delete, run again), balanced crawl on big sites. To do: client-ready report (PDF/share link), CSV/JSON export, hosting |

Run: `npm install`, `ALLOW_LOCAL_TARGETS=true npm run dev`. Tests: `npm test` (~185 passing). Demo site: `npm run fixture` (port 4010), then audit `http://localhost:4010`. See `CLAUDE.md` for the current overview; this file keeps the detailed decisions.

Live reference run (sairaskin.co.uk, a 230-page Shopify skincare brand, 25 pages): coverage 90%, score ~35, named in 0 of 10 Claude answers, about $1.75 in API costs.

## Decisions agreed with the owner

- **Stack:** Next.js 16 (App Router, Cache Components turned off) + TypeScript + Tailwind 4, Cheerio, Zod 4, Vitest. Audits saved as JSON in `data/audits/`. Progress by polling. Must run on a long-lived Node server (not serverless).
- **All model IDs and endpoints live in `src/config.ts` only.**
- **LLM model: Claude Sonnet 5.5 (`claude-sonnet-5-5`)** for the LLM-judged checks and Claude visibility tests (owner's choice, for cost). Overridable via `ANTHROPIC_JUDGE_MODEL` / `ANTHROPIC_VISIBILITY_MODEL`.
- **Bot user-agent probes (1.1, 1.6):** homepage only, our token appended; a block is reported as **Partial, "indicative only"**, never Fail.
- **Priority numbers:** impact High/Medium/Low = 3/2/1; effort Quick win/Moderate/Major = 1/2/3. Groups by effort: Do this week / Do this month / Bigger projects.
- **Checks:** one file per category (`src/lib/checks/catN.ts`), each check a separately exported implementation with a stable ID; metadata in `catalogue.ts`.
- **Partial** allowed only where the catalogue sets `allowsPartial` (e.g. 1.6, 1.7, 2.6, 2.7, 8.1, 9.3); enforced in `finaliseResult` (also: no evidence → Unable to Verify; Pass clears issue/change; snippets ≤ 300 chars).
- **Added `COMPANIES_HOUSE_API_KEY`** (free) to the env list.
- Google reviews / Google Business Profile are recorded but never scraped; LinkedIn is never scraped.
- A robots.txt network error is Unable to Verify, not Fail; only HTTP 5xx counts as disallow-all.

## Phase 4: how the AI review works

- `src/lib/llm/client.ts`: official `@anthropic-ai/sdk`, `client.beta.messages.create` with structured outputs (`output_config.format` JSON schema), effort `medium`, server-side refusal fallback (`fallbacks: "default"`). Explicit `baseURL` from config so a stray `ANTHROPIC_BASE_URL` can't redirect traffic. Enforces `maxTokensPerAudit` before every request (conservative ~3 chars/token input estimate + `max_tokens` sized to what's left), retries invalid output with feedback up to `maxRetriesOnInvalidOutput`, logs a `CostEntry` per call (retries included) into `audit.costs`.
- `src/lib/llm/quotes.ts`: quotes must appear verbatim in the text sent; only whitespace, quote-mark, dash, NBSP and ellipsis-character differences are tolerated.
- `src/lib/llm/rubrics.ts`: one criterion per check ID with pass/partial/fail definitions, a `mode` and a code-owned fix text. `worst` criteria (looking for problems) must quote the problem on Fail/Partial; `best` criteria (looking for good things) must quote it on Pass/Partial. Four groups (answers, trust, data, FAQ), one request per group per chunk.
- `src/lib/llm/review.ts`: chunks page text (`config.llm.chunkChars`), runs groups with `config.llm.concurrency`, aggregates chunk verdicts in code (best: best chunk decides; worst: average of chunks, Pass ≥ 75%, Partial ≥ 40%; changed Nov 2026 after stripe.com scored 38 because one weak page failed whole-site checks), records failures per criterion. Pipeline stage 3 in `pipeline.ts`; summary saved in `extras.aiReview` and shown on the results page (model, requests, tokens, est. cost).
- A+L checks (1.4, 2.13, 3.4, 3.5, 4.4, 6.8, 7.2) = automated part + AI part, worse part decides; if the AI part can't run, the automated part stands with a note. 7.6 dates the pages the AI quoted as original data (7.1).
- `src/lib/llm/external.ts` + `cat9.ts`: AI judges for 9.5/9.7/9.9 over `ctx.data.external` sources. **Phase 5 must** gather `mentions`/`reviews`, call `runExternalReview`, and put the result in `ctx.data.external.judgements` (and `.model`).
- Tests use `setLlmTransportForTests` (no network). `tests/llm-e2e.test.ts` runs the fixture site with a fake model, including a fabricated-quote case.
- Pricing in config updated to Sonnet 5.5 ($2 / $10 per MTok).
- A Claude API key can't be stored as a cloud-environment network secret (Anthropic's own host); for cloud sessions it must be an environment variable `ANTHROPIC_API_KEY` in the environment settings.

## Phase 4 requirements (from the brief)

- Send page text in chunks with a strict JSON output schema; each judgement returns a status plus quoted evidence.
- **Verify every quote appears verbatim in the page text**; reject and retry on invalid output (`config.llm.maxRetriesOnInvalidOutput`), else Unable to Verify.
- Cap tokens per audit (`config.llm.maxTokensPerAudit`) and log cost per call into `audit.costs`.
- Code computes the score, never the LLM.
- Keys are optional: missing `ANTHROPIC_API_KEY` → "Not checked: ANTHROPIC_API_KEY not configured" (already wired via `requires` in the catalogue).
- Use the official `@anthropic-ai/sdk`.
- Category 9 prompt generation (Phase 5): prompts must never contain the brand name; unit-test that.
