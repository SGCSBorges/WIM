/**
 * Session labels are written by the API in a fixed English shape
 * (`labelFromUserAgent`: "Safari on iOS", "Chrome", "Unknown device"), so
 * the reader's language is applied here rather than stored. Anything that
 * isn't one of those shapes — a raw user-agent fragment — is shown as is.
 */
export function deviceLabelText(
  label: string | null | undefined,
  t: (
    key: "security.sessions.unknownDevice" | "security.sessions.deviceOn"
  ) => string
): string {
  if (!label || label === "Unknown device") {
    return t("security.sessions.unknownDevice");
  }
  const m = /^(\S+) on (\S+)$/.exec(label);
  if (!m) return label;
  return t("security.sessions.deviceOn")
    .replace("{browser}", m[1])
    .replace("{os}", m[2]);
}
