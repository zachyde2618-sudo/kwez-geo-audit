import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots, robotsFromStatus } from "@/lib/crawler/robots";

const allowed = (txt: string, agent: string, path: string) => isAllowed(parseRobots(txt), agent, path).allowed;

describe("robots.txt parsing", () => {
  it("allows everything with an empty file", () => {
    expect(allowed("", "GPTBot", "/")).toBe(true);
  });

  it("blocks a specific agent and leaves others alone", () => {
    const txt = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /";
    expect(allowed(txt, "GPTBot", "/about")).toBe(false);
    expect(allowed(txt, "ClaudeBot", "/about")).toBe(true);
  });

  it("matches agent tokens case-insensitively", () => {
    expect(allowed("user-agent: gptbot\ndisallow: /", "GPTBot", "/")).toBe(false);
    expect(allowed("USER-AGENT: GPTBOT\nDISALLOW: /", "GPTBot", "/")).toBe(false);
  });

  it("uses the specific group instead of * (not both)", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: PerplexityBot\nAllow: /";
    expect(allowed(txt, "PerplexityBot", "/x")).toBe(true);
    expect(allowed(txt, "GPTBot", "/x")).toBe(false);
  });

  it("does not treat a token as a prefix of a longer token", () => {
    // Googlebot rules must not apply to Google-Extended, and vice versa.
    const txt = "User-agent: Googlebot\nDisallow: /private\n\nUser-agent: Google-Extended\nDisallow: /";
    expect(allowed(txt, "Googlebot", "/")).toBe(true);
    expect(allowed(txt, "Google-Extended", "/")).toBe(false);
    expect(allowed(txt, "Googlebot", "/private/a")).toBe(false);
  });

  it("applies one rule set to several user-agent lines in a group", () => {
    const txt = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n";
    expect(allowed(txt, "GPTBot", "/")).toBe(false);
    expect(allowed(txt, "CCBot", "/")).toBe(false);
    expect(allowed(txt, "ClaudeBot", "/")).toBe(true);
  });

  it("merges separate groups for the same agent", () => {
    const txt = "User-agent: ClaudeBot\nDisallow: /a\n\nUser-agent: ClaudeBot\nDisallow: /b";
    expect(allowed(txt, "ClaudeBot", "/a")).toBe(false);
    expect(allowed(txt, "ClaudeBot", "/b")).toBe(false);
    expect(allowed(txt, "ClaudeBot", "/c")).toBe(true);
  });

  it("supports * wildcards", () => {
    const txt = "User-agent: *\nDisallow: /*.pdf\nDisallow: /search*q=";
    expect(allowed(txt, "Bingbot", "/files/report.pdf")).toBe(false);
    expect(allowed(txt, "Bingbot", "/files/report.pdf?x=1")).toBe(false);
    expect(allowed(txt, "Bingbot", "/search?q=test")).toBe(false);
    expect(allowed(txt, "Bingbot", "/search")).toBe(true);
  });

  it("supports $ end anchors", () => {
    const txt = "User-agent: *\nDisallow: /*.pdf$";
    expect(allowed(txt, "Bingbot", "/report.pdf")).toBe(false);
    expect(allowed(txt, "Bingbot", "/report.pdf?download=1")).toBe(true);
  });

  it("lets the longest matching rule win", () => {
    const txt = "User-agent: *\nDisallow: /blog\nAllow: /blog/public";
    expect(allowed(txt, "GPTBot", "/blog/private")).toBe(false);
    expect(allowed(txt, "GPTBot", "/blog/public/post")).toBe(true);
  });

  it("lets Allow win a tie of equal length", () => {
    const txt = "User-agent: *\nDisallow: /page\nAllow: /page";
    expect(allowed(txt, "GPTBot", "/page")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(allowed("User-agent: GPTBot\nDisallow:\n", "GPTBot", "/anything")).toBe(true);
  });

  it("ignores comments, blank lines and a BOM, and collects sitemaps", () => {
    const r = parseRobots("﻿# hello\nUser-agent: * # everyone\n\nDisallow: /tmp # temp\nSitemap: https://ex.co.uk/sitemap.xml\n");
    expect(isAllowed(r, "GPTBot", "/tmp/x").allowed).toBe(false);
    expect(r.sitemaps).toEqual(["https://ex.co.uk/sitemap.xml"]);
  });

  it("ignores rules before any user-agent line", () => {
    expect(allowed("Disallow: /\nUser-agent: *\nAllow: /", "GPTBot", "/")).toBe(true);
  });

  it("is not case-insensitive for paths", () => {
    const txt = "User-agent: *\nDisallow: /Admin";
    expect(allowed(txt, "GPTBot", "/Admin")).toBe(false);
    expect(allowed(txt, "GPTBot", "/admin")).toBe(true);
  });

  it("normalises percent-encoded unreserved characters", () => {
    expect(allowed("User-agent: *\nDisallow: /~joe", "GPTBot", "/%7Ejoe/page")).toBe(false);
  });

  it("always allows /robots.txt", () => {
    expect(allowed("User-agent: *\nDisallow: /", "GPTBot", "/robots.txt")).toBe(true);
  });

  it("follows RFC 9309 for unavailable files: 4xx allow-all, 5xx disallow-all", () => {
    expect(isAllowed(robotsFromStatus(404, ""), "GPTBot", "/").allowed).toBe(true);
    expect(isAllowed(robotsFromStatus(503, ""), "GPTBot", "/").allowed).toBe(false);
    expect(isAllowed(robotsFromStatus(0, ""), "GPTBot", "/").allowed).toBe(false);
  });

  it("keeps a group open across a Sitemap line", () => {
    const txt = "User-agent: GPTBot\nSitemap: https://x.co.uk/s.xml\nDisallow: /";
    expect(allowed(txt, "GPTBot", "/")).toBe(false);
  });
});
