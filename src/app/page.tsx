import { API_KEY_NAMES, config, hasKey } from "@/config";
import { AuditForm } from "@/components/AuditForm";

export const dynamic = "force-dynamic";

export default function Home() {
  const keys = API_KEY_NAMES.filter((k) => hasKey(k));
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-10">
        <p className="text-sm font-medium text-accent">Generative Engine Optimisation audit</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
          Will AI assistants recommend this business to someone who&rsquo;s never heard of it?
        </h1>
        <p className="mt-3 text-ink-soft max-w-2xl">
          We check how easily ChatGPT, Gemini, Perplexity, Claude and Google&rsquo;s AI Overviews can find, understand, trust and recommend a website, then give you a plain-English list of fixes.
        </p>
      </div>
      <AuditForm allowLocal={config.crawler.allowLocalTargets} keysConfigured={keys} />
    </div>
  );
}
