import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/scripts/**",
        "src/jobs/**",
        "src/__tests__/**",
        "src/**/*.d.ts",
      ],
      // Ratchet baseline: thresholds sit just below current coverage so they
      // guard against regressions without failing today. Raise as we add tests.
      // Round-9 lift — current (statements/branches/functions/lines):
      // 44.87 / 76.11 / 64.70 / 44.87.
      thresholds: {
        statements: 40,
        branches: 75,
        functions: 62,
        lines: 40,
      },
    },
  },
});
