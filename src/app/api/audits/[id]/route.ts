import { getAudit } from "@/lib/pipeline";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getAudit(id);
  if (!rec) return Response.json({ error: "Audit not found" }, { status: 404 });
  return Response.json(rec, { headers: { "Cache-Control": "no-store" } });
}
