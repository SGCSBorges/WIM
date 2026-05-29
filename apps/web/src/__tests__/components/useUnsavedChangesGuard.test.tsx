import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";

afterEach(() => vi.restoreAllMocks());

describe("useUnsavedChangesGuard", () => {
  it("does not attach a beforeunload listener when clean", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedChangesGuard(false));
    expect(
      add.mock.calls.filter(([type]) => type === "beforeunload")
    ).toHaveLength(0);
  });

  it("attaches the listener while dirty and removes it on cleanup", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    expect(
      add.mock.calls.filter(([type]) => type === "beforeunload")
    ).toHaveLength(1);
    unmount();
    expect(
      remove.mock.calls.filter(([type]) => type === "beforeunload")
    ).toHaveLength(1);
  });

  it("prevents the unload event when dirty", () => {
    renderHook(() => useUnsavedChangesGuard(true));
    const evt = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
