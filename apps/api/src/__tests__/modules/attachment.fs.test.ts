import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

vi.mock("../../config/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// fs.promises.unlink is the only side-effect; capture it.
const unlinkMock = vi.fn();
vi.mock("fs", () => ({
  default: { promises: { unlink: (...args: unknown[]) => unlinkMock(...args) } },
}));

import {
  resolveUploadPath,
  unlinkAttachmentFiles,
} from "../../modules/attachments/attachment.fs";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

beforeEach(() => vi.clearAllMocks());

describe("resolveUploadPath", () => {
  it("resolves a /uploads/<name> URL to an absolute path inside UPLOAD_DIR", () => {
    const url = "https://api.example/uploads/abc123.png";
    expect(resolveUploadPath(url)).toBe(path.join(UPLOAD_DIR, "abc123.png"));
  });

  it("rejects URLs outside /uploads/", () => {
    expect(resolveUploadPath("https://api.example/secrets/dump")).toBeNull();
  });

  it("rejects path-traversal attempts", () => {
    expect(
      resolveUploadPath("https://api.example/uploads/../etc/passwd")
    ).toBeNull();
  });

  it("returns null for unparseable / nullish input", () => {
    expect(resolveUploadPath(null)).toBeNull();
    expect(resolveUploadPath(undefined)).toBeNull();
    expect(resolveUploadPath("not a url")).toBeNull();
  });
});

describe("unlinkAttachmentFiles", () => {
  it("unlinks both fileUrl and thumbUrl when both resolve inside uploads", async () => {
    unlinkMock.mockResolvedValue(undefined);
    await unlinkAttachmentFiles({
      fileUrl: "https://api.example/uploads/x.png",
      thumbUrl: "https://api.example/uploads/x-thumb.webp",
    });
    expect(unlinkMock).toHaveBeenCalledTimes(2);
  });

  it("skips URLs that don't resolve to uploads", async () => {
    await unlinkAttachmentFiles({
      fileUrl: "https://other.example/elsewhere.png",
      thumbUrl: null,
    });
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("swallows ENOENT silently (already-gone file is the common case)", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    unlinkMock.mockRejectedValueOnce(err);
    await expect(
      unlinkAttachmentFiles({
        fileUrl: "https://api.example/uploads/gone.png",
      })
    ).resolves.toBeUndefined();
  });

  it("swallows other unlink errors so a cascade can still proceed", async () => {
    unlinkMock.mockRejectedValueOnce(new Error("EACCES"));
    await expect(
      unlinkAttachmentFiles({
        fileUrl: "https://api.example/uploads/x.png",
      })
    ).resolves.toBeUndefined();
  });
});
