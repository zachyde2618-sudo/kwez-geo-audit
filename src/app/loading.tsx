import { EyeLoader } from "@/components/Brand";

export default function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-sm text-ink-soft">
        <EyeLoader size={72} label="Loading" />
        <span aria-hidden>Loading…</span>
      </div>
    </div>
  );
}
