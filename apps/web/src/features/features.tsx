/**
 * Feature-gate context. Fetches /api/features once on mount and re-fetches
 * whenever `refresh()` is called (e.g. after an admin changes a flag).
 * Falls back to all-false when not loaded, so gated UI stays hidden until
 * the map arrives.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { featuresAPI } from "../services/api";

export type FeatureKey =
  | "cmd_palette"
  | "sharing"
  | "transfers"
  | "messaging"
  | "reports"
  | "templates"
  | "bulk_edit"
  | "saved_views"
  | "notifications"
  | "calendar_feed"
  | "csv_import"
  | "csv_export";

type FeatureMap = Record<FeatureKey, boolean>;

const EMPTY: FeatureMap = {
  cmd_palette: false,
  sharing: false,
  transfers: false,
  messaging: false,
  reports: false,
  templates: false,
  bulk_edit: false,
  saved_views: false,
  notifications: false,
  calendar_feed: false,
  csv_import: false,
  csv_export: false,
};

interface FeatureContextValue {
  features: FeatureMap;
  /** False until the first /api/features fetch settles (success OR failure).
   *  Consumers that would otherwise redirect on a denied flag must wait for
   *  this so the all-false default during load isn't mistaken for "denied". */
  loaded: boolean;
  canAccess: (key: FeatureKey) => boolean;
  refresh: () => Promise<void>;
}

const FeatureContext = createContext<FeatureContextValue>({
  features: EMPTY,
  loaded: false,
  canAccess: () => false,
  refresh: async () => {},
});

export function FeatureProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<FeatureMap>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const map = await featuresAPI.getAccessMap();
      setFeatures({ ...EMPTY, ...map });
    } catch {
      // On 401 (logged out) or network failure, fall back to all-false so a
      // logout clears any previously-granted access. Callers re-invoke
      // refresh() after a successful login to repopulate.
      setFeatures(EMPTY);
    } finally {
      // Mark loaded on both paths — a persistent 401 must still release the
      // route guards (to the redirect) rather than hang on the skeleton.
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canAccess = useCallback(
    (key: FeatureKey) => features[key] === true,
    [features]
  );

  return (
    <FeatureContext.Provider
      value={{ features, loaded, canAccess, refresh: load }}
    >
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  return useContext(FeatureContext);
}

export function useFeature(key: FeatureKey): boolean {
  return useContext(FeatureContext).features[key] === true;
}
