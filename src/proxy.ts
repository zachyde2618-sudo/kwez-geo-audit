import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page and API request (static files excluded by the matcher):
 *
 *  1. Optional password (APP_PASSWORD, with APP_USERNAME, default "kwez"): the browser's own
 *     sign-in box. Repeated wrong passwords from one address are slowed down.
 *  2. Cross-site request guard: another website can't make a signed-in browser start, delete or
 *     change audits here.
 *  3. A strict Content Security Policy with a fresh nonce per page, so injected scripts can't run.
 *
 * Other security headers that also apply to static files are set in next.config.ts.
 */

const isDev = process.env.NODE_ENV === "development";

const failures = new Map<string, { count: number; first: number }>();
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60_000;

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Compare two strings in time that doesn't depend on where they differ. */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function checkPassword(req: NextRequest): NextResponse | null {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return null;
  const username = process.env.APP_USERNAME?.trim() || "kwez";
  const who = clientKey(req);
  const now = Date.now();
  const f = failures.get(who);
  if (f && now - f.first > FAIL_WINDOW_MS) failures.delete(who);
  const recent = failures.get(who);
  if (recent && recent.count >= FAIL_LIMIT) {
    return new NextResponse("Too many wrong passwords. Try again in 15 minutes.", { status: 429, headers: { "Retry-After": "900" } });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6).trim());
    } catch {
      decoded = "";
    }
    const i = decoded.indexOf(":");
    const user = i >= 0 ? decoded.slice(0, i) : "";
    const pass = i >= 0 ? decoded.slice(i + 1) : "";
    // Evaluate both so a wrong username takes as long as a wrong password.
    const okUser = sameText(user, username);
    const okPass = sameText(pass, password);
    if (okUser && okPass) {
      failures.delete(who);
      return null;
    }
    const entry = failures.get(who) ?? { count: 0, first: now };
    entry.count++;
    failures.set(who, entry);
    if (failures.size > 5_000) failures.clear();
  }
  return new NextResponse("Sign in to use the Kwez GEO Audit.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Kwez GEO Audit", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Refuse state-changing requests that a browser says came from another site. */
function checkSameOrigin(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;
  const site = req.headers.get("sec-fetch-site");
  const forbidden = () => NextResponse.json({ error: "This request came from another website and was refused." }, { status: 403 });
  if (site) return site === "same-origin" || site === "none" ? null : forbidden();
  // Older browsers: fall back to comparing the Origin header with the host the browser used.
  const origin = req.headers.get("origin");
  if (!origin) return null; // not a browser (curl, scripts); the password still applies
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return forbidden();
  }
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "";
  return originHost === host ? null : forbidden();
}

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React style attributes (the score dial, bars) need inline styles; scripts stay locked down.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const blocked = checkPassword(req) ?? checkSameOrigin(req);
  if (blocked) return blocked;

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // Everything except Next's static build files and the favicon. Brand images in /brand stay
    // public so a sign-in page or a shared link preview can still show the logo.
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
