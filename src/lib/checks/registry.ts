import { hasKey } from "@/config";
import { CheckResult, MAX_SNIPPET_CHARS, type Evidence } from "@/lib/schemas/check";
import { CHECKS, type CheckMeta } from "./catalogue";
import { cat1 } from "./cat1";
import { cat2 } from "./cat2";
import { cat3 } from "./cat3";
import { cat4 } from "./cat4";
import { cat5 } from "./cat5";
import { cat6 } from "./cat6";
import { cat7 } from "./cat7";
import { cat8 } from "./cat8";
import { cat9 } from "./cat9";
import { manualChecks } from "./manual";
import type { CheckContext, CheckImpl, RawCheckResult } from "./types";

/** Every implemented check, keyed by stable ID. Unimplemented IDs fall back to a stub. */
const IMPLEMENTATIONS: Record<string, CheckImpl> = {
  ...manualChecks,
  ...cat1,
  ...cat2,
  ...cat3,
  ...cat4,
  ...cat5,
  ...cat6,
  ...cat7,
  ...cat8,
  ...cat9,
};

export function getImplementation(id: string): CheckImpl | undefined {
  return IMPLEMENTATIONS[id];
}

/** Returns the reason a check cannot run because of missing keys, or null. */
export function missingKeyReason(meta: CheckMeta): string | null {
  const missing = (meta.requires ?? []).filter((k) => !hasKey(k));
  if (missing.length) return `Not checked: ${missing.join(" and ")} not configured`;
  if (meta.requiresAny && !meta.requiresAny.some((k) => hasKey(k))) {
    return `Not checked: ${meta.requiresAny.join(" / ")} not configured`;
  }
  return null;
}

const clip = (s: string) => (s.length > MAX_SNIPPET_CHARS ? s.slice(0, MAX_SNIPPET_CHARS - 1) + "…" : s);

/**
 * Turn a raw check result into a validated CheckResult and enforce the audit rules:
 *  - no evidence ⇒ Unable to Verify (never assume a pass)
 *  - Partial only where the checklist allows it
 *  - Pass ⇒ issue and requiredChange are empty
 *  - snippets are clipped to 300 characters
 */
export function finaliseResult(meta: CheckMeta, raw: RawCheckResult): CheckResult {
  let status = raw.status;
  let issue = raw.issue ?? "";
  let requiredChange = raw.requiredChange ?? "";
  const notes = [...(raw.notes ?? [])];
  const evidence: Evidence[] = (raw.evidence ?? []).map((e) => ({ ...e, value: clip(e.value), label: clip(e.label) }));

  if (status !== "unable" && evidence.length === 0) {
    status = "unable";
    issue = "No evidence could be collected for this check, so it was not assessed.";
    requiredChange = "";
  }
  if (status === "partial" && !meta.allowsPartial) {
    notes.push("Partly met; reported as Fail because this check is pass/fail only.");
    status = "fail";
  }
  if (status === "pass") {
    issue = "";
    requiredChange = "";
  }

  return CheckResult.parse({
    id: meta.id,
    status,
    evidence,
    issue,
    requiredChange,
    effort: raw.effort ?? meta.effort,
    impact: raw.impact ?? meta.impact,
    method: raw.method ?? meta.method,
    pages: raw.pages ?? [],
    notes,
  });
}

export async function runCheck(meta: CheckMeta, ctx: CheckContext): Promise<CheckResult> {
  const impl = IMPLEMENTATIONS[meta.id];
  // Manual checks report their recommendation regardless of keys.
  if (!impl || meta.method !== "manual") {
    const reason = missingKeyReason(meta);
    if (reason) {
      const keyHint = reason.replace("Not checked: ", "").replace(" not configured", "");
      return finaliseResult(meta, {
        status: "unable",
        issue: reason,
        requiredChange: `Add ${keyHint} to .env.local and re-run the audit to assess this check.`,
      });
    }
  }
  if (!impl) {
    return finaliseResult(meta, {
      status: "unable",
      issue: "Not checked: this check is not implemented in this build yet.",
    });
  }
  try {
    return finaliseResult(meta, await impl(ctx));
  } catch (err) {
    if (ctx.signal.aborted) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    return finaliseResult(meta, {
      status: "unable",
      issue: `Not checked: the check could not run (${clip(msg)}).`,
    });
  }
}

export function allCheckIds(): string[] {
  return CHECKS.map((c) => c.id);
}
