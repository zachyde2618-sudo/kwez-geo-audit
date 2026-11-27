/**
 * Colours for the PDF report. A PDF can't read CSS variables, so these copy the values in
 * src/app/tokens.css (tests/pdf.test.ts checks they still match). Change tokens.css first.
 */
export const PDF_COLOURS = {
  cyan: "#00f0ff",
  blue: "#0055d4",
  violet: "#7d26cd",
  plum: "#6b1a6b",
  pink: "#ff1493",
  navy: "#1a2033",
  "pink-ink": "#c4006a",
  paper: "#f4f2ee",
  "paper-2": "#eae7e1",
  "paper-3": "#fdfcfa",
  "ink-2": "#3a4157",
  muted: "#5c6275",
  rule: "#e1dee3",
  "accent-strong": "#5c1a9a",
  "accent-soft": "#f1e8fb",
  pass: "#127a45",
  "pass-soft": "#e2f3e8",
  partial: "#8a5a00",
  "partial-soft": "#fbf0d4",
  fail: "#c4262e",
  "fail-soft": "#fce6e6",
  unable: "#5f6170",
  "unable-soft": "#e9e8ec",
} as const;

export type PdfColour = keyof typeof PDF_COLOURS;
