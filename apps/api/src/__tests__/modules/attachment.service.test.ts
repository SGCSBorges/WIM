import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the service
vi.mock("../../libs/prisma", () => ({
  prisma: {
    attachment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    garantie: {
      findFirst: vi.fn(),
    },
    article: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../modules/attachments/attachment.fs", () => ({
  unlinkAttachmentFiles: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../libs/prisma";
import { AttachmentService } from "../../modules/attachments/attachment.service";

const mockPrisma = prisma as unknown as {
  attachment: Record<string, ReturnType<typeof vi.fn>>;
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentService.list", () => {
  it("queries with ownerUserId only when no filters given", async () => {
    mockPrisma.attachment.findMany.mockResolvedValue([]);
    await AttachmentService.list(1);
    expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerUserId: 1 }),
      })
    );
  });

  it("includes articleId filter when provided", async () => {
    mockPrisma.attachment.findMany.mockResolvedValue([]);
    await AttachmentService.list(1, { articleId: 5 });
    expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ articleId: 5 }),
      })
    );
  });
});

describe("AttachmentService.getForWarranty", () => {
  it("returns empty array when warranty has no image attachment", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue({
      garantieImageAttachmentId: null,
    });
    const result = await AttachmentService.getForWarranty(1, 1);
    expect(result).toEqual([]);
    expect(mockPrisma.attachment.findFirst).not.toHaveBeenCalled();
  });

  it("returns empty array when warranty not found", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(null);
    const result = await AttachmentService.getForWarranty(99, 1);
    expect(result).toEqual([]);
  });

  it("returns attachment array when warranty has an image", async () => {
    const attachment = {
      attachmentId: 7,
      ownerUserId: 1,
      fileName: "proof.jpg",
    };
    mockPrisma.garantie.findFirst.mockResolvedValue({
      garantieImageAttachmentId: 7,
    });
    mockPrisma.attachment.findFirst.mockResolvedValue(attachment);
    const result = await AttachmentService.getForWarranty(1, 1);
    expect(result).toEqual([attachment]);
  });
});

describe("AttachmentService.create", () => {
  it("delegates to prisma.attachment.create", async () => {
    const data = {
      ownerUserId: 1,
      fileName: "file.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      fileUrl: "http://x/f.pdf",
      type: "OTHER" as const,
    };
    const created = { attachmentId: 1, ...data };
    mockPrisma.attachment.create.mockResolvedValue(created);
    const result = await AttachmentService.create(data);
    expect(result).toEqual(created);
  });

  it("rejects when articleId belongs to a different user", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      AttachmentService.create({
        ownerUserId: 1,
        articleId: 99,
        fileName: "f.pdf",
        mimeType: "application/pdf",
        fileSize: 1,
        fileUrl: "http://x/f.pdf",
        type: "OTHER",
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
  });

  it("rejects when garantieId belongs to a different user", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(null);
    await expect(
      AttachmentService.create({
        ownerUserId: 1,
        garantieId: 99,
        fileName: "f.pdf",
        mimeType: "application/pdf",
        fileSize: 1,
        fileUrl: "http://x/f.pdf",
        type: "OTHER",
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
  });
});

describe("AttachmentService.update", () => {
  it("rejects update that retargets to another user's article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      AttachmentService.update(1, 1, { articleId: 99 })
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.attachment.updateMany).not.toHaveBeenCalled();
  });
});

describe("AttachmentService.bulkRemove", () => {
  it("returns count=0 for an empty id list without touching prisma", async () => {
    const result = await AttachmentService.bulkRemove([], 1);
    expect(result).toEqual({ count: 0 });
    expect(mockPrisma.attachment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("silently skips ids the caller does not own", async () => {
    mockPrisma.attachment.findMany.mockResolvedValue([]);
    const result = await AttachmentService.bulkRemove([10, 11], 1);
    expect(result).toEqual({ count: 0 });
    expect(mockPrisma.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("unlinks files for owned rows then deleteManys with the same id slice", async () => {
    mockPrisma.attachment.findMany.mockResolvedValue([
      { attachmentId: 7, fileUrl: "/u/a.pdf", thumbUrl: null },
      { attachmentId: 9, fileUrl: "/u/b.pdf", thumbUrl: null },
    ]);
    mockPrisma.attachment.deleteMany.mockResolvedValue({ count: 2 });
    const result = await AttachmentService.bulkRemove([7, 9, 99], 1);
    expect(result).toEqual({ count: 2 });
    const call = mockPrisma.attachment.deleteMany.mock.calls[0][0];
    expect(call.where).toEqual({
      attachmentId: { in: [7, 9] },
      ownerUserId: 1,
    });
  });
});
