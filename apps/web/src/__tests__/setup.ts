import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement scrollIntoView; components that scroll error
// blocks into view (e.g. ArticleForm) would otherwise throw under test.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom lacks ResizeObserver, which recharts' ResponsiveContainer instantiates
// on mount (Dashboard charts). Stub it so chart-bearing components render under
// test (they measure to 0 in jsdom, which recharts handles gracefully).
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}

afterEach(() => {
  cleanup();
});
