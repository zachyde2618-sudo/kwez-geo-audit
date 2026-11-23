import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config, getKey } from "@/config";

/**
 * Web search for the external checks (category 9, 6.2). Serper (Google results) or Brave,
 * chosen by SEARCH_API_PROVIDER. Results are cached on disk for config.visibility.cacheHours
 * so re-running an audit doesn't spend credits again.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Star rating shown in the search result, when the engine reports one (review sites). */
  rating?: number;
  ratingCount?: number;
  date?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /** True when served from the local cache (no credit spent). */
  cached: boolean;
  provider: "serper" | "brave";
}

export interface SearchRequest {
  query: string;
  /** Two-letter country for localised results, e.g. "gb". */
  country: string;
  signal: AbortSignal;
}

export type SearchTransport = (req: SearchRequest, provider: "serper" | "brave", key: string) => Promise<SearchResult[]>;

let transportOverride: SearchTransport | null = null;
/** Tests inject a fake transport so no network calls are made. Pass null to restore. */
export function setSearchTransportForTests(t: SearchTransport | null) {
  transportOverride = t;
}

const TIMEOUT_MS = 20_000;

async function httpTransport(req: SearchRequest, provider: "serper" | "brave", key: string): Promise<SearchResult[]> {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  if (provider === "serper") {
    const res = await fetch(config.search.endpoints.serper, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: req.query, gl: req.country === "gb" ? "uk" : req.country, hl: "en", num: config.search.resultsPerQuery }),
      signal,
    });
    if (!res.ok) {
      const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message;
      throw new Error(`Serper returned ${res.status}${msg ? `: ${msg}` : ""}${res.status === 401 || res.status === 403 ? " (check SEARCH_API_KEY)" : ""}`);
    }
    const data = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string; rating?: number; ratingCount?: number; date?: string }[] };
    return (data.organic ?? [])
      .filter((r) => r.link && r.title)
      .map((r) => ({ title: r.title!, url: r.link!, snippet: r.snippet ?? "", rating: r.rating, ratingCount: r.ratingCount, date: r.date }));
  }
  const url = new URL(config.search.endpoints.brave);
  url.searchParams.set("q", req.query);
  url.searchParams.set("count", String(config.search.resultsPerQuery));
  url.searchParams.set("country", req.country.toUpperCase());
  const res = await fetch(url, { headers: { "X-Subscription-Token": key, Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Brave Search returned ${res.status}${res.status === 401 || res.status === 403 ? " (check SEARCH_API_KEY)" : ""}`);
  const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string; age?: string }[] } };
  return (data.web?.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({ title: stripTags(r.title!), url: r.url!, snippet: stripTags(r.description ?? ""), date: r.age }));
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

function cachePath(provider: string, req: SearchRequest): string {
  const hash = createHash("sha256").update(`${provider}\n${req.country}\n${req.query}`).digest("hex").slice(0, 32);
  return path.join(config.storage.cacheDir, "search", `${hash}.json`);
}

export async function webSearch(req: SearchRequest): Promise<SearchResponse> {
  const key = getKey("SEARCH_API_KEY");
  if (!key) throw new Error("SEARCH_API_KEY not configured");
  const provider = config.search.provider;
  const file = cachePath(provider, req);
  try {
    const hit = JSON.parse(await readFile(file, "utf8")) as { at: number; results: SearchResult[] };
    if (Date.now() - hit.at < config.visibility.cacheHours * 3_600_000) return { query: req.query, results: hit.results, cached: true, provider };
  } catch {
    // no cache entry
  }
  const results = await (transportOverride ?? httpTransport)(req, provider, key);
  await mkdir(path.dirname(file), { recursive: true }).catch(() => {});
  await writeFile(file, JSON.stringify({ at: Date.now(), query: req.query, results })).catch(() => {});
  return { query: req.query, results, cached: false, provider };
}
