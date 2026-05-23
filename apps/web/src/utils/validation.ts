// Pragmatic client-side email check. The server is the source of truth for
// validation; this only catches obvious typos before a network round-trip.
// The value is trimmed first so surrounding whitespace doesn't trip the
// check — the trimmed form is what callers actually send.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}
