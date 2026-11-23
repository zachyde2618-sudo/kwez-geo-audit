/** Show a URL as its path when it's on the audited site, otherwise without the scheme. */
export function relPathOrUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search === "/" ? u.hostname.replace(/^www\./, "") + "/" : u.pathname + u.search;
  } catch {
    return url;
  }
}

/** "22 Nov 2026 at 14:09" (UK time zone, so server and browser agree). */
export function auditedOn(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `${date} at ${time}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
