import Link from "next/link";
import { PastAudits } from "@/components/PastAudits";
import { listAudits } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function PastAuditsPage() {
  const audits = await listAudits();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Past audits</h1>
      {audits.length === 0 ? (
        <p className="mt-4 text-ink-soft">
          No audits yet. <Link href="/" className="text-accent underline">Run your first one</Link>.
        </p>
      ) : (
        <PastAudits initial={audits} />
      )}
    </div>
  );
}
