---
version: 1
name: Kwez GEO Audit
description: >-
  A warm, editorial working tool. Cream paper, near-black ink, one terracotta
  accent taken from the Kwez eye logo, a slab serif for headings and a clean
  sans for everything else. It should feel like a careful consultant's report
  that you can click on, not a SaaS dashboard: calm, plain English, every
  number explained.

colors:
  paper: "#faf6f0"          # page background
  paper-2: "#f2ece4"        # hover fills, quiet panels
  paper-3: "#fefcfa"        # cards and inputs
  ink: "#1c1916"            # headings and body text
  ink-2: "#3d3732"          # strong secondary text
  muted: "#6b625a"          # captions, help text, input borders
  rule: "#ebe2d7"           # hairlines and card borders
  brand: "#cc7243"          # the logo's terracotta: decoration only, never text
  accent: "#ad5527"         # primary buttons, links, active nav
  accent-strong: "#8f4520"  # accent on hover / accent text on soft fills
  accent-soft: "#fbeee5"    # active nav pill, "Kwez can fix this" tag
  accent-ink: "#fcfaf6"     # text on accent
  focus: "#c84000"          # focus ring
  pass: "#1b7a46"
  pass-soft: "#e3f3e9"
  partial: "#8a6100"
  partial-soft: "#fbf1d6"
  fail: "#c0322a"
  fail-soft: "#fbe5e3"
  unable: "#6b6a72"
  unable-soft: "#ecebe8"

typography:
  display:
    fontFamily: "Bitter, Georgia, serif"
    fontWeight: 700
    letterSpacing: -0.02em
    lineHeight: 1.05
    use: "h1 page titles, h2 section titles, h3 card group titles"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
  numbers:
    fontFamily: "Geist, system-ui, sans-serif"
    fontVariantNumeric: tabular-nums
    use: "scores, counts and percentages; never a monospace font for a sentence"
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    use: "only real code, file paths in evidence and the running-audit log"

rounded:
  input: 10px     # inputs and rectangular buttons
  card: 16px      # cards and panels
  pill: 999px     # chips, tags, nav pills

spacing: [2px, 4px, 8px, 12px, 16px, 24px, 40px, 64px, 96px]

components:
  button-primary: { background: accent, text: accent-ink, rounded: input, minHeight: 40px, weight: 600, hover: accent-strong }
  button-secondary: { background: paper-3, border: rule, text: ink, rounded: input, minHeight: 40px, hover: "border accent, text accent" }
  nav-link: { text: ink-soft, rounded: pill, active: "accent-soft fill, accent-strong text" }
  card: { background: paper-3, border: "1px rule", rounded: card, shadow: none }
  chip-status: { rounded: pill, pattern: "<state>-soft fill with <state> text" }
  score-dial: { stroke: 18px, track: rule, colour: "band colour (red, amber, green)" }
---

# Kwez GEO Audit design system

The source of truth for values is `src/app/tokens.css` (Tailwind v4 `@theme`);
this file explains how to use them. If the two disagree, `tokens.css` wins and
this file should be updated. The YAML above follows the DESIGN.md format from
Google Stitch, as collected in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md).
Two systems from that collection were used as reference and are kept in
`docs/design-references/` (see the README there): the warm cream and serif
editorial system closest to the Kwez brand, and a data-dense payments
dashboard system for how to present numbers. Kwez's own brand always wins over
either reference.

## 1. Feel

- **Warm and trustworthy, not techy.** The owner sells to small UK businesses.
  Cream paper and a slab serif read as a considered report; avoid cold blues,
  gradients, glass, neon and dark "AI" styling.
- **Plain English first.** Every number gets a sentence saying what it means.
  Jargon gets a short definition next to it.
- **One accent.** Terracotta is the only brand colour. Green, amber, red and
  grey are reserved for check results (pass, partial, fail, unable to verify)
  and must never be used for decoration.

## 2. Colour rules

- Text is `ink`, secondary text `muted` (`text-ink-soft`). `brand` (the lighter
  terracotta) fails contrast as text: use it only for the logo, the progress
  bar gradient and the favourite star.
- Primary actions use `accent` with `accent-ink` text. There is one filled
  primary button per screen.
- Status always pairs a soft fill with its strong text colour
  (`bg-pass-soft text-pass`), and always carries a word, never colour alone.
- Do not write colour literals in components; add a token to `tokens.css`.

## 3. Type rules

- Bitter (slab serif) for headings only. Geist for everything else, including
  buttons and labels.
- Numbers that line up (scores, counts, coverage) use `tabular-nums`.
- Monospace is for code and file paths, not for sentences or scores.
- British spelling and sentence case everywhere ("Run GEO audit", not
  "Run GEO Audit").

## 4. Layout

- Content width `max-w-5xl` (about 1024px) with 16px side gutters on phones.
- Forms: a label column (section title and one line of help) beside the
  fields on desktop, stacked on phones. Sections separated by hairlines, not
  nested boxes.
- The report leads with the score dial beside the business name, then a
  sticky section bar (Categories, To-do list, AI visibility, Full evidence
  report) that shows where you are.
- Cards sit one level deep: no card inside a card. Use a hairline or a quiet
  `paper` fill inside a card instead.

## 5. Components

- **Score dial** (`ScoreGauge.tsx`): the signature element. Large on the
  report, `mini` (44px) in lists such as Past audits. Colour comes from the
  score band.
- **Category bars** (`CategoryBars.tsx`): a full-width track in `rule`, the fill
  in the band colour, hatched when a category couldn't be assessed.
- **To-do cards** (`TodoList.tsx`): number, title, tags (Kwez can fix this / DIY
  tweak, impact), why, "What to do", pages, then a small "Jargon" list
  separated by a hairline.
- **Chips**: pill, `text-xs` or `text-sm`, soft fill plus strong text.
- **Eye loader** (`Brand.tsx`): the only loading indicator. It blinks; it
  never spins.

## 6. Motion

Calm and brief: 120ms for presses, 220ms for colour changes, 420ms for bars
and the logo reveal, ease-out. The score dial counts up once. Everything
respects `prefers-reduced-motion` and still shows its final state without
JavaScript.

## 7. Accessibility

- Visible focus ring (`focus`, 2px) on every control.
- Tap targets at least 36px high (40px for buttons).
- Contrast of body text at least 4.5:1 on `paper` and `paper-3`.
- No horizontal scrolling at 360px wide.

## 8. Prompt guide for AI agents

When asked to change the UI: read `src/app/tokens.css` and this file first,
reuse the existing Tailwind token classes (`bg-paper-3`, `text-ink-soft`,
`border-line`, `rounded-card`, `rounded-input`, `text-accent`, `bg-pass-soft`),
keep one primary button per screen, and check the change at 1440px and 390px
wide. The Hallmark skill in `.claude/skills/hallmark` reads this file as the
project's locked system.
