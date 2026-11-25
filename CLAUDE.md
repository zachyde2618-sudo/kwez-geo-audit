# Kwez GEO Audit

@AGENTS.md

A web app that audits how visible a small business's website is to AI assistants (ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews): 72 checks in 9 categories, a 0–100 score, evidence for every finding, and a prioritised to-do list. Built for **Kwez** (Generative Engine Optimisation for UK businesses), who plan to sell audits, website fixes, rebuilds and monthly retainers to small businesses.

Detailed design decisions and how the AI review works: **`BUILD_NOTES.md`** (read it before changing checks, scoring or the AI stages).

## Working with the owner

- The owner is not a developer. Explain in plain English, give **one command per code block**, say which terminal to run it in, and never tell them to paste keys into chat.
- They run the app in a **GitHub Codespace on the `phase-4-llm-checks` branch** (all current work is on that branch; `main` is old). Deliver work by committing and pushing to that branch, then tell them to `git pull` and restart the app.
- Common trip-ups seen before: pressing Ctrl+C right after starting the app (it stops it); typing commands into the terminal that is running the app; a second old dev server still on port 3000; a stale `.next` cache serving old CSS (`rm -rf .next`); a new codespace opening on `main`; the codespace secret for the Anthropic key saved as `NAME=value` (the app now strips that).
- `.devcontainer/devcontainer.json` installs packages and starts the app automatically when the codespace opens.

## Run and test

- `npm install`, then `ALLOW_LOCAL_TARGETS=true npm run dev` (port 3000). Keep that terminal running.
- Test site: `npm run fixture` (port 4010), then audit `http://localhost:4010`.
- `npm test` (Vitest, ~185 tests, no network: fake transports for Claude and search), `npm run lint`, `npm run typecheck` (the two `PageProps`/`LayoutProps` errors are Next-generated types and appear until `next dev` has run once).
- All tests must pass before pushing.

## Keys and settings (env vars, all optional)

- `ANTHROPIC_API_KEY` (falls back to `KWEZ_ANTHROPIC_API_KEY`; pasted `NAME=`, quotes and `Bearer ` are stripped): AI site review, external judgements, AI visibility tests.
- `SEARCH_API_KEY` + `SEARCH_API_PROVIDER=serper|brave`: web search stage. Serper's free plan rejects a **quoted** web address in a query.
- `AI_TOKEN_BUDGET` (default 1,000,000 per audit), `EXTERNAL_FETCH_PAGES` (default 6), `ENABLE_PLAYWRIGHT=true` (check 1.5), `ALLOW_LOCAL_TARGETS=true` (local/fixture audits only), `AUDITS_DIR`, `CACHE_DIR`, model overrides `ANTHROPIC_JUDGE_MODEL` / `ANTHROPIC_VISIBILITY_MODEL`.
- **All model IDs, endpoints, prices and limits live in `src/config.ts` only.**
- In Claude Code cloud sessions, Node's `fetch` only reaches the internet through the proxy: start the app with `NODE_USE_ENV_PROXY=1`. Not needed in the codespace.

## How an audit runs (`src/lib/pipeline.ts`)

1. **Crawl** (`src/lib/crawler/`): robots.txt and sitemap, then pages picked by `planNext` in `crawl.ts`: one of each must-have kind (about, FAQ, services, product, team, contact, reviews, case study) first, then shared by weight with a cap per kind (`ROLE_PLAN`). Page kinds come from `classifyRole` in `extract.ts` (Shopify-aware). Images, scripts and stylesheets each get their own share of the asset-measuring budget.
2. **AI site review** (`src/lib/llm/review.ts`, rubrics in `rubrics.ts`): Claude judges page text in chunks; every quote is verified verbatim. Groups' part 1s run before any part 2s.
3. **Web search** (`src/lib/external/`): ~6–12 Serper/Brave searches (cached 24h), results classified by Claude (about this business? review site, directory, press, award, ranking…), a few third-party pages fetched politely; AI judgements for 9.5, 9.7, 9.9, 9.14 (`src/lib/llm/external.ts`).
4. **AI visibility** (`src/lib/visibility/run.ts`, on by default, 10 questions): Claude with web search (`web_search_20260209`, told to search first) answers questions a new customer would ask (never naming the business); a second pass records who was named. With dynamic filtering there are no citations, so the search results are the sources.
5. **Checks** (`src/lib/checks/catN.ts`, metadata in `catalogue.ts`, rules in `registry.ts`'s `finaliseResult`), then **scoring** (`src/lib/scoring.ts`): code computes the score, never the model. Checks with no implementation are left out of coverage (`notInBuild`).

Other parts: past audits with favourites/delete/run again (`src/lib/storage.ts`, `src/components/PastAudits.tsx`; favourites in `data/audits/_favourites.json`), paste-box parser (`src/lib/paste.ts`), branding (`src/components/Brand.tsx`, tokens in `globals.css`).

## Rules to keep

- Every finding needs evidence; no evidence means Unable to Verify. Partial only where the catalogue allows it.
- A site with no FAQ fails the FAQ content checks (2.3, 2.4, 4.2, 4.3, 4.4); 2.7 stays Unable to Verify.
- Failing checks must carry a plain-English `requiredChange` (category 9 fixes are in `FIXES` in `cat9.ts`).
- Visibility questions must never contain the business name or website (validated and retried).
- Never scrape LinkedIn or Google Business Profiles. Audit data in `data/` stays out of git.
- Use the official `@anthropic-ai/sdk` for Claude; keep Claude on its direct connection (no third-party gateways).

## Not built yet / ideas agreed

- Check 2.1 (page speed, needs a free Google PageSpeed API key) is the only unimplemented check.
- ChatGPT, Perplexity and Gemini in the visibility tests (each needs its own API key; give each provider a configurable base URL).
- A client-ready report (branded PDF or share link), proper hosting off the codespace, and merging `phase-4-llm-checks` into `main`.
