import { createRequire } from "node:module";
import { config } from "@/config";
import { assertPublicTarget } from "./fetcher";
import { normaliseSpace, wordCount } from "./extract";
import type { RenderComparison } from "./types";

type Browser = { newPage(o?: object): Promise<Page>; close(): Promise<void> };
type Route = { request(): { url(): string }; abort(): Promise<void>; continue(): Promise<void> };
type Page = {
  route(pattern: string, handler: (r: Route) => Promise<void>): Promise<void>;
  goto(url: string, o?: object): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  close(): Promise<void>;
};

/** Load Playwright lazily so the app works when it isn't installed. */
function loadPlaywright(): { chromium: { launch(o?: object): Promise<Browser> } } | null {
  try {
    const req = createRequire(`${process.cwd()}/package.json`);
    const name = "playwright";
    return req(name);
  } catch {
    return null;
  }
}

const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []));

/**
 * Render pages in headless Chromium and measure how much of the main content only
 * exists after JavaScript runs. Returns null with a reason when Playwright is off/missing.
 */
export async function compareRendered(
  pages: { url: string; rawMainText: string }[],
  signal: AbortSignal,
): Promise<{ results: RenderComparison[] | null; reason?: string }> {
  if (!config.crawler.enablePlaywright) return { results: null, reason: "ENABLE_PLAYWRIGHT is not set to true" };
  const pw = loadPlaywright();
  if (!pw) return { results: null, reason: "Playwright is not installed (npm i -D playwright && npx playwright install chromium)" };

  let browser: Browser | null = null;
  const results: RenderComparison[] = [];
  try {
    browser = await pw.chromium.launch();
    for (const p of pages) {
      signal.throwIfAborted();
      const page = await browser.newPage({ userAgent: config.crawler.userAgent });
      try {
        // The browser fetches scripts, images and frames on its own, so every request it makes
        // passes the same private-address guard as the crawler (and only web protocols).
        await page.route("**/*", async (route) => {
          let ok = false;
          try {
            const u = new URL(route.request().url());
            if (u.protocol === "data:" || u.protocol === "blob:") ok = true;
            else {
              await assertPublicTarget(u);
              ok = true;
            }
          } catch {
            ok = false;
          }
          await (ok ? route.continue() : route.abort()).catch(() => {});
        });
        await page.goto(p.url, { waitUntil: "networkidle", timeout: config.crawler.requestTimeoutMs * 2 });
        const rendered = await page.evaluate(() => {
          const root = document.querySelector("main") ?? document.querySelector("article") ?? document.body;
          const clone = root.cloneNode(true) as HTMLElement;
          if (root === document.body) clone.querySelectorAll("header, nav, footer, aside").forEach((n) => n.remove());
          clone.querySelectorAll("script, style, noscript, template, svg").forEach((n) => n.remove());
          return clone.innerText ?? clone.textContent ?? "";
        });
        const renderedText = normaliseSpace(rendered);
        const raw = words(p.rawMainText);
        const rend = [...words(renderedText)];
        const missing = rend.filter((w) => !raw.has(w));
        results.push({
          url: p.url,
          rawWords: wordCount(p.rawMainText),
          renderedWords: wordCount(renderedText),
          jsOnlyShare: rend.length ? missing.length / rend.length : 0,
          sample: missing.slice(0, 25).join(" "),
        });
      } catch (e) {
        results.push({ url: p.url, rawWords: wordCount(p.rawMainText), renderedWords: 0, jsOnlyShare: 0, sample: "", error: (e as Error).message.slice(0, 200) });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } catch (e) {
    if (signal.aborted) throw e;
    return { results: null, reason: `Playwright failed to start: ${(e as Error).message.slice(0, 200)}` };
  } finally {
    await browser?.close().catch(() => {});
  }
  return { results };
}
