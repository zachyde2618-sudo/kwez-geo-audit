---
version: 2
name: Kwez GEO Audit
description: >-
  Modern, minimal and flat. A light paper background, dark navy ink, and the
  Kwez eye: two interlocking swoops in flat electric cyan, blue, violet, plum
  and pink, with no gradients, glows or shadows. Bold geometric sans for the
  "kwez" wordmark and headings, an all-caps pink tagline, a clean sans for
  everything else. Calm, plain English, every number explained.

colors:
  # Brand board (2026). Use for the mark and small accents only.
  cyan: "#00F0FF"           # Electric Cyan: mark only (fails contrast as text)
  blue: "#0055D4"           # Neon Blue: focus ring, links on hover
  violet: "#7D26CD"         # Royal Violet: the accent (buttons, current nav)
  plum: "#6B1A6B"           # "Magenta" swatch on the board (labelled #FF007F; the swatch is plum)
  pink: "#FF1493"           # Neon Pink: mark, favourite star, decoration
  navy: "#1A2033"           # Core Dark Blue (labelled #FF1493 on the board; the swatch is navy)
  # Interface roles
  paper: "#f4f2ee"          # page background (the board's paper)
  paper-2: "#eae7e1"        # hover fills, quiet panels
  paper-3: "#fdfcfa"        # cards and inputs
  ink: "{colors.navy}"      # headings and body text
  ink-2: "#3a4157"          # strong secondary text
  muted: "#5c6275"          # captions, help text, input borders
  rule: "#e1dee3"           # hairlines and card borders
  accent: "{colors.violet}"
  accent-strong: "#5c1a9a"  # accent hover, accent text on soft fills
  accent-soft: "#f1e8fb"    # current nav pill, "Kwez can fix this" tag
  accent-ink: "#ffffff"     # text on accent
  pink-ink: "#c4006a"       # pink text (the tagline); pure pink is too light for small text
  focus: "{colors.blue}"
  # Check results (never used for decoration)
  pass: "#127a45"
  pass-soft: "#e2f3e8"
  partial: "#8a5a00"
  partial-soft: "#fbf0d4"
  fail: "#c4262e"
  fail-soft: "#fce6e6"
  unable: "#5f6170"
  unable-soft: "#e9e8ec"

typography:
  wordmark:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: -0.045em
    case: lowercase ("kwez")
  tagline:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontWeight: 600
    letterSpacing: 0.12em
    case: uppercase
    color: "{colors.pink-ink}"
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 700
    letterSpacing: -0.025em
    lineHeight: 1.05
    use: "h1 page titles, h2 section titles, h3 group titles"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
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
  logo: { mark: "EyeMark (inline SVG, src/components/Brand.tsx; file public/brand/kwez-eye.svg)", header: "eye alone; the kwez wordmark and tagline slide out on hover or focus" }
  button-primary: { background: accent, text: accent-ink, rounded: input, minHeight: 40px, weight: 600, hover: accent-strong }
  button-secondary: { background: paper-3, border: rule, text: ink, rounded: input, minHeight: 40px, hover: "border accent, text accent" }
  nav-link: { text: muted, rounded: pill, current: "accent-soft fill, accent-strong text" }
  card: { background: paper-3, border: "1px rule", rounded: card, shadow: none }
  chip-status: { rounded: pill, pattern: "<state>-soft fill with <state> text" }
  score-dial: { stroke: 18px, track: rule, colour: "band colour (red, amber, green)" }
  loader: { element: "the eye mark, blinking", forbidden: "spinners, glows, pulses" }
---

# Kwez GEO Audit design system

The source of truth for values is `src/app/tokens.css` (Tailwind v4 `@theme`);
this file explains how to use them. If the two disagree, `tokens.css` wins and
this file should be updated. The YAML above follows the DESIGN.md format from
Google Stitch, as collected in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md).
Reference systems from that collection are kept in `docs/design-references/`
(see the README there). The Kwez brand board (`docs/brand/kwez-brand-board.jpeg`,
2026) always wins over any reference.

## 1. Feel

- **Modern, minimal, flat.** Light paper, dark navy text, lots of space. The
  colour comes from the Kwez eye, not from the interface around it.
- **No gradients, glows or shadows** anywhere: not on the mark, buttons, cards
  or bars. Flat, matte, block colours only.
- **Plain English first.** Every number gets a sentence saying what it means.
  Jargon gets a short definition next to it.

## 2. Colour rules

- Text is `ink` (navy), secondary text `muted` (`text-ink-soft`).
- **Royal Violet is the one interface accent**: primary buttons, the current
  nav item, links on hover. There is one filled primary button per screen.
- Cyan, blue, plum and pink belong to the mark. Elsewhere they appear only as
  small accents: blue for the focus ring, pink for the favourite star, the
  darker `pink-ink` for the tagline. Cyan never carries text.
- Green, amber, red and grey are reserved for check results (pass, partial,
  fail, unable to verify), always as a soft fill with its strong text colour,
  and always with a word, never colour alone.
- Do not write colour literals in components; add a token to `tokens.css`.
- The brand board's hex labels for two swatches are wrong: "Magenta" is
  labelled #FF007F but the swatch is plum (#6B1A6B), and "Core Dark Blue" is
  labelled #FF1493 but the swatch is navy (#1A2033). We follow the swatches.

## 3. Type rules

- Plus Jakarta Sans (bold geometric sans) for the "kwez" wordmark and all
  headings. Geist for everything else, including buttons and labels.
- The tagline is all caps in Barlow Semi Condensed, pink.
- Numbers that line up (scores, counts, coverage) use `tabular-nums`.
- Monospace is for code and file paths, not for sentences or scores.
- British spelling and sentence case everywhere ("Run GEO audit").

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

- **Score dial** (`ScoreGauge.tsx`): the report's main element. Large on the
  report, `mini` (44px) in lists such as Past audits. Colour comes from the
  score band.
- **Category bars** (`CategoryBars.tsx`): a full-width track in `rule`, the fill
  in the band colour, hatched when a category couldn't be assessed.
- **To-do cards** (`TodoList.tsx`): number, title, tags (Kwez can fix this / DIY
  tweak, impact), why, "What to do", pages, then a small "Jargon" list
  separated by a hairline.
- **Chips**: pill, `text-xs` or `text-sm`, soft fill plus strong text.
- **Logo** (`Brand.tsx`): `EyeMark` is the flat SVG eye; `BrandLogo` shows
  the eye alone in the header, and the "kwez" wordmark with its tagline slides
  out of it on hover or keyboard focus. The footer shows eye and wordmark.
  The home page shows a large eye beside the headline on desktop.
- **Eye loader** (`Brand.tsx`): the only loading indicator. The eye blinks; it
  never spins, glows or pulses.

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
`border-line`, `rounded-card`, `rounded-input`, `text-accent`, `bg-pass-soft`,
`bg-violet`, `text-pink-ink`), keep everything flat,
keep one primary button per screen, and check the change at 1440px and 390px
wide. The Hallmark skill in `.claude/skills/hallmark` reads this file as the
project's locked system.
