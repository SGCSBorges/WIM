import { describe, it, expect } from "vitest";
import {
  shouldAttemptCompression,
  compressImageFile,
} from "../../utils/imageCompress";

function fakeFile(type: string, bytes: number, name = "x"): File {
  // A File whose reported size is `bytes` without allocating that memory.
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

describe("shouldAttemptCompression", () => {
  it("targets large raster photos", () => {
    expect(shouldAttemptCompression(fakeFile("image/jpeg", 4_000_000))).toBe(
      true
    );
    expect(shouldAttemptCompression(fakeFile("image/png", 2_000_000))).toBe(
      true
    );
    expect(shouldAttemptCompression(fakeFile("image/webp", 900_000))).toBe(
      true
    );
  });

  it("skips small files (not worth a re-encode)", () => {
    expect(shouldAttemptCompression(fakeFile("image/jpeg", 100_000))).toBe(
      false
    );
  });

  it("skips non-photo types (PDF, SVG, GIF)", () => {
    expect(
      shouldAttemptCompression(fakeFile("application/pdf", 5_000_000))
    ).toBe(false);
    expect(shouldAttemptCompression(fakeFile("image/svg+xml", 5_000_000))).toBe(
      false
    );
    expect(shouldAttemptCompression(fakeFile("image/gif", 5_000_000))).toBe(
      false
    );
  });
});

describe("compressImageFile", () => {
  it("returns the original file when compression doesn't apply", async () => {
    const pdf = fakeFile("application/pdf", 5_000_000, "manual.pdf");
    expect(await compressImageFile(pdf)).toBe(pdf);
  });

  it("returns the original when the canvas path is unavailable (jsdom)", async () => {
    // jsdom has no working createImageBitmap/canvas encode, so the guarded
    // fallback must hand back the exact original file — never block an upload.
    const photo = fakeFile("image/jpeg", 4_000_000, "photo.jpg");
    expect(await compressImageFile(photo)).toBe(photo);
  });
});
