import { ZodError } from "zod";
import { config } from "@/config";
import { parseAuditInput } from "@/lib/schemas/input";
import { startAudit } from "@/lib/pipeline";
import { listAudits } from "@/lib/storage";

export async function GET() {
  return Response.json({ audits: await listAudits() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  try {
    const input = parseAuditInput(body, config.crawler.allowLocalTargets);
    const record = await startAudit(input);
    return Response.json({ id: record.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json(
        { error: "Please fix the highlighted fields", fieldErrors: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 422 },
      );
    }
    throw e;
  }
}
