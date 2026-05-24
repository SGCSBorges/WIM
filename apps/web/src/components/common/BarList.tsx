interface BarListItem {
  label: string;
  value: number;
}

interface BarListProps {
  items: BarListItem[];
  /** Format the numeric value for display (e.g. money or a count). */
  formatValue?: (n: number) => string;
  emptyLabel?: string;
}

/**
 * Dependency-free horizontal bar list. Each row shows a label, a proportional
 * bar (relative to the largest value), and the formatted value. Kept tiny on
 * purpose — no charting library, so it adds nothing to the bundle.
 */
export default function BarList({
  items,
  formatValue = (n) => String(n),
  emptyLabel,
}: BarListProps) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  if (items.length === 0) {
    return <p className="text-sm ui-text-muted">{emptyLabel ?? "—"}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it, idx) => {
        const pct = max > 0 ? Math.round((it.value / max) * 100) : 0;
        return (
          <div key={idx}>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <span className="truncate mr-2">{it.label}</span>
              <span className="ui-text-muted shrink-0">
                {formatValue(it.value)}
              </span>
            </div>
            <div className="h-2 rounded ui-panel overflow-hidden">
              <div
                className="h-full ui-icon-primary"
                style={{ width: `${pct}%` }}
                role="presentation"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
