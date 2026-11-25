import type { Metadata } from "next";
import Link from "next/link";
import { EyeMark } from "@/components/Brand";
import { CATEGORIES } from "@/lib/checks/catalogue";

export const metadata: Metadata = {
  title: "Kwez GEO Audit · Will AI recommend your business?",
  description: "Kwez checks how ChatGPT, Claude, Gemini, Perplexity and Google's AI Overviews find, understand and trust your website, then gives you a plain-English list of fixes.",
};

const ASSISTANTS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Google AI Overviews"];

const STEPS = [
  { n: "1", title: "Tell us the website", body: "Add the web address, and if you like the business name, town and services. Nothing else is needed to start." },
  { n: "2", title: "We read it like an AI does", body: "We crawl up to 25 pages, check the technical signals, search the web for mentions and ask AI real customer questions." },
  { n: "3", title: "Get a score and a to-do list", body: "A score out of 100, the evidence behind every finding and a prioritised list of fixes in plain English." },
];

const OUTCOMES = [
  { title: "A clear score", body: "One number out of 100 across 9 categories, with how much of the site we could assess, so you know how far to trust it." },
  { title: "A to-do list, in order", body: "What to do this week, this month and later, with each fix explained in plain English and tagged if Kwez can do it for you." },
  { title: "Proof for every finding", body: "Quotes, pages and search results behind each check, so nothing rests on an AI's say-so." },
];

const FAQS = [
  {
    q: "What is Generative Engine Optimisation (GEO)?",
    a: "It's making sure AI assistants such as ChatGPT, Claude, Gemini and Perplexity can find your business, understand what you do, trust it and recommend it when someone asks them for help.",
  },
  {
    q: "How is this different from SEO?",
    a: "SEO is about ranking in a list of links. AI assistants give one answer and name a few businesses. They rely on clear content, structured data and what the rest of the web says about you, which is what this audit checks.",
  },
  {
    q: "How long does an audit take?",
    a: "Most audits finish in 1 to 5 minutes. You can leave the page while it runs and come back to it under Past audits.",
  },
  {
    q: "Do you ask AI about my business by name?",
    a: "No. We ask the questions a new customer would ask, such as “Who can rewire a house in Leeds?”, and record whether you are named. Naming you would make the test meaningless.",
  },
  {
    q: "What happens after the audit?",
    a: "You get the to-do list. You can work through it yourself, or Kwez can make the fixes, rebuild the site or keep it in shape month by month.",
  },
];

/** Brand colours used as small category markers, in the order the eye is drawn. */
const MARKS = ["bg-cyan", "bg-blue", "bg-violet", "bg-plum", "bg-pink"];

