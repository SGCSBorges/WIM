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
      // Round-10 lift — current (statements/branches/functions/lines):
      // 45.26 / 75.83 / 64.45 / 45.26.
      thresholds: {
        statements: 43,
        branches: 75,
        functions: 63,
        lines: 43,
      },
    },
  },
});
