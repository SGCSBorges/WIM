/**
 * Renders a tag as a small pill. When the tag has a `color` (#RRGGBB) the
 * pill is filled with it and the text flips to black/white based on the
 * background's luminance for contrast; without a color it falls back to the
 * neutral design-system Badge so untinted tags look exactly as before.
 *
 * Used everywhere a tag is shown (article detail, list rows/cards, filter
 * pills) so colouring stays consistent across surfaces.
 */
import { Badge } from "../ui";

/** Preset swatches offered in the Tags manager. Chosen to read on both the
 *  light and dark themes; the user can still store any #RRGGBB value. */
export const TAG_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

/** WCAG 2.x relative luminance of a #RRGGBB colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** WCAG contrast ratio between two #RRGGBB colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a) ?? 0;
  const lb = relativeLuminance(b) ?? 0;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text for a given #RRGGBB background — whichever has the
 *  higher WCAG contrast ratio. The previous perceived-luminance cut-off put
 *  white on the green/red/blue/orange presets at 2.3–3.8:1; black clears
 *  4.5:1 on every preset. */
export function contrastText(hex: string): string {
  if (relativeLuminance(hex) === null) return "#ffffff";
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

interface TagChipProps {
  name: string;
  color?: string | null;
  className?: string;
}

export default function TagChip({ name, color, className }: TagChipProps) {
  if (!color) {
    return (
      <Badge tone="info" className={className} title={name}>
        {name}
      </Badge>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        className ?? ""
      }`}
      style={{ backgroundColor: color, color: contrastText(color) }}
      title={name}
    >
      {name}
    </span>
  );
}
