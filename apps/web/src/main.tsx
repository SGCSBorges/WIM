/**
 * Web entry point. Boots the React tree with the provider stack the rest
 * of the app assumes is in place:
 *
 *   ErrorBoundary > BrowserRouter > Theme > I18n > Preferences > Toast >
 *   Feature > Upgrade > <App />
 *
 * Also registers the PWA service worker (production builds only) so
 * Chrome treats the site as installable, and pipes any unhandled promise
 * rejection through console.error so otherwise-silent failures surface in
 * devtools. Both are best-effort and never block render.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App, { ErrorBoundary } from "./App";
import RouteChrome from "./components/layout/RouteChrome";
// Self-hosted Inter Variable (no network/CDN — PWA/offline-safe). Weights are
// covered by the single variable axis; we reference it via --font-sans.
import "@fontsource-variable/inter";
import "./index.css";
import { I18nProvider } from "./i18n/i18n";
import { ThemeProvider } from "./theme/theme";
import { PreferencesProvider } from "./preferences/preferences";
import { ToastProvider } from "./components/common/Toast";
import { FeatureProvider } from "./features/features";
import { UpgradeProvider } from "./features/upgrade";

// Surface promise rejections that escape try/catch (most network errors that
// aren't awaited end up here). Without this listener they die silently in
// devtools console.
window.addEventListener("unhandledrejection", (event) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledrejection]", event.reason);
});

// Register the service worker so Chrome treats the site as PWA-installable.
// Skipped on dev (vite serves over HTTP on localhost without a stable SW
// scope) and quietly logged on failure — install is best-effort.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[sw] registration failed", err);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <I18nProvider>
            <PreferencesProvider>
              <ToastProvider>
                <FeatureProvider>
                  <UpgradeProvider>
                    <RouteChrome />
                    <App />
                  </UpgradeProvider>
                </FeatureProvider>
              </ToastProvider>
            </PreferencesProvider>
          </I18nProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
