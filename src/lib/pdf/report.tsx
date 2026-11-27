import path from "node:path";
import { Circle, Document, Font, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { CATEGORIES, CHECK_BY_ID } from "@/lib/checks/catalogue";
import { auditedOn, relPathOrUrl } from "@/lib/format";
import { bandColour } from "@/lib/gauge";
import type { AuditRecord } from "@/lib/schemas/audit";
import { STATUS_LABEL, type CheckResult, type CheckStatus } from "@/lib/schemas/check";
import { BAND_SUMMARY, formatScoreLine } from "@/lib/scoring";
import { GROUP_LABEL, buildTodo, type TodoGroup, type TodoItem } from "@/lib/todo";
import type { VisibilityData } from "@/lib/visibility/run";
import { PDF_COLOURS as C } from "./theme";

/**
 * The client-ready PDF of a finished audit, drawn with @react-pdf/renderer on the server.
 * Same content as the report page, minus the internal bits (AI cost, buttons), laid out for A4.
 * Fonts are the brand fonts (OFL licences in assets/fonts).
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const f = (name: string) => path.join(FONT_DIR, `${name}-normal.woff`);
  Font.register({ family: "Jakarta", fonts: [{ src: f("plus-jakarta-sans-latin-600"), fontWeight: 600 }, { src: f("plus-jakarta-sans-latin-700"), fontWeight: 700 }, { src: f("plus-jakarta-sans-latin-800"), fontWeight: 800 }] });
  Font.register({ family: "Barlow", fonts: [{ src: f("barlow-semi-condensed-latin-500"), fontWeight: 500 }] });
  Font.register({ family: "Geist", fonts: [{ src: f("geist-sans-latin-400"), fontWeight: 400 }, { src: f("geist-sans-latin-600"), fontWeight: 600 }] });
  Font.register({ family: "GeistMono", src: f("geist-mono-latin-400") });
  // No automatic hyphens: they split brand names and web addresses oddly.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

/** Let long web addresses wrap after / ? & = . so they don't run off the page. */
export function breakable(text: string): string {
  return text.replace(/([/?&=.#_-])(?=\S)/g, "$1​");
}

const STATUS_FILL: Record<CheckStatus, [string, string]> = {
  pass: [C["pass-soft"], C.pass],
  partial: [C["partial-soft"], C.partial],
  fail: [C["fail-soft"], C.fail],
  unable: [C["unable-soft"], C.unable],
};

const s = StyleSheet.create({
  page: { backgroundColor: C["paper-3"], color: C.navy, fontFamily: "Geist", fontSize: 9.5, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 48 },
  footerRule: { position: "absolute", bottom: 38, left: 48, right: 48, height: 0.75, backgroundColor: C.rule },
  footerText: { position: "absolute", bottom: 24, fontSize: 7.5, color: C.muted },
  // Never set lineHeight on the Page: react-pdf then drops the page-number text. Set it per block instead.
  body: {},
  kicker: { fontFamily: "Barlow", fontWeight: 500, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C["pink-ink"] },
  h1: { fontFamily: "Jakarta", fontWeight: 700, fontSize: 28, lineHeight: 1.1, letterSpacing: -0.6, marginTop: 6 },
  h2: { fontFamily: "Jakarta", fontWeight: 700, fontSize: 17, lineHeight: 1.15, letterSpacing: -0.3, marginBottom: 4 },
  h3: { fontFamily: "Jakarta", fontWeight: 700, fontSize: 11.5, marginTop: 14, marginBottom: 6 },
  lead: { fontSize: 9.5, color: C.muted, marginBottom: 12 },
  muted: { color: C.muted },
  strong: { fontWeight: 600 },
  card: { borderWidth: 0.75, borderColor: C.rule, borderRadius: 10, backgroundColor: "#ffffff", padding: 12 },
  chip: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7, fontSize: 7.5, fontWeight: 600 },
  section: { marginTop: 26 },
});

function Footer({ audit }: { audit: AuditRecord }) {
  return (
    <>
      <View fixed style={s.footerRule} />
      <Text fixed style={[s.footerText, { left: 48 }]}>{`Kwez GEO audit · ${audit.domain} · ${auditedOn(audit.createdAt)}`}</Text>
      <Text fixed style={[s.footerText, { left: 48, width: 499, textAlign: "right" }]} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </>
  );
}

/** The Kwez eye, same paths as EyeMark in src/components/Brand.tsx. */
function Eye({ size }: { size: number }) {
  return (
    <Svg viewBox="6 -34 566 566" width={size} height={size}>
      <Path fill={C.blue} d="M12 318 C 50 268 98 228 156 194 L 166 206 C 112 242 62 282 20 322 C 16 325 9 322 12 318 Z" />
      <Path fill={C.cyan} d="M88 236 C 150 110 232 25 332 25 C 432 25 497 70 499 128 C 500 152 474 162 452 152 C 430 142 412 112 382 96 C 342 74 292 70 247 90 C 192 115 152 160 124 214 Z" />
      <Path fill={C.violet} d="M110 224 C 170 175 260 145 340 148 C 372 149 392 150 400 138 C 408 126 404 116 396 110 C 432 126 448 150 470 155 C 490 159 499 146 499 128 C 502 176 470 210 420 208 C 380 206 350 190 300 182 C 230 172 170 197 124 228 Z" />
      <Path fill={C.violet} d="M80 345 C 95 335 130 330 160 338 C 185 345 178 368 182 378 C 195 400 270 410 338 398 C 312 430 270 452 215 452 C 130 452 78 405 80 345 Z" />
      <Path fill={C.plum} d="M508 226 C 440 290 370 318 300 322 C 240 326 200 296 150 296 C 110 296 82 318 80 345 C 95 335 130 330 160 338 C 185 345 178 368 182 378 C 190 392 230 384 282 364 C 352 338 442 300 508 226 Z" />
      <Path fill={C.pink} d="M558 177 C 565 175 568 180 565 186 C 520 282 440 472 250 472 C 190 472 140 457 115 432 C 170 447 250 442 320 402 C 400 357 470 290 558 177 Z" />
      <Circle fill={C.plum} cx="290" cy="248" r="46" />
    </Svg>
  );
}

function Lockup() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Eye size={40} />
      <View>
        <Text style={{ fontFamily: "Jakarta", fontWeight: 600, fontSize: 24, lineHeight: 1, letterSpacing: 0.1 }}>kwez</Text>
        <Text style={{ fontFamily: "Barlow", fontWeight: 500, fontSize: 5.2, letterSpacing: 0.5, color: C["pink-ink"], marginTop: 2 }}>GENERATIVE ENGINE OPTIMIZATION</Text>
      </View>
    </View>
  );
}

/** Arc path from 12 o'clock, clockwise, for a 0–100 value. */
export function arcPath(cx: number, cy: number, r: number, value: number): string {
  const v = Math.max(0, Math.min(99.999, value));
  const a = (v / 100) * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${v > 50 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function ScoreDial({ score, size = 150 }: { score: number | null; size?: number }) {
  const stroke = size * 0.075;
  const r = (size - stroke) / 2;
  const c = size / 2;
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={r} fill="none" stroke={C.rule} strokeWidth={stroke} />
        {score !== null && score > 0 && <Path d={arcPath(c, c, r, score)} fill="none" stroke={bandColour(score)} strokeWidth={stroke} strokeLinecap="round" />}
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "Jakarta", fontWeight: 700, fontSize: size * 0.3, lineHeight: 1 }}>{score ?? "–"}</Text>
        <Text style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>out of 100</Text>
      </View>
    </View>
  );
}

