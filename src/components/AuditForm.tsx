"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { PASTE_FIELD_LABELS, PASTE_TEMPLATE, parsePastedDetails } from "@/lib/paste";
import { EyeLoader } from "./Brand";
import { makeAuditInputSchema, splitList } from "@/lib/schemas/input";

interface Person { fullName: string; jobTitle: string; linkedinUrl: string; otherUrls: string }
interface Competitor { name: string; url: string }

const emptyPerson = (): Person => ({ fullName: "", jobTitle: "", linkedinUrl: "", otherUrls: "" });
const emptyCompetitor = (): Competitor => ({ name: "", url: "" });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

type Errors = Record<string, string>;

export function AuditForm({ allowLocal, keysConfigured }: { allowLocal: boolean; keysConfigured: string[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [town, setTown] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [services, setServices] = useState("");
  const [questions, setQuestions] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [chNumber, setChNumber] = useState("");
  const [gbpUrl, setGbpUrl] = useState("");
  const [reviewUrls, setReviewUrls] = useState("");
  const [socialUrls, setSocialUrls] = useState("");
  const [pressUrls, setPressUrls] = useState("");
  const [maxPages, setMaxPages] = useState("25");
  const [runVisibility, setRunVisibility] = useState(false);
  const [promptCount, setPromptCount] = useState("20");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [prefilling, setPrefilling] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [prefillError, setPrefillError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteReport, setPasteReport] = useState<{ filled: string[]; unrecognised: string[] } | null>(null);
  const [templateCopied, setTemplateCopied] = useState(false);

  /** Fill the form from pasted text. Pasted values replace what's in those boxes; others are left alone. */
  function applyPaste() {
    const { details: d, filled, unrecognised } = parsePastedDetails(pasteText);
    if (d.url !== undefined) setUrl(d.url);
    if (d.companyName !== undefined) setCompanyName(d.companyName);
    if (d.industry !== undefined) setIndustry(d.industry);
    if (d.town !== undefined) setTown(d.town);
    if (d.country !== undefined) setCountry(d.country);
    if (d.services !== undefined) setServices(d.services);
    if (d.questions !== undefined) setQuestions(d.questions);
    if (d.competitors !== undefined) setCompetitors(d.competitors);
    if (d.people !== undefined) setPeople(d.people);
    if (d.chNumber !== undefined) setChNumber(d.chNumber);
    if (d.gbpUrl !== undefined) setGbpUrl(d.gbpUrl);
    if (d.reviewUrls !== undefined) setReviewUrls(d.reviewUrls);
    if (d.socialUrls !== undefined) setSocialUrls(d.socialUrls);
    if (d.pressUrls !== undefined) setPressUrls(d.pressUrls);
    if (d.maxPages !== undefined) setMaxPages(d.maxPages);
    if (d.runVisibility !== undefined) setRunVisibility(d.runVisibility);
    if (d.promptCount !== undefined) setPromptCount(d.promptCount);
    setErrors({});
    setFormError("");
    setPasteReport({ filled: filled.map((f) => PASTE_FIELD_LABELS[f]), unrecognised });
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(PASTE_TEMPLATE);
      setTemplateCopied(true);
      setTimeout(() => setTemplateCopied(false), 2500);
    } catch {
      if (!pasteText.trim()) setPasteText(PASTE_TEMPLATE);
    }
  }

  async function prefill() {
    setPrefilling(true);
    setPrefillError("");
    setSuggestion(null);
    try {
      const res = await fetch("/api/prefill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) setPrefillError(data.error ?? "Couldn't read the website.");
      else setSuggestion(data);
    } catch {
      setPrefillError("Couldn't reach the server.");
    }
    setPrefilling(false);
  }

  function applySuggestion(s: Suggestion) {
    if (s.companyName && !companyName) setCompanyName(s.companyName);
    if (s.industry && !industry) setIndustry(s.industry);
    if (s.town && !town) setTown(s.town);
    if (s.country && country === "United Kingdom") setCountry(s.country);
    if (s.socialUrls.length) setSocialUrls([...new Set([...splitList(socialUrls), ...s.socialUrls])].join(", "));
    if (s.people.length && !people.length) setPeople(s.people.map((p) => ({ ...p, otherUrls: "" })));
    setSuggestion(null);
  }

  const aiKeys = ["OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => keysConfigured.includes(k));

  function buildPayload() {
    return {
      url,
      companyName,
      industry,
      town,
      country,
      services: splitList(services),
      exampleQuestions: lines(questions),
      competitors: competitors.filter((c) => c.name || c.url).map((c) => ({ name: c.name, url: c.url })),
      people: people
        .filter((p) => p.fullName || p.jobTitle || p.linkedinUrl || p.otherUrls)
        .map((p) => ({ ...p, otherUrls: splitList(p.otherUrls) })),
      identity: {
        companiesHouseNumber: chNumber,
        googleBusinessProfileUrl: gbpUrl,
        reviewUrls: splitList(reviewUrls),
        socialUrls: splitList(socialUrls),
        pressUrls: splitList(pressUrls),
      },
      options: { maxPages, runVisibility, promptCount },
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const payload = buildPayload();
    const check = makeAuditInputSchema(allowLocal).safeParse(payload);
    if (!check.success) {
      const errs: Errors = {};
      for (const i of check.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      setFormError("Please fix the highlighted fields.");
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        const errs: Errors = {};
        for (const fe of data.fieldErrors ?? []) errs[fe.path] ??= fe.message;
        setErrors(errs);
        setFormError(data.error ?? "Something went wrong starting the audit.");
        setSubmitting(false);
        return;
      }
      router.push(`/audits/${data.id}`);
    } catch {
      setFormError("Couldn't reach the server. Check it's running and try again.");
      setSubmitting(false);
    }
  }

  /** Only the "Start audit" button starts an audit: Enter in a text box must not submit the form. */
  function blockEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={blockEnterSubmit} noValidate className="space-y-6">
      <Section title="Paste all details" subtitle="Optional. Paste everything at once, for example from a Google Doc, and we'll fill in the boxes below for you to check.">
        <Field
          label="Details with headings"
          help="Put each detail under a heading such as Website:, Company name:, Industry:, Town:, Services:, Questions:, Competitors:, People:, Social profiles:. People and competitors can be one per line (“Jo Bloggs, Managing Director, LinkedIn link”), over several lines, or as Person 1:, Competitor 1: and so on."
        >
          {(p) => (
            <textarea
              {...p}
              rows={8}
              className="field-input font-mono text-sm"
              placeholder={"Website: example.co.uk\nCompany name: Bright Spark Electrical\nIndustry: Domestic electricians\nTown: Leeds\nServices: rewiring, EV charger installation\nPeople:\n- Jo Bloggs, Managing Director, https://www.linkedin.com/in/jo-bloggs"}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPasteReport(null);
              }}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={applyPaste} disabled={!pasteText.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
            Fill in the form
          </button>
          <button type="button" onClick={copyTemplate} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent">
            {templateCopied ? "Template copied" : "Copy blank template"}
          </button>
          <span className="text-xs text-ink-soft">Nothing is sent anywhere until you press Run GEO audit.</span>
        </div>
        {pasteReport && (
          <div role="status" className="rounded-xl border border-accent/30 bg-accent-soft/50 p-4 space-y-2 text-sm">
            {pasteReport.filled.length ? (
              <p>
                <span className="font-medium">Filled in:</span> {pasteReport.filled.join(", ")}. Check the boxes below, then press Run GEO audit.
              </p>
            ) : (
              <p className="font-medium">We didn&rsquo;t find any headings we recognise. Try the blank template for the headings to use.</p>
            )}
            {pasteReport.unrecognised.length > 0 && (
              <div>
                <p className="text-ink-soft">Not used. Add these by hand if they matter:</p>
                <ul className="list-disc pl-5 text-ink-soft">
                  {pasteReport.unrecognised.slice(0, 8).map((l, i) => (
                    <li key={i} className="break-all">{l}</li>
                  ))}
                  {pasteReport.unrecognised.length > 8 && <li>…and {pasteReport.unrecognised.length - 8} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Website" subtitle="The only thing we need to start.">
        <Field label="Website address" required help="We crawl up to 25 pages from here, politely and at one request per second." error={errors["url"]}>
          {(p) => <input {...p} className="field-input text-lg" type="text" inputMode="url" autoComplete="url" placeholder="example.co.uk" value={url} onChange={(e) => setUrl(e.target.value)} />}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={prefill} disabled={!url.trim() || prefilling} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50">
            {prefilling && <EyeLoader size={18} label={null} halo={false} />}
            {prefilling ? "Reading the website…" : "Fill in details from the website"}
          </button>
          <span className="text-xs text-ink-soft">{prefillError || "Optional. We read the homepage and About page and show you what we found before using it."}</span>
        </div>
        {suggestion && <PrefillPanel s={suggestion} onUse={() => applySuggestion(suggestion)} onDismiss={() => setSuggestion(null)} />}
      </Section>

      <Section title="About the business" subtitle="Recommended. These shape the questions we test AI assistants with.">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Company name" help="Used to spot when AI mentions you. It's never put in the test prompts." error={errors["companyName"]}>
            {(p) => <input {...p} className="field-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />}
          </Field>
          <Field label="Industry or sector" help="Lets us compare your wording with the terms customers in your industry use." error={errors["industry"]}>
            {(p) => <input {...p} className="field-input" placeholder="e.g. Domestic electricians" value={industry} onChange={(e) => setIndustry(e.target.value)} />}
          </Field>
          <Field label="Town or city" help="Local questions like &ldquo;…in Leeds&rdquo; are where most small businesses get found." error={errors["town"]}>
            {(p) => <input {...p} className="field-input" value={town} onChange={(e) => setTown(e.target.value)} />}
          </Field>
          <Field label="Country" help="Defaults to the UK." error={errors["country"]}>
            {(p) => <input {...p} className="field-input" value={country} onChange={(e) => setCountry(e.target.value)} />}
          </Field>
        </div>
        <Field label="Main products or services" help="Separate with commas. We check your site explains each one clearly." error={errors["services"]}>
          {(p) => <input {...p} className="field-input" placeholder="e.g. rewiring, EV charger installation, EICR certificates" value={services} onChange={(e) => setServices(e.target.value)} />}
        </Field>
        <Field label="Questions a customer might ask an AI" help="One per line, 3–10 questions. Leave blank and we'll write them for you." error={errors["exampleQuestions"] ?? firstMatching(errors, "exampleQuestions.")}>
          {(p) => <textarea {...p} rows={4} className="field-input" placeholder={"Who can install an EV charger in Leeds this week?\nHow much does a full house rewire cost?"} value={questions} onChange={(e) => setQuestions(e.target.value)} />}
        </Field>
      </Section>

      <Section title="Competitors" subtitle="Optional, up to 5. We measure how often AI names them instead of you.">
        <Repeater
          items={competitors}
          max={5}
          addLabel="Add a competitor"
          onAdd={() => setCompetitors([...competitors, emptyCompetitor()])}
          onRemove={(i) => setCompetitors(competitors.filter((_, j) => j !== i))}
          render={(c, i) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name" error={errors[`competitors.${i}.name`]}>
                {(p) => <input {...p} className="field-input" value={c.name} onChange={(e) => setCompetitors(update(competitors, i, { name: e.target.value }))} />}
              </Field>
              <Field label="Website" error={errors[`competitors.${i}.url`]}>
                {(p) => <input {...p} className="field-input" inputMode="url" value={c.url} onChange={(e) => setCompetitors(update(competitors, i, { url: e.target.value }))} />}
              </Field>
            </div>
          )}
        />
      </Section>

      <Section title="People" subtitle="Optional, up to 5. Founders and key staff help AI trust a business. We never scrape LinkedIn; we only check your site links to it.">
        <Repeater
          items={people}
          max={5}
          addLabel="Add a person"
          onAdd={() => setPeople([...people, emptyPerson()])}
          onRemove={(i) => setPeople(people.filter((_, j) => j !== i))}
          render={(person, i) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" error={errors[`people.${i}.fullName`]} help="Must match how they're named on your site.">
                {(p) => <input {...p} className="field-input" value={person.fullName} onChange={(e) => setPeople(update(people, i, { fullName: e.target.value }))} />}
              </Field>
              <Field label="Job title" error={errors[`people.${i}.jobTitle`]} help="We check it's the same everywhere.">
                {(p) => <input {...p} className="field-input" value={person.jobTitle} onChange={(e) => setPeople(update(people, i, { jobTitle: e.target.value }))} />}
              </Field>
              <Field label="LinkedIn profile" error={errors[`people.${i}.linkedinUrl`]} help="An identity anchor: we check your site and markup point to it.">
                {(p) => <input {...p} className="field-input" inputMode="url" placeholder="https://www.linkedin.com/in/…" value={person.linkedinUrl} onChange={(e) => setPeople(update(people, i, { linkedinUrl: e.target.value }))} />}
              </Field>
              <Field label="Other profiles" error={firstMatching(errors, `people.${i}.otherUrls`)} help="Comma-separated: personal site, X, Companies House officer page, publications.">
                {(p) => <input {...p} className="field-input" value={person.otherUrls} onChange={(e) => setPeople(update(people, i, { otherUrls: e.target.value }))} />}
              </Field>
            </div>
          )}
        />
      </Section>

      <Section title="Business identity" subtitle="Optional. Lets us check your details match across the web.">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Companies House number" help="We check your registered name and officers match your site." error={errors["identity.companiesHouseNumber"]}>
            {(p) => <input {...p} className="field-input font-mono uppercase" placeholder="01234567" value={chNumber} onChange={(e) => setChNumber(e.target.value)} />}
          </Field>
          <Field label="Google Business Profile link" help="Recorded as an identity source. Google doesn't allow us to read it automatically." error={errors["identity.googleBusinessProfileUrl"]}>
            {(p) => <input {...p} className="field-input" inputMode="url" value={gbpUrl} onChange={(e) => setGbpUrl(e.target.value)} />}
          </Field>
        </div>
        <Field label="Review profiles" help="Comma-separated: Trustpilot, Checkatrade, Feefo and so on. Independent reviews are a major trust signal." error={firstMatching(errors, "identity.reviewUrls")}>
          {(p) => <input {...p} className="field-input" value={reviewUrls} onChange={(e) => setReviewUrls(e.target.value)} />}
        </Field>
        <Field label="Social profiles" help="Comma-separated. We check your schema markup links to them." error={firstMatching(errors, "identity.socialUrls")}>
          {(p) => <input {...p} className="field-input" value={socialUrls} onChange={(e) => setSocialUrls(e.target.value)} />}
        </Field>
        <Field label="Press coverage or awards" help="Comma-separated links. Used to back up the claims on your site." error={firstMatching(errors, "identity.pressUrls")}>
          {(p) => <input {...p} className="field-input" value={pressUrls} onChange={(e) => setPressUrls(e.target.value)} />}
        </Field>
      </Section>

      <Section title="Options">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Max pages to crawl" help="25 covers most small business sites. More pages take longer." error={errors["options.maxPages"]}>
            {(p) => <input {...p} className="field-input" type="number" min={1} max={100} value={maxPages} onChange={(e) => setMaxPages(e.target.value)} />}
          </Field>
          <Field label="Number of test prompts" help="Questions sent to each AI assistant (max 100)." error={errors["options.promptCount"]}>
            {(p) => <input {...p} className="field-input" type="number" min={1} max={100} disabled={!runVisibility} value={promptCount} onChange={(e) => setPromptCount(e.target.value)} />}
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/60 p-4 cursor-pointer">
          <input type="checkbox" className="mt-1 size-4 accent-accent" checked={runVisibility} onChange={(e) => setRunVisibility(e.target.checked)} />
          <span>
            <span className="font-medium">Run AI visibility tests</span>
            <span className="block text-sm text-ink-soft">
              Asks ChatGPT, Gemini, Perplexity and Claude your customers&rsquo; questions and records whether you&rsquo;re mentioned. This uses API credits.{" "}
              {aiKeys.length ? `Available: ${aiKeys.map((k) => k.replace("_API_KEY", "").toLowerCase()).join(", ")}.` : "No AI keys are configured, so these tests will be marked Unable to Verify."}
            </span>
          </span>
        </label>
      </Section>

      <div className="sticky bottom-0 -mx-4 sm:mx-0 border-t sm:border border-line bg-card/95 backdrop-blur px-4 py-4 sm:rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p role="status" className={`text-sm ${formError ? "text-fail" : "text-ink-soft"}`}>
          {formError || "72 checks across 9 categories. Most audits take 1–5 minutes."}
        </p>
        <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-sm shadow-accent/25 hover:bg-accent-strong disabled:opacity-70">
          {submitting && <EyeLoader size={20} label={null} halo={false} />}
          {submitting ? "Starting…" : "Run GEO audit"}
        </button>
      </div>
    </form>
  );
}

interface Suggestion {
  companyName?: string;
  industry?: string;
  town?: string;
  country?: string;
  socialUrls: string[];
  people: { fullName: string; jobTitle: string; linkedinUrl: string }[];
  sources: string[];
}

function PrefillPanel({ s, onUse, onDismiss }: { s: Suggestion; onUse: () => void; onDismiss: () => void }) {
  const rows: [string, string][] = [];
  if (s.companyName) rows.push(["Company name", s.companyName]);
  if (s.industry) rows.push(["Industry", s.industry]);
  if (s.town) rows.push(["Town", s.town]);
  if (s.country) rows.push(["Country", s.country]);
  for (const p of s.people) rows.push(["Person", [p.fullName, p.jobTitle, p.linkedinUrl].filter(Boolean).join(" · ")]);
  for (const u of s.socialUrls) rows.push(["Social profile", u]);
  return (
    <div role="region" aria-label="Details found on the website" className="rounded-xl border border-accent/30 bg-accent-soft/50 p-4 space-y-3">
      <p className="text-sm font-medium">{rows.length ? "We found these on the website. Check them before using:" : "We couldn't find any details to pre-fill."}</p>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.sources.length > 0 && <p className="text-xs text-ink-soft">Sources: {s.sources.join("; ")}.</p>}
      <div className="flex gap-3">
        {rows.length > 0 && (
          <button type="button" onClick={onUse} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
            Use these (empty fields only)
          </button>
        )}
        <button type="button" onClick={onDismiss} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function update<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

function firstMatching(errors: Errors, prefix: string): string | undefined {
  const k = Object.keys(errors).find((x) => x.startsWith(prefix));
  return k ? errors[k] : undefined;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

type FieldProps = { id: string; "aria-invalid": boolean; "aria-describedby": string };

function Field({ label, help, error, required, children }: { label: string; help?: string; error?: string; required?: boolean; children: (p: FieldProps) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": `${id}-help` })}
      <p id={`${id}-help`} className={`text-xs ${error ? "text-fail" : "text-ink-soft"}`}>
        {error ?? help}
      </p>
    </div>
  );
}

function Repeater<T>({ items, max, addLabel, onAdd, onRemove, render }: { items: T[]; max: number; addLabel: string; onAdd: () => void; onRemove: (i: number) => void; render: (item: T, i: number) => ReactNode }) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="relative rounded-xl border border-line p-4 pt-8">
          <button type="button" onClick={() => onRemove(i)} className="absolute right-3 top-2 text-xs text-ink-soft hover:text-fail">
            Remove
          </button>
          {render(item, i)}
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={onAdd} className="rounded-lg border border-dashed border-line px-4 py-2 text-sm text-ink-soft hover:border-accent hover:text-accent">
          + {addLabel}
        </button>
      )}
    </div>
  );
}
