import { describe, it, expect, vi, beforeEach } from "vitest";

const { toFile, sharpFactory } = vi.hoisted(() => {
  const toFile = vi.fn();
  const webp = vi.fn(() => ({ toFile }));
  const resize = vi.fn(() => ({ webp }));
  const rotate = vi.fn(() => ({ resize }));
  const sharpFactory = vi.fn(() => ({ rotate }));
  return { toFile, sharpFactory };
});

vi.mock("sharp", () => ({ default: sharpFactory }));

vi.mock("../../config/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  makeImageThumbnail,
  thumbnailName,
} from "../../modules/attachments/attachment.thumbnail";

beforeEach(() => {
  vi.clearAllMocks();
  toFile.mockResolvedValue(undefined);
});

const base = {
  sourcePath: "/uploads/abc123.png",
  uploadDir: "/uploads",
  storedName: "abc123.png",
  baseUrl: "https://api.example",
};

describe("makeImageThumbnail", () => {
  it("returns a thumb URL for an image and writes the webp", async () => {
    const url = await makeImageThumbnail({ ...base, mimeType: "image/png" });
    expect(url).toBe("https://api.example/uploads/abc123-thumb.webp");
    expect(sharpFactory).toHaveBeenCalledWith("/uploads/abc123.png");
    expect(toFile).toHaveBeenCalledWith("/uploads/abc123-thumb.webp");
  });

  it("skips non-image mimetypes", async () => {
    const url = await makeImageThumbnail({
      ...base,
      mimeType: "application/pdf",
    });
    expect(url).toBeNull();
    expect(sharpFactory).not.toHaveBeenCalled();
  });

  it("falls back to null when resizing fails", async () => {
    toFile.mockRejectedValueOnce(new Error("corrupt"));
    const url = await makeImageThumbnail({ ...base, mimeType: "image/jpeg" });
    expect(url).toBeNull();
  });
});

describe("thumbnailName", () => {
  it("derives the webp thumb name from the stored upload name", () => {
    expect(thumbnailName("abc123.png")).toBe("abc123-thumb.webp");
  });
});
