/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/__tests__/**",
        "src/**/*.d.ts",
        "src/vite-env.d.ts",
      ],
      // Ratchet baseline (see apps/api/vitest.config.ts) — just below current.
      // Round-10 lift after the T2 admin/attachment RTL coverage —
      // current (statements/branches/functions/lines):
      // 50.76 / 63.06 / 28.95 / 50.76. functions slipped slightly when F4's
      // JobsTab "Recent failures" handlers landed; threshold floor lives at
      // 28 to leave headroom without re-cratering on the next small addition.
      thresholds: {
        statements: 48,
        branches: 62,
        functions: 28,
        lines: 48,
      },
    },
  },
});
