import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { AuditService } from "../../modules/audit/audit.service";

const mockPrisma = prisma as unknown as {
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => vi.resetAllMocks());

describe("AuditService.log", () => {
  it("normalizes missing optional fields to null/undefined", async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1 });
    await AuditService.log({ action: "LOGIN", entity: "User" });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        action: "LOGIN",
        entity: "User",
        entityId: null,
        metadata: undefined, // absent metadata is left undefined, not {}
        ip: null,
        userAgent: null,
      },
    });
  });

  it("passes metadata and identity fields through", async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 2 });
    await AuditService.log({
      userId: 7,
      action: "DELETE",
      entity: "Article",
      entityId: 42,
      metadata: { reason: "trash" },
      ip: "1.2.3.4",
      ua: "agent",
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        action: "DELETE",
        entity: "Article",
        entityId: 42,
        metadata: { reason: "trash" },
        ip: "1.2.3.4",
        userAgent: "agent",
      },
    });
  });
});

describe("AuditService.pruneOlderThan", () => {
  it("rejects a non-positive or non-finite window", async () => {
    await expect(AuditService.pruneOlderThan(0)).rejects.toThrow();
    await expect(AuditService.pruneOlderThan(-5)).rejects.toThrow();
    await expect(AuditService.pruneOlderThan(NaN)).rejects.toThrow();
    expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 0 and stops when the first batch is empty", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    const res = await AuditService.pruneOlderThan(90);
    expect(res).toEqual({ deleted: 0 });
    expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes in batches until a short batch ends the loop, summing the count", async () => {
    const fullBatch = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const shortBatch = [{ id: 9001 }, { id: 9002 }, { id: 9003 }];
    mockPrisma.auditLog.findMany
      .mockResolvedValueOnce(fullBatch) // full → keep going
      .mockResolvedValueOnce(shortBatch); // short → last pass
    mockPrisma.auditLog.deleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 3 });

    const res = await AuditService.pruneOlderThan(30);
    expect(res).toEqual({ deleted: 1003 });
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledTimes(2);
    // The cutoff filter is "older than" the window.
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
      createdAt: { lt: expect.any(Date) },
    });
  });
});
