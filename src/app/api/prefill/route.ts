import { config } from "@/config";
import { BodyError, bodyErrorResponse, clientKey, readJsonBody, takeToken, tooMany } from "@/lib/limits";
import { prefillFromSite } from "@/lib/prefill";
import { normaliseWebsiteUrl } from "@/lib/schemas/input";

export async function POST(req: Request) {
  const wait = takeToken(`prefill:${clientKey(req)}`, config.security.prefillPerMinute, 60_000);
  if (wait) return tooMany(`Too many look-ups in a row. Try again in ${wait} seconds.`, wait);
  let body: { url?: unknown };
  try {
    body = ((await readJsonBody(req, 4096)) ?? {}) as { url?: unknown };
  } catch (e) {
    if (e instanceof BodyError) return bodyErrorResponse(e);
    throw e;
  }
  const url = normaliseWebsiteUrl(typeof body.url === "string" ? body.url : "", config.crawler.allowLocalTargets);
  if (!url) return Response.json({ error: "Enter a valid website address first." }, { status: 422 });
  try {
    const suggestion = await prefillFromSite(url, AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]));
    return Response.json(suggestion);
  } catch {
    return Response.json({ error: "Couldn't read the website. You can still fill the form in by hand." }, { status: 502 });
  }
}
