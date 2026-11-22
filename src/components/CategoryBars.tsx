"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/checks/catalogue";
import { bandColour } from "@/lib/gauge";
import type { ScoreSummary } from "@/lib/scoring";

/** Open a category's evidence accordion and scroll to it. */
export function openCategory(id: number) {
  const el = document.getElementById(`category-${id}`) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.querySelector("summary")?.focus({ preventScroll: true });
}

export function CategoryBars({ score }: { score: ScoreSummary }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <ul className="space-y-1">
      {CATEGORIES.map((cat) => {
        const cs = score.categories.find((c) => c.categoryId === cat.id)!;
        const assessed = cs.counts.pass + cs.counts.partial + cs.counts.fail;
        const total = assessed + cs.counts.unable;
        const value = cs.score === null ? null : Math.round(cs.score);
        return (
          <li key={cat.id}>
            <button
              type="button"
              onClick={() => openCategory(cat.id)}
              className="group grid w-full grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,17rem)_1fr_3rem] items-center gap-x-4 gap-y-1.5 rounded-xl px-3 py-2.5 text-left hover:bg-paper"
              aria-label={`${cat.name}: ${value === null ? "not assessed" : `${value} out of 100`}. Show checks.`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug group-hover:text-accent">{cat.name}</span>
                <span className="block text-xs text-ink-soft">
                  {assessed} of {total} checks assessed · weight {cat.weight}
                </span>
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1 h-2.5 rounded-full bg-line/70 overflow-hidden" aria-hidden="true">
                {value === null ? (
                  <span className="block h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.06)_4px,rgba(0,0,0,0.06)_8px)]" />
                ) : (
                  <span
                    className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-out"
                    style={{ width: mounted ? `${Math.max(value, 1.5)}%` : "0%", background: bandColour(value) }}
                  />
                )}
              </span>
              <span className="text-right font-mono text-base tabular-nums">{value ?? <span className="text-ink-soft text-xs font-sans">n/a</span>}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
