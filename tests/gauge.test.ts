import { describe, expect, it } from "vitest";
import { BAND_COLOUR, bandColour, colourAt, dashOffset, easeOutCubic } from "@/lib/gauge";

describe("gauge maths", () => {
  it("eases out cubically from 0 to 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("maps value to dash offset (full circle empty at 0, none at 100)", () => {
    expect(dashOffset(0, 100)).toBe(100);
    expect(dashOffset(64, 100)).toBeCloseTo(36);
    expect(dashOffset(100, 100)).toBe(0);
  });

  it("moves red → amber → green as the score rises", () => {
    expect(colourAt(10)).toBe("rgb(192, 50, 43)");
    expect(colourAt(58)).toBe("rgb(208, 122, 0)");
    expect(colourAt(95)).toBe("rgb(29, 122, 70)");
    // in between stops it blends
    expect(colourAt(42)).not.toBe(colourAt(30));
  });

  it("settles on the final band colour", () => {
    expect(bandColour(20)).toBe(BAND_COLOUR["Low visibility"]);
    expect(bandColour(64)).toBe(BAND_COLOUR.Developing);
    expect(bandColour(75)).toBe(BAND_COLOUR.Good);
    expect(bandColour(90)).toBe(BAND_COLOUR.Excellent);
  });
});
