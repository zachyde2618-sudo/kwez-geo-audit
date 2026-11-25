import { deleteAudit, getAudit } from "@/lib/pipeline";
import { BodyError, bodyErrorResponse, readJsonBody } from "@/lib/limits";
import { isValidAuditId, loadAudit, setFavourite } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  const rec = await getAudit(id);
  if (!rec) return Response.json({ error: "Audit not found" }, { status: 404 });
  return Response.json(rec, { headers: { "Cache-Control": "no-store" } });
}

/** Delete an audit (a running one is cancelled first). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  const deleted = await deleteAudit(id);
  return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Audit not found" }, { status: 404 });
}

/** Update an audit's own settings. Currently: { "favourite": true | false }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  let body: { favourite?: unknown } | null;
  try {
    body = (await readJsonBody(req, 1024)) as { favourite?: unknown } | null;
  } catch (e) {
    if (e instanceof BodyError) return bodyErrorResponse(e);
    throw e;
  }
  if (typeof body?.favourite !== "boolean") return Response.json({ error: 'Send { "favourite": true } or { "favourite": false }' }, { status: 400 });
  if (!(await loadAudit(id))) return Response.json({ error: "Audit not found" }, { status: 404 });
  await setFavourite(id, body.favourite);
  return Response.json({ id, favourite: body.favourite });
}
