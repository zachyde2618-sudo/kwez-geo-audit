# Kwez GEO Audit: build notes

Handover notes for continuing the build. The full product brief was given in the first build session; this file records the decisions made and what is left.

## Status

| Phase | Status |
|---|---|
| 1. Scaffold, config, input form, check registry (all 72 checks), Zod schemas | Done |
| 2. Polite crawler + automated checks (categories 1, 2, 5, automated parts of 6 and 8), form prefill, fixture site e2e | Done |
| 3. Scoring engine (tested), animated ScoreGauge, category bars, prioritised to-do list, results layout | Done |
| 4. LLM checks: categories 3, 4, 7 + LLM parts of 1.2, 1.3, 1.4, 2.3, 2.4, 2.13, 6.3, 6.5, 6.8, 7.2, 7.6, 8.1, 8.5, 9.5, 9.7, 9.9 | **Next** |
| 5. External checks: PageSpeed, web search, review URLs, Companies House, AI visibility prompt runner (9.10–9.13), share of voice, cited domains | To do |
| 6. Polish: past audits compare, print report (A4), CSV/JSON export, error/loading states, README | To do |

Run: `npm install`, `npm run dev`. Tests: `npm test` (105 passing). Demo site: `npm run fixture` (port 4010), then audit `http://localhost:4010` with `ALLOW_LOCAL_TARGETS=true`.

## Decisions agreed with the owner

- **Stack:** Next.js 16 (App Router, Cache Components turned off) + TypeScript + Tailwind 4, Cheerio, Zod 4, Vitest. Audits saved as JSON in `data/audits/`. Progress by polling. Must run on a long-lived Node server (not serverless).
- **All model IDs and endpoints live in `src/config.ts` only.**
- **LLM model: Claude Sonnet 5.5 (`claude-sonnet-5-5`)** for the LLM-judged checks and Claude visibility tests (owner's choice, for cost). Overridable via `ANTHROPIC_JUDGE_MODEL` / `ANTHROPIC_VISIBILITY_MODEL`.
- **Bot user-agent probes (1.1, 1.6):** homepage only, our token appended; a block is reported as **Partial, "indicative only"**, never Fail.
- **Priority numbers:** impact High/Medium/Low = 3/2/1; effort Quick win/Moderate/Major = 1/2/3. Groups by effort: Do this week / Do this month / Bigger projects.
- **Checks:** one file per category (`src/lib/checks/catN.ts`), each check a separately exported implementation with a stable ID; metadata in `catalogue.ts`.
- **Partial** allowed only on 1.6, 1.7, 2.6, 2.7, 8.1, 9.3; enforced in `finaliseResult` (also: no evidence → Unable to Verify; Pass clears issue/change; snippets ≤ 300 chars).
- **Added `COMPANIES_HOUSE_API_KEY`** (free) to the env list.
- Google reviews / Google Business Profile are recorded but never scraped; LinkedIn is never scraped.
- A robots.txt network error is Unable to Verify, not Fail; only HTTP 5xx counts as disallow-all.

## Phase 4 requirements (from the brief)

- Send page text in chunks with a strict JSON output schema; each judgement returns a status plus quoted evidence.
- **Verify every quote appears verbatim in the page text**; reject and retry on invalid output (`config.llm.maxRetriesOnInvalidOutput`), else Unable to Verify.
- Cap tokens per audit (`config.llm.maxTokensPerAudit`) and log cost per call into `audit.costs`.
- Code computes the score, never the LLM.
- Keys are optional: missing `ANTHROPIC_API_KEY` → "Not checked: ANTHROPIC_API_KEY not configured" (already wired via `requires` in the catalogue).
- Use the official `@anthropic-ai/sdk`.
- Category 9 prompt generation (Phase 5): prompts must never contain the brand name; unit-test that.
