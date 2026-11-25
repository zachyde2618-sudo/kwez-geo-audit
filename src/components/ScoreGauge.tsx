"use client";

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { bandColour, colourAt, dashOffset, easeOutCubic } from "@/lib/gauge";
import { bandFor } from "@/lib/scoring";

const DURATION_MS = 1600;

interface Props {
  /** 0–100, or null when nothing could be assessed. */
  score: number | null;
  /** Coverage % shown under the gauge (full size only). */
  coverage?: number;
  /** Compact version for category rows. */
  mini?: boolean;
  /** Accessible name, e.g. "GEO Visibility Score" or a category name. */
  label?: string;
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia?.(MOTION_QUERY);
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}
const reducedMotionSnapshot = () => window.matchMedia?.(MOTION_QUERY).matches ?? false;

/**
 * Animated circular score gauge. The arc starts at 12 o'clock and runs clockwise; one
 * requestAnimationFrame value drives the arc, the centre number and the colour, so they
 * always match. Respects prefers-reduced-motion by showing the final state at once.
 */
export function ScoreGauge({ score, coverage, mini = false, label = "GEO Visibility Score" }: Props) {
  const size = mini ? 44 : 240;
  const stroke = mini ? 5 : 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const reduceMotion = useSyncExternalStore(subscribeMotion, reducedMotionSnapshot, () => false);
  // Before the animation starts (server HTML, reduced motion) the final state is rendered;
  // for motion-allowed visitors it's hidden by CSS until the first frame starts from 0.
  const [anim, setAnim] = useState({ value: 0, finished: false, started: false });

  useLayoutEffect(() => {
    if (score === null || reduceMotion) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      setAnim({ value: score * easeOutCubic(t), finished: t >= 1, started: true });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduceMotion]);

  const animating = score !== null && !reduceMotion && anim.started;
  const done = !animating || anim.finished;
  const value = score === null ? 0 : animating ? anim.value : score;
  const pending = score !== null && !reduceMotion && !anim.started;

  const shown = score === null ? null : done ? score : Math.round(value);
  const band = score === null ? null : bandFor(score);
  const colour = score === null ? "transparent" : done ? bandColour(score) : colourAt(value);
  const valueText = score === null ? "Not scored" : `${score} out of 100${mini ? "" : `, ${band}`}`;

  return (
    <div className={`${mini ? "inline-block" : "flex flex-col items-center"} ${pending ? "gauge-pending" : ""}`}>
      <div
        // A meter needs a value; an unscored dial is announced as a picture with its label instead.
        {...(score == null
          ? { role: "img", "aria-label": `${label}: ${valueText}` }
          : { role: "meter", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": score, "aria-valuetext": valueText })}
        className="relative"
        style={{ width: size, height: size }}
        data-testid={mini ? undefined : "score-gauge"}
        data-done={done ? "true" : "false"}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset(score === null ? 0 : done ? score : value, c)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke 300ms ease-out", opacity: score && (done || value > 0.5) ? 1 : 0 }}
            data-testid={mini ? undefined : "score-arc"}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className={`font-semibold tabular-nums tracking-tight ${mini ? "text-sm" : "text-6xl"}`} data-testid={mini ? undefined : "score-number"}>
            {shown ?? "—"}
          </span>
          {!mini && <span className="text-sm text-ink-soft -mt-0.5">out of 100</span>}
        </div>
      </div>
      {!mini && (
        <>
          <p
            className="mt-4 text-lg font-semibold"
            style={{ opacity: done ? 1 : 0, transition: done ? "opacity 500ms ease-out" : "none", color: score === null ? "var(--color-unable)" : bandColour(score) }}
            data-testid="score-band"
          >
            {band ?? "Not scored"}
          </p>
          {coverage !== undefined && <p className="text-sm text-ink-soft">based on {coverage}% of checks</p>}
        </>
      )}
    </div>
  );
}
