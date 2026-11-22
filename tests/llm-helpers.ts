import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { LlmParams, LlmTransport } from "@/lib/llm/client";

/** Build a fake Messages API response carrying `json` as the text output. */
export function fakeMessage(json: unknown, opts: { input?: number; output?: number; stop?: BetaMessage["stop_reason"]; model?: string } = {}): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: opts.model ?? "claude-sonnet-5-5",
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json), citations: null }],
    stop_reason: opts.stop ?? "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: opts.input ?? 1000,
      output_tokens: opts.output ?? 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as BetaMessage;
}

export function userText(params: LlmParams): string {
  const m = params.messages[0];
  return typeof m.content === "string" ? m.content : "";
}

/** Pages in a prompt: url → the text after "TEXT:" (first part). */
export function pagesInPrompt(prompt: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of prompt.matchAll(/<page url="([^"]+)"[^>]*>([\s\S]*?)<\/page>/g)) {
    const text = /TEXT[^:\n]*:\n([\s\S]*?)(\n\n[A-Z]+[^\n]*:\n|$)/.exec(m[2])?.[1] ?? "";
    out.push({ url: m[1], text });
  }
  return out;
}

export const criteriaInPrompt = (prompt: string) => [...prompt.matchAll(/<criterion id="([^"]+)"/g)].map((m) => m[1]);

/**
 * A fake judge that answers every criterion with `statusFor(id)` and quotes the first
 * sentence-ish slice of the first page, verbatim. Records every request.
 */
export function scriptedTransport(statusFor: (id: string) => "pass" | "partial" | "fail" | "not_applicable") {
  const calls: LlmParams[] = [];
  const transport: LlmTransport = async (params) => {
    calls.push(params);
    const prompt = userText(params);
    const pages = pagesInPrompt(prompt);
    const page = pages.find((p) => p.text.trim().length > 30) ?? pages[0];
    const quote = page.text.trim().slice(0, 60).trim();
    return fakeMessage({
      verdicts: criteriaInPrompt(prompt).map((id) => {
        const status = statusFor(id);
        return { id, status, finding: `Test finding for ${id}.`, quotes: status === "not_applicable" ? [] : [{ url: page.url, quote }] };
      }),
    });
  };
  return { transport, calls };
}
