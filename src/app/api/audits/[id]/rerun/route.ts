import { ZodError } from "zod";
import { rerunAudit } from "@/lib/pipeline";
import { isValidAuditId } from "@/lib/storage";

/** Start a new audit with the same details as this one. The old audit is kept for comparison. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  try {
    const rec = await rerunAudit(id);
    if (!rec) return Response.json({ error: "Audit not found" }, { status: 404 });
    return Response.json({ id: rec.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: "This audit's details are no longer valid (for example a local address with local targets switched off)." }, { status: 422 });
    throw e;
  }
}
