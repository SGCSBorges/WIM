import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeSharedDraft } from "../../utils/shareTarget";

type Entry = Response | undefined;

describe("consumeSharedDraft", () => {
  const store = new Map<string, Entry>();
  const cache = {
    match: vi.fn((key: string) => Promise.resolve(store.get(key))),
    delete: vi.fn((key: string) => Promise.resolve(store.delete(key))),
  };

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    (globalThis as unknown as { caches: unknown }).caches = {
      open: vi.fn(() => Promise.resolve(cache)),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  });

  it("returns null when nothing is stashed", async () => {
    expect(await consumeSharedDraft()).toBeNull();
  });

  it("reads metadata + photo and clears the cache", async () => {
    store.set(
      "/__wim_share__",
      new Response(JSON.stringify({ title: "Toaster", text: "nice", url: "" }))
    );
    store.set(
      "/__wim_share_photo__",
      new Response(new Blob(["img"], { type: "image/png" }), {
        headers: { "X-Filename": "toast.png" },
      })
    );

    const draft = await consumeSharedDraft();
    expect(draft?.title).toBe("Toaster");
    expect(draft?.text).toBe("nice");
    expect(draft?.photo).toBeInstanceOf(File);
    expect(draft?.photo?.name).toBe("toast.png");
    // Both keys consumed so a reload won't re-prefill.
    expect(cache.delete).toHaveBeenCalledWith("/__wim_share__");
    expect(cache.delete).toHaveBeenCalledWith("/__wim_share_photo__");
  });

  it("returns metadata with no photo when none was shared", async () => {
    store.set(
      "/__wim_share__",
      new Response(JSON.stringify({ title: "Note" }))
    );
    const draft = await consumeSharedDraft();
    expect(draft).toMatchObject({ title: "Note" });
    expect(draft?.photo).toBeUndefined();
  });
});
