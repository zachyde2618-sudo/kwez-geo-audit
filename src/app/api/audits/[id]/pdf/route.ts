import { pdfFileName, renderReportPdf } from "@/lib/pdf/report";
import { getAudit } from "@/lib/pipeline";
import { isValidAuditId } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The client-ready PDF of a finished audit. Downloads by default; `?view=1` opens it in the
 * browser instead.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidAuditId(id)) return Response.json({ error: "Audit not found" }, { status: 404 });
  const audit = await getAudit(id);
  if (!audit) return Response.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "complete" || !audit.score) return Response.json({ error: "The audit hasn't finished yet." }, { status: 409 });

  const pdf = await renderReportPdf(audit);
  const name = pdfFileName(audit);
  const inline = new URL(req.url).searchParams.get("view") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
