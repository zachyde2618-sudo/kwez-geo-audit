import { relPathOrUrl } from "@/lib/format";
import { GROUP_LABEL, type TodoGroup, type TodoItem } from "@/lib/todo";

const GROUPS: TodoGroup[] = ["week", "month", "bigger"];

export function TodoList({ items }: { items: TodoItem[] }) {
  if (!items.length) {
    return (
      <p className="rounded-card border border-line bg-card p-6 text-ink-soft">
        Nothing to fix among the checks we could assess. Checks marked Unable to Verify are listed in the full report below.
      </p>
    );
  }
  let n = 0;
  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const group = items.filter((i) => i.group === g);
        if (!group.length) return null;
        return (
          <section key={g} aria-labelledby={`todo-${g}`}>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h3 id={`todo-${g}`} className="text-lg font-semibold tracking-tight">
                {GROUP_LABEL[g].title} <span className="text-ink-soft font-normal">({group.length})</span>
              </h3>
              <p className="hidden sm:block text-sm text-ink-soft">{GROUP_LABEL[g].blurb}</p>
            </div>
            <ol className="space-y-3">
              {group.map((item) => {
                n++;
                return <TodoCard key={item.checkId} item={item} n={n} />;
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function TodoCard({ item, n }: { item: TodoItem; n: number }) {
  return (
    <li className="rounded-card border border-line bg-card p-4 sm:p-5 break-inside-avoid">
      <div className="flex gap-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-sm font-semibold tabular-nums text-ink-soft" aria-hidden="true">
          {n}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h4 className="font-semibold leading-snug">{item.title}</h4>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className={`rounded-full px-2.5 py-0.5 font-semibold ${item.tag === "Kwez can fix this" ? "bg-accent-soft text-accent" : "bg-paper text-ink"}`}>{item.tag}</span>
              {item.status === "partial" && <span className="rounded-full bg-partial-soft px-2.5 py-0.5 font-semibold text-partial">Partly done</span>}
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-ink-soft">{item.impact} impact</span>
            </div>
          </div>
          <p className="text-sm text-ink-soft">{item.why}</p>
          <p className="text-sm">
            <span className="font-semibold">What to do: </span>
            {item.change}
          </p>
          {item.pages.length > 0 && (
            <p className="text-xs text-ink-soft">
              <span className="font-semibold text-ink">Pages: </span>
              {item.pages.slice(0, 5).map((p, i) => (
                <span key={p}>
                  {i > 0 && ", "}
                  <a href={p} target="_blank" rel="noopener noreferrer" title={p} className="inline-block max-w-full truncate whitespace-nowrap align-bottom underline decoration-line underline-offset-2 hover:text-accent sm:max-w-[28rem]">
                    {relPathOrUrl(p)}
                  </a>
                </span>
              ))}
              {item.pages.length > 5 && ` and ${item.pages.length - 5} more`}
            </p>
          )}
          {item.explain.length > 0 && (
            <dl className="space-y-1.5 border-l-2 border-accent-soft pl-3 text-xs">
              {item.explain.map((e) => (
                <div key={e.term}>
                  <dt className="inline font-semibold">{e.question.replace("'", "\u2019")} </dt>
                  <dd className="m-0 inline text-ink-2">{e.definition.charAt(0).toUpperCase() + e.definition.slice(1)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-ink-soft">
            <a href={`#check-${item.checkId}`} className="hover:text-accent">Check {item.checkId} in the full report</a>
          </p>
        </div>
      </div>
    </li>
  );
}
