import { notFound } from "next/navigation";
import { AuditView } from "@/components/AuditView";
import { getAudit } from "@/lib/pipeline";
import { loadFavourites } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: PageProps<"/audits/[id]">) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();
  const favourite = (await loadFavourites()).has(id);
  return <AuditView id={id} initial={audit} favourite={favourite} />;
}
