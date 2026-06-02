/**
 * Date formatting honoring the user's `dateFormat` preference.
 *
 * `"system"` defers to the browser locale (`toLocaleDateString` /
 * `toLocaleString`); the explicit patterns render a fixed order so users in
 * mixed-locale teams aren't tripped up by dd/MM vs MM/dd ambiguity. Invalid
 * or empty inputs return "" so call sites can render a dash themselves.
 */
import { format as dfFormat } from "date-fns";
import type { DateFormatPref } from "../types";

type DateInput = Date | string | number | null | undefined;

const PATTERNS: Record<Exclude<DateFormatPref, "system">, string> = {
  "dd/MM/yyyy": "dd/MM/yyyy",
  "MM/dd/yyyy": "MM/dd/yyyy",
  "yyyy-MM-dd": "yyyy-MM-dd",
};

function toValidDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  value: DateInput,
  pref: DateFormatPref = "system"
): string {
  const d = toValidDate(value);
  if (!d) return "";
  if (pref === "system") return d.toLocaleDateString();
  return dfFormat(d, PATTERNS[pref]);
}

export function formatDateTime(
  value: DateInput,
  pref: DateFormatPref = "system"
): string {
  const d = toValidDate(value);
  if (!d) return "";
  if (pref === "system") return d.toLocaleString();
  return `${dfFormat(d, PATTERNS[pref])} ${dfFormat(d, "HH:mm")}`;
}
