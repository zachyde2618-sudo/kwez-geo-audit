import Link from "next/link";
import { listAudits } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function PastAudits() {
  const audits = await listAudits();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Past audits</h1>
      {audits.length === 0 ? (
        <p className="mt-4 text-ink-soft">
          No audits yet. <Link href="/" className="text-accent underline">Run your first one</Link>.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-card">
          {audits.map((a) => (
            <li key={a.id}>
              <Link href={`/audits/${a.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-paper/60">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{a.companyName || a.domain}</span>
                  <span className="block text-xs text-ink-soft">
                    {a.domain} · {new Date(a.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-lg tabular-nums">{a.overall ?? "—"}</span>
                  <span className="block text-xs text-ink-soft">{a.status === "complete" ? `${a.coveragePct}% coverage` : a.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
