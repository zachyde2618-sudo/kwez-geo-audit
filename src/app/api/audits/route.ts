import { ZodError } from "zod";
import { config } from "@/config";
import { BodyError, bodyErrorResponse, readJsonBody, tooMany } from "@/lib/limits";
import { parseAuditInput } from "@/lib/schemas/input";
import { AuditLimitError, startAudit } from "@/lib/pipeline";
import { listAudits } from "@/lib/storage";

export async function GET() {
  return Response.json({ audits: await listAudits() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const input = parseAuditInput(body, config.crawler.allowLocalTargets);
    const record = await startAudit(input);
    return Response.json({ id: record.id }, { status: 201 });
  } catch (e) {
    if (e instanceof BodyError) return bodyErrorResponse(e);
    if (e instanceof AuditLimitError) return tooMany(e.message, e.retryAfterSeconds);
    if (e instanceof ZodError) {
      return Response.json(
        { error: "Please fix the highlighted fields", fieldErrors: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 422 },
      );
    }
    throw e;
  }
}
