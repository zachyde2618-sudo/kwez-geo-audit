import { config } from "@/config";
import { prefillFromSite } from "@/lib/prefill";
import { normaliseWebsiteUrl } from "@/lib/schemas/input";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = normaliseWebsiteUrl(body.url ?? "", config.crawler.allowLocalTargets);
  if (!url) return Response.json({ error: "Enter a valid website address first." }, { status: 422 });
  try {
    const suggestion = await prefillFromSite(url, AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]));
    return Response.json(suggestion);
  } catch {
    return Response.json({ error: "Couldn't read the website. You can still fill the form in by hand." }, { status: 502 });
  }
}
