import { cancelAudit } from "@/lib/pipeline";
import { isValidAuditId } from "@/lib/storage";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  const cancelled = cancelAudit(id);
  return Response.json({ cancelled }, { status: cancelled ? 200 : 409 });
}
