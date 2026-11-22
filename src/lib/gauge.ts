import type { Band } from "@/lib/scoring";
import { bandFor } from "@/lib/scoring";

export const BAND_COLOUR: Record<Band, string> = {
  "Low visibility": "#c0322b",
  Developing: "#d07a00",
  Good: "#2f9e5b",
  Excellent: "#1d7a46",
};

/** Smooth red → amber → green as the score rises (used while the arc fills). */
const STOPS: [number, [number, number, number]][] = [
  [0, [0xc0, 0x32, 0x2b]],
  [30, [0xc0, 0x32, 0x2b]],
  [55, [0xd0, 0x7a, 0x00]],
  [62, [0xd0, 0x7a, 0x00]],
  [78, [0x2f, 0x9e, 0x5b]],
  [92, [0x1d, 0x7a, 0x46]],
  [100, [0x1d, 0x7a, 0x46]],
];

export function colourAt(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  let i = 0;
  while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i++;
  const [a, ca] = STOPS[i];
  const [b, cb] = STOPS[i + 1];
  const t = b === a ? 0 : (v - a) / (b - a);
  const mix = ca.map((c, k) => Math.round(c + (cb[k] - c) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export function bandColour(score: number): string {
  return BAND_COLOUR[bandFor(score)];
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/** stroke-dashoffset for a value 0–100 on a circle of circumference c. */
export const dashOffset = (value: number, circumference: number) => circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
