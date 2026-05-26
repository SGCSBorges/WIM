import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: { inventoryShare: { findFirst: vi.fn() } },
}));

import { prisma } from "../../libs/prisma";
import { canReadInventory, canWriteInventory } from "../../modules/common/acl";

const mock = prisma as unknown as {
  inventoryShare: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("acl.canReadInventory", () => {
  it("always allows the owner without a DB lookup", async () => {
    expect(await canReadInventory(5, 5)).toBe(true);
    expect(mock.inventoryShare.findFirst).not.toHaveBeenCalled();
  });

  it("allows a non-owner who has any share (READ or WRITE)", async () => {
    mock.inventoryShare.findFirst.mockResolvedValue({ permission: "READ" });
    expect(await canReadInventory(2, 5)).toBe(true);
  });

  it("denies a non-owner with no share", async () => {
    mock.inventoryShare.findFirst.mockResolvedValue(null);
    expect(await canReadInventory(2, 5)).toBe(false);
  });
});

describe("acl.canWriteInventory", () => {
  it("allows the owner", async () => {
    expect(await canWriteInventory(5, 5)).toBe(true);
  });

  it("allows a non-owner only with WRITE permission", async () => {
    mock.inventoryShare.findFirst.mockResolvedValue({ permission: "WRITE" });
    expect(await canWriteInventory(2, 5)).toBe(true);
  });

  it("denies a non-owner who only has READ", async () => {
    mock.inventoryShare.findFirst.mockResolvedValue({ permission: "READ" });
    expect(await canWriteInventory(2, 5)).toBe(false);
  });

  it("denies a non-owner with no share", async () => {
    mock.inventoryShare.findFirst.mockResolvedValue(null);
    expect(await canWriteInventory(2, 5)).toBe(false);
  });
});
