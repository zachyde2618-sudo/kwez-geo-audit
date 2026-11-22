/**
 * robots.txt parser following RFC 9309 (and Google's documented behaviour):
 *  - groups start with one or more user-agent lines; rules apply to every agent in the group
 *  - agents match their product token case-insensitively; all groups for the same agent merge
 *  - if no group names the agent, the `*` groups apply
 *  - `*` matches any sequence, `$` anchors the end
 *  - the longest matching rule wins; on a tie, Allow wins
 *  - an empty Disallow means nothing is blocked
 *  - robots.txt 4xx ⇒ everything allowed; 5xx/unreachable ⇒ everything disallowed
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
}

export interface RobotsTxt {
  /** "parsed" for a 2xx file, "allow-all" for 4xx, "disallow-all" for 5xx/unreachable. */
  mode: "parsed" | "allow-all" | "disallow-all";
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function parseRobots(body: string): RobotsTxt {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  const lines = body.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const idx = line.indexOf(":");
    if (idx < 0) return;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent" || key === "useragent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      return;
    }
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      return; // sitemap lines don't end a group
    }
    lastWasAgent = false;
    if (!current) return; // rules before any user-agent are ignored
    if (key === "allow" || key === "disallow") {
      if (key === "disallow" && value === "") return; // empty disallow = no restriction
      current.rules.push({ allow: key === "allow", path: value, line: i + 1 });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  });

  return { mode: "parsed", groups, sitemaps };
}

export function robotsFromStatus(status: number, body: string): RobotsTxt {
  if (status >= 200 && status < 300) return parseRobots(body);
  if (status >= 400 && status < 500) return { mode: "allow-all", groups: [], sitemaps: [] };
  return { mode: "disallow-all", groups: [], sitemaps: [] };
}

/** The groups that apply to an agent's product token (e.g. "GPTBot"). */
export function groupsFor(robots: RobotsTxt, agent: string): { groups: RobotsGroup[]; matchedAgent: string | null } {
  const token = agent.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.includes(token));
  if (specific.length) return { groups: specific, matchedAgent: agent };
  const star = robots.groups.filter((g) => g.agents.includes("*"));
  return { groups: star, matchedAgent: star.length ? "*" : null };
}

/** Convert a robots path pattern to a RegExp anchored at the start. */
function patternToRegex(pattern: string): RegExp {
  let p = pattern;
  const anchored = p.endsWith("$");
  if (anchored) p = p.slice(0, -1);
  const escaped = p
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

function normalisePath(p: string): string {
  // Decode unreserved percent-encodings so "/%7Ejoe" and "/~joe" compare equal.
  try {
    return p.replace(/%([0-9A-Fa-f]{2})/g, (m, h) => {
      const ch = String.fromCharCode(parseInt(h, 16));
      return /[A-Za-z0-9\-._~]/.test(ch) ? ch : m.toUpperCase();
    });
  } catch {
    return p;
  }
}

export interface RobotsDecision {
  allowed: boolean;
  /** The rule that decided it, or null if no rule matched. */
  rule: RobotsRule | null;
  matchedAgent: string | null;
}

/** Is `pathWithQuery` (e.g. "/about?x=1") allowed for `agent`? */
export function isAllowed(robots: RobotsTxt, agent: string, pathWithQuery: string): RobotsDecision {
  if (robots.mode === "allow-all") return { allowed: true, rule: null, matchedAgent: null };
  if (robots.mode === "disallow-all") return { allowed: false, rule: null, matchedAgent: null };
  const path = normalisePath(pathWithQuery || "/");
  if (path === "/robots.txt") return { allowed: true, rule: null, matchedAgent: null };

  const { groups, matchedAgent } = groupsFor(robots, agent);
  let best: RobotsRule | null = null;
  for (const g of groups) {
    for (const r of g.rules) {
      if (!patternToRegex(normalisePath(r.path)).test(path)) continue;
      if (
        !best ||
        r.path.length > best.path.length ||
        (r.path.length === best.path.length && r.allow && !best.allow)
      ) {
        best = r;
      }
    }
  }
  return { allowed: best ? best.allow : true, rule: best, matchedAgent };
}

export function pathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** Human-readable explanation of a decision, for evidence. */
export function describeDecision(agent: string, path: string, d: RobotsDecision): string {
  if (!d.rule) return `${agent} → ${path}: ${d.allowed ? "allowed (no matching rule)" : "blocked (robots.txt unavailable, treated as disallow-all)"}`;
  return `${agent} → ${path}: ${d.allowed ? "allowed" : "blocked"} by "${d.rule.allow ? "Allow" : "Disallow"}: ${d.rule.path}" (line ${d.rule.line}, group "${d.matchedAgent}")`;
}
