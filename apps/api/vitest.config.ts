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
        "src/modules/demo/**",
        "src/__tests__/**",
        "src/**/*.d.ts",
      ],
      // Ratchet baseline: thresholds sit just below current coverage so they
      // guard against regressions without failing today. Raise as we add tests.
      // Round-12 lift — current (statements/branches/functions/lines):
      // 45.45 / 75.22 / 63.82 / 45.45 locally; CI can dip ~1pp on branches
      // because of nondeterministic file/test ordering through v8 coverage,
      // so the branches floor sits at 74.
      thresholds: {
        statements: 44,
        branches: 74,
        functions: 63,
        lines: 44,
      },
    },
  },
});
