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
      thresholds: {
        statements: 38,
        branches: 55,
        functions: 25,
        lines: 38,
      },
    },
  },
});