function Chip({ fill, ink, children }: { fill: string; ink: string; children: React.ReactNode }) {
  return <Text style={[s.chip, { backgroundColor: fill, color: ink }]}>{children}</Text>;
}

function Summary({ audit }: { audit: AuditRecord }) {
  const sc = audit.score!;
  const name = audit.input.companyName || audit.domain;
  const counts = sc.categories.reduce(
    (acc, c) => ({ pass: acc.pass + c.counts.pass, partial: acc.partial + c.counts.partial, fail: acc.fail + c.counts.fail, unable: acc.unable + c.counts.unable }),
    { pass: 0, partial: 0, fail: 0, unable: 0 },
  );
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 0.75, borderBottomColor: C.rule }}>
        <Lockup />
        <Text style={s.kicker}>GEO visibility audit</Text>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={s.kicker}>Prepared for</Text>
        <Text style={[s.h1, { fontSize: 26 }]}>{name}</Text>
        <Text style={{ marginTop: 6, color: C.muted }}>
          {breakable(audit.domain)} · audited {auditedOn(audit.createdAt)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 28, alignItems: "center", marginTop: 14 }}>
        <View style={{ alignItems: "center" }}>
          <ScoreDial score={sc.overall} size={124} />
          <Text style={{ marginTop: 8, fontFamily: "Jakarta", fontWeight: 700, fontSize: 12, color: sc.overall === null ? C.unable : bandColour(sc.overall) }}>{sc.band ?? "Not scored"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, color: C.muted }}>GEO Visibility Score</Text>
          <Text style={{ fontWeight: 600, color: C["ink-2"], marginTop: 2 }}>{formatScoreLine(sc)}</Text>
          {sc.band && <Text style={{ fontSize: 13, lineHeight: 1.4, marginTop: 8 }}>{BAND_SUMMARY[sc.band]}</Text>}
          <Text style={{ marginTop: 10, color: C.muted }}>
            The score measures how easily AI assistants such as ChatGPT, Claude, Gemini and Perplexity can find, understand and recommend this business. It
            combines 72 checks across 9 categories.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
            <Chip fill={C["pass-soft"]} ink={C.pass}>{`${counts.pass} pass`}</Chip>
            <Chip fill={C["partial-soft"]} ink={C.partial}>{`${counts.partial} partial`}</Chip>
            <Chip fill={C["fail-soft"]} ink={C.fail}>{`${counts.fail} fail`}</Chip>
            <Chip fill={C["unable-soft"]} ink={C.unable}>{`${counts.unable} unable to verify`}</Chip>
          </View>
        </View>
      </View>

      {sc.provisional && (
        <Text style={{ marginTop: 14, padding: 9, borderRadius: 6, backgroundColor: C["partial-soft"], color: C.partial }}>
          Provisional score: only {sc.coveragePct}% of checks could be assessed, so this score may change as more information becomes available.
        </Text>
      )}

      <View style={{ marginTop: 18 }}>
        <Text style={s.h2}>Category breakdown</Text>
        <Text style={[s.lead, { marginBottom: 8 }]}>Each category is scored out of 100. Weight shows how much it counts towards the overall score.</Text>
        <View style={[s.card, { paddingVertical: 6 }]}>
          {CATEGORIES.map((cat, i) => {
            const cs = sc.categories.find((c) => c.categoryId === cat.id)!;
            const assessed = cs.counts.pass + cs.counts.partial + cs.counts.fail;
            const total = assessed + cs.counts.unable;
            const value = cs.score === null ? null : Math.round(cs.score);
            return (
              <View key={cat.id} wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2.5, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.rule }}>
                <View style={{ width: 210 }}>
                  <Text style={{ fontWeight: 600, fontSize: 9 }}>{cat.name}</Text>
                  <Text style={{ fontSize: 7, color: C.muted }}>
                    {assessed} of {total} checks assessed · weight {cat.weight}
                  </Text>
                </View>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.rule, overflow: "hidden" }}>
                  {value !== null && <View style={{ width: `${Math.max(value, 1.5)}%`, height: 6, borderRadius: 3, backgroundColor: bandColour(value) }} />}
                </View>
                <Text style={{ width: 26, textAlign: "right", fontWeight: 600, fontSize: value === null ? 7.5 : 10, color: value === null ? C.muted : C.navy }}>{value ?? "n/a"}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const GROUPS: TodoGroup[] = ["week", "month", "bigger"];