export default function Home() {
  return (
    <div className="overflow-x-clip">
      {/* ── Hero ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-3 py-1 pl-1.5 pr-3 text-sm font-semibold text-ink-2">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">GEO</span>
            For UK businesses
          </p>
          <h1 className="mt-6 max-w-[14ch] text-[2.6rem] leading-[1.02] sm:text-6xl">Will AI recommend your business?</h1>
          <p className="mt-6 max-w-[52ch] text-lg text-ink-soft sm:text-xl">
            Kwez checks how ChatGPT, Claude, Gemini, Perplexity and Google&rsquo;s AI Overviews find, understand and trust your website, then gives you a plain-English list of fixes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/audit" className="btn inline-flex min-h-12 items-center rounded-input bg-accent px-6 text-base font-semibold text-accent-ink hover:bg-accent-strong">
              Start an audit
            </Link>
            <Link href="#how" className="btn inline-flex min-h-12 items-center rounded-input border border-line bg-paper-3 px-6 text-base font-semibold hover:border-accent hover:text-accent">
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-soft">72 checks &middot; results in about 5 minutes &middot; every finding backed by evidence</p>
        </div>
        <HeroPreview />
      </section>

      {/* ── Assistants strip ── */}
      <section aria-label="AI assistants we test" className="border-y border-line bg-paper-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-6 sm:px-6">
          <span className="mr-2 text-sm text-ink-soft">How you show up in</span>
          {ASSISTANTS.map((a) => (
            <span key={a} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-ink-2">{a}</span>
          ))}
        </div>
      </section>

      {/* ── Numbers ── */}
      <section aria-label="The audit in numbers" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {[
            ["72", "checks on your site and your reputation"],
            ["9", "categories, weighted by how much AI cares"],
            ["10", "real customer questions put to AI"],
            ["0", "jargon left unexplained"],
          ].map(([n, label]) => (
            <div key={label} className="border-l-2 border-accent pl-4">
              <dt className="sr-only">{label}</dt>
              <dd className="m-0">
                <span className="block font-display text-5xl font-bold tabular-nums tracking-tight">{n}</span>
                <span className="mt-2 block max-w-[22ch] text-sm text-ink-soft">{label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── How it works ── */}
      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-20 sm:px-6 md:pb-28">
        <SectionHead label="How it works" title="Three steps, about five minutes" id="how-title" />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-card border border-line bg-paper-3 p-6 sm:p-7">
              <span className="grid size-10 place-items-center rounded-full bg-navy font-display text-lg font-bold text-paper">{s.n}</span>
              <h3 className="mt-6 text-xl">{s.title}</h3>
              <p className="mt-3 text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── What we check ── */}
      <section id="checks" aria-labelledby="checks-title" className="bg-paper-2">
        <div className="mx-auto max-w-6xl scroll-mt-4 px-4 py-20 sm:px-6 md:py-28">
          <SectionHead label="What we check" title="Nine things AI looks at before it recommends anyone" id="checks-title" />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c, i) => (
              <li key={c.id} className="flex flex-col rounded-card bg-paper-3 p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className={`size-3 rounded-full ${MARKS[i % MARKS.length]}`} aria-hidden />
                  <span className="text-xs font-semibold tabular-nums text-ink-soft">{c.weight}% of the score</span>
                </div>
                <h3 className="mt-5 text-lg leading-snug">{c.name}</h3>
                <p className="mt-2 text-sm text-ink-soft">{c.blurb}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── What you get (dark band) ── */}
      <section aria-labelledby="get-title" className="bg-navy text-paper">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan">What you get</p>
          <h2 id="get-title" className="mt-3 max-w-[24ch] text-3xl text-paper sm:text-4xl">A report you can act on the same day</h2>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {OUTCOMES.map((o, i) => (
              <li key={o.title} className="rounded-card border border-paper/15 p-6 sm:p-7">
                <span className={`block h-1.5 w-10 rounded-full ${["bg-cyan", "bg-violet", "bg-pink"][i]}`} aria-hidden />
                <h3 className="mt-6 text-xl text-paper">{o.title}</h3>
                <p className="mt-3 text-paper/75">{o.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" aria-labelledby="faq-title" className="mx-auto grid max-w-6xl scroll-mt-4 gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:py-28">
        <SectionHead label="Questions" title="Good to know" id="faq-title" />
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex items-center justify-between gap-6 py-5 text-lg font-semibold">
                {f.q}
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-paper-2 text-xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-6 pr-12 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final call to action ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 md:pb-28">
        <div className="grid items-center gap-8 rounded-[28px] bg-accent-soft p-8 sm:p-12 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <EyeMark size={96} />
          <div>
            <h2 className="max-w-[22ch] text-2xl sm:text-3xl">Find out what AI says about your business</h2>
            <p className="mt-2 text-ink-soft">Start with just a web address. You can add more detail as you go.</p>
          </div>
          <Link href="/audit" className="btn inline-flex min-h-12 items-center justify-center rounded-input bg-accent px-6 font-semibold text-accent-ink hover:bg-accent-strong">
            Start an audit
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ label, title, id }: { label: string; title: string; id: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-pink-ink">{label}</p>
      <h2 id={id} className="mt-3 max-w-[22ch] text-3xl sm:text-4xl">{title}</h2>
    </div>
  );
}

/** A flat, illustrative slice of a report: a question put to AI, the answer, a score and one fix. */
function HeroPreview() {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[34rem]">
      <div className="rounded-[28px] bg-navy p-5 sm:p-6">
        <div className="rounded-card bg-paper-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">A customer asks AI</p>
          <p className="mt-2 rounded-2xl rounded-tl-sm bg-paper-2 px-4 py-3 text-sm">Who can install an EV charger in Leeds this week?</p>
          <p className="mt-2 ml-8 rounded-2xl rounded-tr-sm bg-accent-soft px-4 py-3 text-sm text-ink-2">
            Here are three local electricians: <strong className="text-accent-strong">Bright Spark Electrical</strong>, &hellip;
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex items-center gap-4 rounded-card bg-paper-3 p-4 sm:flex-col sm:justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
              <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="12" />
              <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-pass)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.28} transform="rotate(-90 60 60)" />
              <text x="60" y="68" textAnchor="middle" className="fill-ink font-display text-[30px] font-bold">72</text>
            </svg>
            <p className="text-sm font-semibold text-pass">Good</p>
          </div>
          <div className="space-y-3 rounded-card bg-paper-3 p-4">
            {[
              ["Crawler access", 90, "bg-pass"],
              ["FAQ library", 45, "bg-partial"],
              ["Third-party mentions", 30, "bg-fail"],
            ].map(([name, v, cls]) => (
              <div key={name as string}>
                <div className="flex justify-between text-xs font-semibold">
                  <span>{name}</span>
                  <span className="tabular-nums">{v}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-line">
                  <div className={`h-full rounded-full ${cls}`} style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 border-t border-line pt-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-semibold">1</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">Get listed on review sites AI trusts</p>
                <span className="mt-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">Kwez can fix this</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <EyeMark size={84} className="absolute -right-3 -top-8 hidden sm:block" />
    </div>
  );
}
