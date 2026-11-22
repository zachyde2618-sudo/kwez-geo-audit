import { z } from "zod";

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?|169\.254\.)/i;

export function isLocalHost(hostname: string): boolean {
  return PRIVATE_HOST.test(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal");
}

/**
 * Normalise a user-entered website to an https URL. Returns null if invalid.
 * http is only kept for local hosts when allowLocal is true (fixture tests).
 */
export function normaliseWebsiteUrl(raw: string, allowLocal = false): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const local = isLocalHost(host);
  if (local && !allowLocal) return null;
  if (!local && (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host))) return null;
  if (!local) u.protocol = "https:";
  u.hash = "";
  u.hostname = host;
  return u.toString();
}

/** Lenient optional URL: blank → undefined; otherwise must parse (https assumed). */
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (!u.hostname.includes(".")) throw new Error();
      return u.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a full web address, e.g. https://example.co.uk" });
      return z.NEVER;
    }
  });

const urlList = z.array(optionalUrl).default([]).transform((a) => a.filter((x): x is string => !!x));

export const PersonInput = z
  .object({
    fullName: z.string().trim().min(2, "Enter the person's full name").max(120),
    jobTitle: z.string().trim().max(120).optional().default(""),
    linkedinUrl: optionalUrl.refine(
      (v) => !v || /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|pub)\//i.test(v),
      "Use a LinkedIn profile address like https://www.linkedin.com/in/name",
    ),
    otherUrls: urlList,
  });
export type PersonInput = z.infer<typeof PersonInput>;

export const CompetitorInput = z.object({
  name: z.string().trim().min(1, "Enter the competitor's name").max(120),
  url: optionalUrl,
});

export const makeAuditInputSchema = (allowLocal: boolean) => z.object({
  url: z.string().superRefine((v, ctx) => {
    if (!normaliseWebsiteUrl(v, allowLocal)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid public website address, e.g. example.co.uk" });
    }
  }),
  companyName: z.string().trim().max(120).optional().default(""),
  industry: z.string().trim().max(120).optional().default(""),
  town: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(80).optional().default("United Kingdom"),
  services: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  exampleQuestions: z
    .array(z.string().trim().min(5, "Questions should be at least a few words").max(300))
    .max(10, "Add at most 10 example questions")
    .default([]),
  competitors: z.array(CompetitorInput).max(5, "Add at most 5 competitors").default([]),
  people: z.array(PersonInput).max(5, "Add at most 5 people").default([]),
  identity: z
    .object({
      companiesHouseNumber: z
        .string()
        .trim()
        .toUpperCase()
        .optional()
        .transform((v) => (v ? v.replace(/\s+/g, "").padStart(8, "0") : undefined))
        .refine((v) => !v || /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(v), "Companies House numbers are 8 characters, e.g. 01234567 or SC123456"),
      googleBusinessProfileUrl: optionalUrl,
      reviewUrls: urlList,
      socialUrls: urlList,
      pressUrls: urlList,
    })
    .prefault({}),
  options: z
    .object({
      maxPages: z.coerce.number().int().min(1).max(100).default(25),
      runVisibility: z.boolean().default(false),
      promptCount: z.coerce.number().int().min(1).max(100).default(20),
    })
    .prefault({}),
});
type Schema = ReturnType<typeof makeAuditInputSchema>;
export type AuditInputRaw = z.input<Schema>;
export type AuditInput = z.infer<Schema>;

/** Parse and normalise. Throws ZodError on invalid input. */
export function parseAuditInput(raw: unknown, allowLocal = false): AuditInput {
  const parsed = makeAuditInputSchema(allowLocal).parse(raw);
  const url = normaliseWebsiteUrl(parsed.url, allowLocal)!;
  return { ...parsed, url };
}

/** Split a comma-separated string into trimmed non-empty values. */
export function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
