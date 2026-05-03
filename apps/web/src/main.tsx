import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App, { ErrorBoundary } from "./App";
import "./index.css";
import { I18nProvider } from "./i18n/i18n";
import { ThemeProvider } from "./theme/theme";

// Surface promise rejections that escape try/catch (most network errors that
// aren't awaited end up here). Without this listener they die silently in
// devtools console.
window.addEventListener("unhandledrejection", (event) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledrejection]", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
