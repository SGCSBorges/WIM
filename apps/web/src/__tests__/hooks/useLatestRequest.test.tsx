import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLatestRequest } from "../../hooks/useLatestRequest";

describe("useLatestRequest", () => {
  it("keeps the newest request and stales every earlier one", () => {
    const { result } = renderHook(() => useLatestRequest());
    const first = result.current.begin();
    expect(first()).toBe(true);

    const second = result.current.begin();
    expect(first()).toBe(false); // superseded
    expect(second()).toBe(true);
  });

  it("stays stable across re-renders so it can sit in a useCallback dep list", () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });

  it("keeps a single request valid for as long as nothing supersedes it", async () => {
    const { result } = renderHook(() => useLatestRequest());
    const fresh = result.current.begin();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fresh()).toBe(true);
  });

  it("invalidates outstanding tokens on unmount", () => {
    const { result, unmount } = renderHook(() => useLatestRequest());
    const fresh = result.current.begin();
    expect(fresh()).toBe(true);
    unmount();
    expect(fresh()).toBe(false);
  });

  it("models the bug it exists to prevent: out-of-order responses", async () => {
    const { result } = renderHook(() => useLatestRequest());
    let rendered = "initial";
    const load = async (value: string, delayMs: number) => {
      const fresh = result.current.begin();
      await new Promise((r) => setTimeout(r, delayMs));
      if (!fresh()) return;
      rendered = value;
    };
    // "stale" starts first but resolves last — without the guard it would win.
    await act(async () => {
      await Promise.all([load("stale", 30), load("fresh", 5)]);
    });
    expect(rendered).toBe("fresh");
  });
});
