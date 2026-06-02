/**
 * ⌘K command palette. Renders inside the accessible `Modal` shell (focus
 * trap, Esc, backdrop) and exposes a single search box over a list of
 * `CommandItem`s grouped by section. Static commands (navigation, actions)
 * are filtered client-side; an optional async `search` contributes extra
 * results for the current query (e.g. matching articles). Arrow keys move
 * the active row, Enter runs it.
 *
 * The component is intentionally dumb about *what* the commands are — the
 * shell assembles them (nav targets, actions, article search) and passes
 * them in, which keeps this reusable and unit-testable in isolation.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../common/Modal";

export interface CommandItem {
  id: string;
  label: string;
  /** Section heading this item is grouped under. */
  group: string;
  hint?: string;
  icon?: ReactNode;
  /** Extra text matched against the query (synonyms, model numbers…). */
  keywords?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
  /** Optional async source for query-dependent results (debounced). */
  search?: (query: string) => Promise<CommandItem[]>;
  placeholder: string;
  emptyLabel: string;
}

function matchesQuery(item: CommandItem, q: string): boolean {
  if (!q) return true;
  const haystack = `${item.label} ${item.keywords ?? ""}`.toLowerCase();
  return haystack.includes(q);
}

export function CommandPalette({
  open,
  onClose,
  commands,
  search,
  placeholder,
  emptyLabel,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<CommandItem[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const titleId = "command-palette-title";

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setRemote([]);
      setActive(0);
    }
  }, [open]);

  // Debounced async search.
  useEffect(() => {
    if (!open || !search) return;
    const q = query.trim();
    if (!q) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void search(q)
        .then((items) => {
          if (!cancelled) setRemote(items);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, search]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = commands.filter((c) => matchesQuery(c, q));
    return [...local, ...remote];
  }, [commands, remote, query]);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActive((i) =>
      results.length === 0 ? 0 : Math.min(i, results.length - 1)
    );
  }, [results.length]);

  // Group preserving first-seen order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, CommandItem[]>();
    for (const item of results) {
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, []);
        order.push(item.group);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [results]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.perform();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        results.length ? (i - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  };

  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${active}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={titleId}
      panelClassName="ui-card self-start mt-[10vh] w-full max-w-xl overflow-hidden p-0 shadow-2xl"
    >
      <h2 id={titleId} className="sr-only">
        {placeholder}
      </h2>
      <div className="border-b border-line p-3">
        {/* Modal focuses the first focusable on open — this input. */}
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={
            results[active] ? `cmd-${results[active].id}` : undefined
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-base outline-none ui-title placeholder:ui-text-muted"
        />
      </div>

      <ul
        ref={listRef}
        id="command-palette-list"
        role="listbox"
        aria-label={placeholder}
        className="max-h-[60vh] overflow-y-auto p-2"
      >
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm ui-text-muted">
            {emptyLabel}
          </li>
        )}
        {groups.map(({ group, items }) => (
          <li key={group}>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide ui-text-muted">
              {group}
            </p>
            <ul>
              {items.map((item) => {
                const index = results.indexOf(item);
                const selected = index === active;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      id={`cmd-${item.id}`}
                      data-cmd-index={index}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                        selected
                          ? "bg-primary text-primary-contrast"
                          : "ui-title"
                      }`}
                    >
                      {item.icon && (
                        <span aria-hidden="true" className="shrink-0">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span
                          className={`shrink-0 text-xs ${
                            selected ? "" : "ui-text-muted"
                          }`}
                        >
                          {item.hint}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
