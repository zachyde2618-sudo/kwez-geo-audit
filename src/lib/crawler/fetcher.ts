import { promises as dns } from "node:dns";
import net from "node:net";
import { config } from "@/config";
import { isLocalHost } from "@/lib/schemas/input";
import type { FetchResult } from "./types";

/**
 * Polite fetcher:
 *  - KwezGEOAudit/1.0 user agent (overridable only for bot probes)
 *  - at most one request per second per host
 *  - 15 s timeout, capped body size
 *  - redirects followed manually, every hop checked against private addresses (SSRF guard)
 */

const g = globalThis as unknown as { __kwezHostQueue?: Map<string, Promise<void>> };
const hostQueue: Map<string, Promise<void>> = (g.__kwezHostQueue ??= new Map());

function minIntervalFor(host: string): number {
  // Tests against a local fixture may run faster; real sites always get 1 req/s.
  const override = Number(process.env.CRAWL_MIN_INTERVAL_MS);
  if (isLocalHost(host) && Number.isFinite(override) && override >= 0) return override;
  return config.crawler.minIntervalMsPerDomain;
}

/** Wait for this host's slot. Requests to one host are serialised and spaced out. */
async function acquireSlot(host: string, signal?: AbortSignal): Promise<void> {
  const prev = hostQueue.get(host) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  hostQueue.set(host, prev.then(() => next));
  await prev;
  if (signal?.aborted) {
    // Pass the slot on before bailing out. Throwing without releasing left the queue for this
    // host stuck forever, so every later request to it (new audits, prefill) hung after a cancel.
    release();
    signal.throwIfAborted();
  }
  setTimeout(release, minIntervalFor(host));
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

export class BlockedTargetError extends Error {}

async function assertPublicTarget(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedTargetError(`Unsupported protocol ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allowLocal = config.crawler.allowLocalTargets;
  if (isLocalHost(host)) {
    if (allowLocal) return;
    throw new BlockedTargetError(`Refusing to fetch private address ${host}`);
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host) && !allowLocal) throw new BlockedTargetError(`Refusing to fetch private address ${host}`);
    return;
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!allowLocal && addrs.some((a) => isPrivateIp(a.address))) throw new BlockedTargetError(`${host} resolves to a private address`);
  } catch (e) {
    if (e instanceof BlockedTargetError) throw e;
    // Behind an HTTPS proxy local DNS may be unavailable; the proxy resolves instead.
    if (!process.env.HTTPS_PROXY && !process.env.https_proxy) throw new Error(`Could not resolve ${host}`);
  }
}

export interface FetchOptions {
  userAgent?: string;
  method?: "GET" | "HEAD";
  signal?: AbortSignal;
  maxBytes?: number;
  accept?: string;
}

export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? config.crawler.maxBodyBytes;
  const redirects: string[] = [];
  let current = new URL(url);
  const base: Omit<FetchResult, "finalUrl" | "status"> = {
    url,
    headers: {},
    bytes: 0,
    truncated: false,
    ttfbMs: 0,
    contentType: "",
    body: Buffer.alloc(0),
    redirects,
  };

  for (let hop = 0; hop <= config.crawler.maxRedirects; hop++) {
    try {
      await assertPublicTarget(current);
    } catch (e) {
      return { ...base, finalUrl: current.toString(), status: 0, error: (e as Error).message };
    }
    await acquireSlot(current.host, opts.signal);

    const timeout = AbortSignal.timeout(config.crawler.requestTimeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(current, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": opts.userAgent ?? config.crawler.userAgent,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });
    } catch (e) {
      opts.signal?.throwIfAborted();
      const err = e as Error & { cause?: { code?: string } };
      const msg = timeout.aborted ? `Timed out after ${config.crawler.requestTimeoutMs / 1000}s` : err.cause?.code ?? err.message;
      return { ...base, finalUrl: current.toString(), status: 0, error: msg };
    }
    const ttfbMs = Math.round(performance.now() - started);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

    if (res.status >= 300 && res.status < 400 && headers.location) {
      await res.body?.cancel().catch(() => {});
      redirects.push(`${res.status} ${current.toString()}`);
      current = new URL(headers.location, current);
      continue;
    }

    const { body, bytes, truncated } = await readCapped(res, maxBytes, opts.signal);
    return {
      ...base,
      finalUrl: current.toString(),
      status: res.status,
      headers,
      bytes,
      truncated,
      ttfbMs,
      contentType: (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(),
      body,
    };
  }
  return { ...base, finalUrl: current.toString(), status: 0, error: "Too many redirects" };
}

async function readCapped(res: Response, maxBytes: number, signal?: AbortSignal): Promise<{ body: Buffer; bytes: number; truncated: boolean }> {
  if (!res.body) return { body: Buffer.alloc(0), bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        truncated = true;
        chunks.push(Buffer.from(value.subarray(0, value.byteLength - (bytes - maxBytes))));
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(Buffer.from(value));
    }
  } catch (e) {
    signal?.throwIfAborted();
    truncated = true;
    void e;
  }
  return { body: Buffer.concat(chunks), bytes: truncated ? Math.max(bytes, maxBytes) : bytes, truncated };
}

/** Decode a body as text using the declared charset (UTF-8 default). */
export function bodyText(r: FetchResult): string {
  const m = /charset=([^;]+)/i.exec(r.headers["content-type"] ?? "");
  const charset = m?.[1]?.trim().toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(r.body);
  } catch {
    return new TextDecoder("utf-8").decode(r.body);
  }
}
