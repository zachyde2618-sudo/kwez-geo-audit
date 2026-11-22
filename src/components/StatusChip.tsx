import { STATUS_LABEL, type CheckStatus } from "@/lib/schemas/check";

const STYLES: Record<CheckStatus, string> = {
  pass: "bg-pass-soft text-pass",
  partial: "bg-partial-soft text-partial",
  fail: "bg-fail-soft text-fail",
  unable: "bg-unable-soft text-unable",
};

const ICON: Record<CheckStatus, string> = { pass: "✓", partial: "◐", fail: "✕", unable: "?" };

export function StatusChip({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STYLES[status]}`}>
      <span aria-hidden>{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
