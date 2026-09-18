/**
 * Shape of one lazily-loaded language. Keyed by the English dictionaries so
 * every locale carries exactly the English key set — no runtime parity test
 * can be as strict as `Record<Key, string>` on an object literal.
 */
import type { translations } from "../translations";
import type { extras } from "../translations.extras";

export type LocaleDict = {
  main: Record<keyof (typeof translations)["en"], string>;
  extras: Record<keyof (typeof extras)["en"], string>;
};
