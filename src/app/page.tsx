import { API_KEY_NAMES, config, hasKey } from "@/config";
import { AuditForm } from "@/components/AuditForm";

export const dynamic = "force-dynamic";

export default function Home() {
  const keys = API_KEY_NAMES.filter((k) => hasKey(k));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div aria-hidden className="hidden md:block" />
        <div>
          <h1 className="max-w-[26ch] text-3xl sm:text-4xl">Will AI assistants recommend this business to someone who&rsquo;s never heard of it?</h1>
          <p className="mt-4 max-w-[60ch] text-lg text-ink-soft">
            A Generative Engine Optimisation audit. We check how easily ChatGPT, Gemini, Perplexity, Claude and Google&rsquo;s AI Overviews can find, understand, trust and recommend a website, then give you a plain-English list of fixes.
          </p>
        </div>
      </div>
      <AuditForm allowLocal={config.crawler.allowLocalTargets} keysConfigured={keys} />
    </div>
  );
}
