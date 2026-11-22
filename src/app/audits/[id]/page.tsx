import { notFound } from "next/navigation";
import { AuditView } from "@/components/AuditView";
import { getAudit } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: PageProps<"/audits/[id]">) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();
  return <AuditView id={id} initial={audit} />;
}
