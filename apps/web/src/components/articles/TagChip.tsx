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

/** Black or white text for a given #RRGGBB background, by relative luminance
 *  (WCAG-ish). Keeps a coloured tag readable on any swatch. */
export function contrastText(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance (sRGB coefficients), 0–255.
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? "#000000" : "#ffffff";
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
