import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the critical UI flows. Kept separate from the vitest unit
// suite (which lives under src/ and runs in jsdom). Requires browsers:
//   npx playwright install chromium
// then: npm run test:e2e   (builds + serves the app, then drives it)
//
// Not wired into the main CI build — run it where Playwright browsers are
// available. The webServer below builds and previews the static app; the
// smoke spec exercises only API-free UI so no backend is needed.
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
