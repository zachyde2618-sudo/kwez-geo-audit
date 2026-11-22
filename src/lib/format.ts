/** Show a URL as its path when it's on the audited site, otherwise without the scheme. */
export function relPathOrUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search === "/" ? u.hostname.replace(/^www\./, "") + "/" : u.pathname + u.search;
  } catch {
    return url;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
