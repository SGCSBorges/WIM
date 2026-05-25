import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupProduct } from "../../services/barcodeLookup";

describe("lookupProduct", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("maps a found product to name + https image", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      ok({
        status: 1,
        product: {
          product_name: "Cola 330ml",
          image_url: "https://img.off/cola.jpg",
        },
      })
    );

    const info = await lookupProduct("5449000000996");
    expect(info).toEqual({
      name: "Cola 330ml",
      imageUrl: "https://img.off/cola.jpg",
    });
  });

  it("returns null when the product is not found", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      ok({ status: 0 })
    );
    expect(await lookupProduct("0000000000000")).toBeNull();
  });

  it("drops a non-https image but keeps the name", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      ok({
        status: 1,
        product: { product_name: "X", image_url: "http://insecure/x.jpg" },
      })
    );
    expect(await lookupProduct("12345678")).toEqual({ name: "X" });
  });

  it("skips non-numeric codes without calling the network", async () => {
    const info = await lookupProduct("ABC-123");
    expect(info).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null on network failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("offline")
    );
    expect(await lookupProduct("5449000000996")).toBeNull();
  });
});
