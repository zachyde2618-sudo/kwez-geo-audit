import { config } from "@/config";

/**
 * Small in-memory limits for the API. The app runs as one long-lived Node server, so memory is
 * enough; a restart simply resets the counters.
 */

const g = globalThis as unknown as { __kwezHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__kwezHits ??= new Map());

/**
 * Sliding-window limiter. Returns 0 when the action may go ahead (and records it), otherwise the
 * number of seconds until it may be tried again.
 */
export function takeToken(bucket: string, limit: number, windowMs: number, now = Date.now()): number {
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(bucket, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(bucket, recent);
  if (hits.size > 5_000) {
    // Forget idle visitors so the map can't grow without bound.
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3_600_000) hits.delete(k);
  }
  return 0;
}

/** Test helper. */
export function resetLimitsForTests(): void {
  hits.clear();
}

/** Best-effort visitor key. Behind a proxy the left-most forwarded address is the visitor. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

export function tooMany(message: string, retryAfterSeconds: number): Response {
  return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}

export class BodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Read a JSON request body with a size cap, and only as JSON. Requiring the JSON content type
 * also stops another website quietly submitting a plain HTML form to this API.
 */
export async function readJsonBody(req: Request, maxBytes = config.security.maxBodyBytes): Promise<unknown> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new BodyError("Request body must be JSON", 415);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyError("Request is too large", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new BodyError("Request body must be JSON", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyError("Request is too large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError("Request body must be JSON", 400);
  }
}

export function bodyErrorResponse(e: BodyError): Response {
  return Response.json({ error: e.message }, { status: e.status });
}
