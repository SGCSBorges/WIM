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
      thresholds: {
        statements: 28,
        branches: 70,
        functions: 54,
        lines: 28,
      },
    },
  },
});