function Todo({ items }: { items: TodoItem[] }) {
  let n = 0;
  return (
    <View>
      <Text style={s.h2}>Your to-do list</Text>
      <Text style={s.lead}>
        {items.length
          ? `${items.length} fix${items.length === 1 ? "" : "es"}, most valuable first. “Kwez can fix this” items are ones Kwez can do for you.`
          : "Nothing to fix among the checks that could be assessed."}
      </Text>
      {GROUPS.map((g) => {
        const group = items.filter((i) => i.group === g);
        if (!group.length) return null;
        return (
          <View key={g}>
            <Text style={s.h3} minPresenceAhead={60}>
              {GROUP_LABEL[g].title} <Text style={{ fontFamily: "Geist", fontWeight: 400, fontSize: 9, color: C.muted }}>({group.length}) · {GROUP_LABEL[g].blurb}</Text>
            </Text>
            {group.map((item) => {
              n++;
              return <TodoCard key={item.checkId} item={item} n={n} />;
            })}
          </View>
        );
      })}
    </View>
  );
}

function TodoCard({ item, n }: { item: TodoItem; n: number }) {
  const kwez = item.tag === "Kwez can fix this";
  return (
    <View wrap={false} style={[s.card, { flexDirection: "row", gap: 10, marginBottom: 7 }]}>
      <Text style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.paper, textAlign: "center", fontSize: 8, fontWeight: 600, color: C.muted, paddingTop: 3.5 }}>{n}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ flex: 1, fontWeight: 600, fontSize: 10 }}>{item.title}</Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Chip fill={kwez ? C["accent-soft"] : C.paper} ink={kwez ? C["accent-strong"] : C.navy}>{item.tag}</Chip>
            {item.status === "partial" && <Chip fill={C["partial-soft"]} ink={C.partial}>Partly done</Chip>}
            <Chip fill={C.paper} ink={C.muted}>{`${item.impact} impact`}</Chip>
          </View>
        </View>
        <Text style={{ color: C.muted, marginTop: 3 }}>{item.why}</Text>
        <Text style={{ marginTop: 3 }}>
          <Text style={s.strong}>What to do: </Text>
          {item.change}
        </Text>
        {item.pages.length > 0 && (
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 3 }}>
            <Text style={{ fontWeight: 600, color: C.navy }}>Pages: </Text>
            {breakable(item.pages.slice(0, 5).map(relPathOrUrl).join(", "))}
            {item.pages.length > 5 ? ` and ${item.pages.length - 5} more` : ""}
          </Text>
        )}
        {item.explain.map((e) => (
          <Text key={e.term} style={{ fontSize: 7.5, marginTop: 3, paddingLeft: 6, borderLeftWidth: 1.5, borderLeftColor: C["accent-soft"], color: C["ink-2"] }}>
            <Text style={{ fontWeight: 600, color: C.navy }}>{e.question.replace("'", "’")} </Text>
            {e.definition.charAt(0).toUpperCase() + e.definition.slice(1)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Visibility({ audit }: { audit: AuditRecord }) {
  const v = audit.extras.visibility as VisibilityData | undefined;
  const name = audit.input.companyName || audit.domain;
  if (!v?.answers?.length) {
    const r = audit.results.find((x) => x.id === "9.10");
    const reason = !audit.input.options.runVisibility || !r?.issue || INTERNAL.test(r.issue) ? "AI visibility tests weren't run for this audit." : r.issue;
    return (
      <View>
        <Text style={s.h2}>AI visibility</Text>
        <Text style={[s.card, { color: C.muted }]}>{reason}</Text>
      </View>
    );
  }
  const answered = v.answers.filter((a) => !a.error);
  const hits = answered.filter((a) => a.mentioned).length;
  const pct = answered.length ? Math.round((hits / answered.length) * 100) : 0;
  return (
    <View>
      <Text style={s.h2} minPresenceAhead={120}>AI visibility</Text>
      <Text style={s.lead}>How often an AI assistant mentions this business when asked questions by people who don&rsquo;t know it yet.</Text>
      <View style={[s.card, { padding: 0 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 0.75, borderBottomColor: C.rule }}>
          <Text style={{ fontFamily: "Jakarta", fontWeight: 700, fontSize: 22 }}>
            {hits}/{answered.length}
          </Text>
          <Text style={{ flex: 1, color: C.muted }}>
            {v.label} named <Text style={{ fontWeight: 600, color: C.navy }}>{name}</Text> in {pct}% of answers to{" "}
            {v.promptSource === "supplied" ? "the example questions supplied" : "questions a new customer might ask"} (with web search on).
          </Text>
        </View>
        {v.answers.map((a, i) => {
          const [fill, ink] = a.error ? STATUS_FILL.unable : a.mentioned ? STATUS_FILL.pass : STATUS_FILL.fail;
          return (
            <View key={i} wrap={false} style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.rule }}>
              <Text style={[s.chip, { backgroundColor: fill, color: ink, width: 62, textAlign: "center" }]}>{a.error ? "No answer" : a.mentioned ? "Named" : "Not named"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 600 }}>&ldquo;{a.prompt}&rdquo;</Text>
                <Text style={{ color: C.muted, fontSize: 8.5 }}>
                  {a.error
                    ? "This question couldn't be answered during the test."
                    : a.mentioned
                      ? a.recommended
                        ? "Recommended."
                        : "Named, but not recommended."
                      : a.others.length
                        ? `Named instead: ${a.others.slice(0, 5).join(", ")}${a.others.length > 5 ? "…" : ""}`
                        : "Not named. No specific businesses recommended."}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Checks({ results }: { results: CheckResult[] }) {
  return (
    <View>
      <Text style={s.h2}>All checks</Text>
      <Text style={s.lead}>Every check with its result. For anything that isn&rsquo;t a pass, the finding, what to change and the main evidence are listed.</Text>
      {CATEGORIES.map((cat) => {
        const rows = results.filter((r) => CHECK_BY_ID.get(r.id)?.categoryId === cat.id);
        return (
          <View key={cat.id} style={{ marginBottom: 10 }}>
            <Text style={[s.h3, { marginTop: 8 }]} minPresenceAhead={50}>
              {cat.id}. {cat.name}
            </Text>
            {rows.map((r) => (
              <CheckRow key={r.id} r={r} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Setup notes meant for Kwez ("Add ANTHROPIC_API_KEY to .env.local…") don't belong in a client's report. */
const INTERNAL = /API_KEY|\.env\b|env\.local|not implemented in this build|not configured/i;

export function clientFacing(r: CheckResult): { issue: string; change: string } {
  if (r.status === "unable" && (INTERNAL.test(r.issue) || INTERNAL.test(r.requiredChange))) return { issue: "Not assessed in this audit.", change: "" };
  return { issue: r.issue, change: r.requiredChange };
}

function CheckRow({ r }: { r: CheckResult }) {
  const meta = CHECK_BY_ID.get(r.id)!;
  const { issue, change } = clientFacing(r);
  const [fill, ink] = STATUS_FILL[r.status];
  const detail = r.status !== "pass";
  return (
    <View wrap={false} style={{ flexDirection: "row", gap: 8, paddingVertical: 4.5, borderTopWidth: 0.5, borderTopColor: C.rule }}>
      <Text style={{ width: 22, fontFamily: "GeistMono", fontSize: 7.5, color: C.muted, paddingTop: 1 }}>{r.id}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9 }}>{meta.title}</Text>
        {detail && issue && <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{issue}</Text>}
        {detail && change && (
          <Text style={{ fontSize: 7.5, marginTop: 2 }}>
            <Text style={s.strong}>{r.status === "unable" ? "Recommendation: " : "What to change: "}</Text>
            {change}
          </Text>
        )}
        {detail &&
          r.evidence.slice(0, 2).map((e, i) => (
            <Text key={i} style={{ fontSize: 7, color: C["ink-2"], marginTop: 2, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: C.rule }}>
              <Text style={s.strong}>{e.label}: </Text>
              {e.kind === "snippet" ? `“${e.value}”` : breakable(e.value.length > 180 ? `${e.value.slice(0, 180)}…` : e.value)}
            </Text>
          ))}
      </View>
      <Text style={[s.chip, { backgroundColor: fill, color: ink, alignSelf: "flex-start", width: 72, textAlign: "center" }]}>{STATUS_LABEL[r.status]}</Text>
    </View>
  );
}

function Disclaimer() {
  return (
    <View wrap={false} style={{ marginTop: 22, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: C.rule }}>
      <Text style={{ fontSize: 8, color: C.muted }}>
        <Text style={{ fontWeight: 600, color: C.navy }}>About this report. </Text>
        The score is Kwez&rsquo;s own estimate of how easily AI assistants can find and describe this business, based on the website and the web on the
        day of the audit. Some checks are judged by AI, and AI assistants can answer the same question differently from day to day. It is not endorsed by
        any AI company and does not guarantee mentions, rankings, traffic or sales. It is not legal, financial or security advice. Kwez&rsquo;s full audit
        disclaimer applies.
      </Text>
    </View>
  );
}

export function ReportDocument({ audit }: { audit: AuditRecord }) {
  const name = audit.input.companyName || audit.domain;
  const todo = buildTodo(audit.results);
  return (
    <Document title={`GEO audit: ${name}`} author="Kwez" subject="GEO visibility audit" creator="Kwez GEO Audit" producer="Kwez GEO Audit" language="en-GB">
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          <Summary audit={audit} />
        </View>
        <Footer audit={audit} />
      </Page>
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          <Todo items={todo} />
          <View style={s.section}>
            <Visibility audit={audit} />
          </View>
        </View>
        <Footer audit={audit} />
      </Page>
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          <Checks results={audit.results} />
          <Disclaimer />
        </View>
        <Footer audit={audit} />
      </Page>
    </Document>
  );
}

/** Render a finished audit as a PDF file. */
export async function renderReportPdf(audit: AuditRecord): Promise<Buffer> {
  if (audit.status !== "complete" || !audit.score) throw new Error("Only finished audits can be turned into a PDF.");
  registerFonts();
  return renderToBuffer(<ReportDocument audit={audit} />);
}

/** "kwez-geo-audit-bright-spark-electrical-2026-11-27.pdf" */
export function pdfFileName(audit: AuditRecord): string {
  const slug = (audit.input.companyName || audit.domain)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "report";
  return `kwez-geo-audit-${slug}-${audit.createdAt.slice(0, 10)}.pdf`;
}
