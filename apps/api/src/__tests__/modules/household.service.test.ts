import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const householdMember = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const householdInvite = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  };
  const household = { create: vi.fn(), delete: vi.fn() };
  const inventoryShare = { upsert: vi.fn(), updateMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  const client = {
    householdMember,
    householdInvite,
    household,
    inventoryShare,
    user,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return { prisma: client };
});

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn().mockReturnValue(false),
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import {
  HouseholdService,
  MAX_HOUSEHOLD_MEMBERS,
} from "../../modules/household/household.service";

const mockPrisma = prisma as unknown as {
  householdMember: Record<string, ReturnType<typeof vi.fn>>;
  householdInvite: Record<string, ReturnType<typeof vi.fn>>;
  household: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
};

const TOKEN = "c".repeat(128);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HouseholdService.create", () => {
  it("rejects when the caller is already in a household", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({ id: 1 });
    await expect(HouseholdService.create(7, "Home")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockPrisma.household.create).not.toHaveBeenCalled();
  });

  it("creates the household with the caller as OWNER", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue(null);
    mockPrisma.household.create.mockResolvedValue({ id: 3 });
    await HouseholdService.create(7, "Home");
    const arg = mockPrisma.household.create.mock.calls[0][0];
    expect(arg.data.members.create).toEqual({ userId: 7, role: "OWNER" });
  });
});

describe("HouseholdService.invite", () => {
  const ownerMembership = {
    householdId: 3,
    role: "OWNER",
    household: { name: "Home", _count: { members: 2 } },
    user: { email: "owner@x.y" },
  };

  it("uses the same error for unknown emails and non-Power-Users (no enumeration)", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValueOnce(
      ownerMembership
    );
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const unknown = await HouseholdService.invite(7, "ghost@x.y").catch(
      (e) => e
    );

    mockPrisma.householdMember.findUnique.mockResolvedValueOnce(
      ownerMembership
    );
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 9, role: "USER" });
    const wrongRole = await HouseholdService.invite(7, "basic@x.y").catch(
      (e) => e
    );

    expect(unknown.status).toBe(400);
    expect(unknown.message).toBe(wrongRole.message);
  });

  it("rejects non-OWNER callers", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({
      ...ownerMembership,
      role: "MEMBER",
    });
    await expect(HouseholdService.invite(7, "a@b.c")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects when the household is full", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({
      ...ownerMembership,
      household: {
        name: "Home",
        _count: { members: MAX_HOUSEHOLD_MEMBERS },
      },
    });
    await expect(HouseholdService.invite(7, "a@b.c")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("HouseholdService.accept", () => {
  const invite = {
    id: 1,
    householdId: 3,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    household: { id: 3, name: "Home" },
  };

  it("claims the invite atomically and builds the WRITE mesh in both directions", async () => {
    mockPrisma.householdInvite.findUnique.mockResolvedValue(invite);
    mockPrisma.householdInvite.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.householdMember.findMany.mockResolvedValue([
      { userId: 1 },
      { userId: 2 },
    ]);
    mockPrisma.householdMember.create.mockResolvedValue({});

    await HouseholdService.accept(TOKEN, 9);

    const claim = mockPrisma.householdInvite.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ token: TOKEN, status: "PENDING" });

    // Two existing members × two directions = four upserts, all WRITE and
    // tagged with the household id.
    expect(mockPrisma.inventoryShare.upsert).toHaveBeenCalledTimes(4);
    const pairs = mockPrisma.inventoryShare.upsert.mock.calls.map(
      (c) => c[0].create
    );
    expect(pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerUserId: 9,
          targetUserId: 1,
          permission: "WRITE",
          viaHouseholdId: 3,
        }),
        expect.objectContaining({ ownerUserId: 1, targetUserId: 9 }),
        expect.objectContaining({ ownerUserId: 9, targetUserId: 2 }),
        expect.objectContaining({ ownerUserId: 2, targetUserId: 9 }),
      ])
    );
  });

  it("rejects when the atomic claim loses (already used)", async () => {
    mockPrisma.householdInvite.findUnique.mockResolvedValue(invite);
    mockPrisma.householdInvite.updateMany.mockResolvedValue({ count: 0 });
    await expect(HouseholdService.accept(TOKEN, 9)).rejects.toMatchObject({
      status: 400,
    });
    expect(mockPrisma.householdMember.create).not.toHaveBeenCalled();
  });

  it("410s an expired invite and stamps EXPIRED", async () => {
    mockPrisma.householdInvite.findUnique.mockResolvedValue({
      ...invite,
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.householdInvite.updateMany.mockResolvedValue({ count: 1 });
    await expect(HouseholdService.accept(TOKEN, 9)).rejects.toMatchObject({
      status: 410,
    });
  });
});

describe("HouseholdService.leave", () => {
  it("tears down only this household's mesh rows for the leaver, both directions", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({
      id: 11,
      householdId: 3,
      role: "MEMBER",
    });
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 4 });
    mockPrisma.householdMember.findMany.mockResolvedValue([
      { id: 12, role: "OWNER" },
    ]);

    await HouseholdService.leave(9);

    const teardown = mockPrisma.inventoryShare.updateMany.mock.calls[0][0];
    expect(teardown.where).toEqual({
      viaHouseholdId: 3,
      OR: [{ ownerUserId: 9 }, { targetUserId: 9 }],
    });
    expect(teardown.data).toEqual({ active: false, viaHouseholdId: null });
    expect(mockPrisma.household.delete).not.toHaveBeenCalled();
  });

  it("deletes the household when the last member leaves", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({
      id: 11,
      householdId: 3,
      role: "OWNER",
    });
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.householdMember.findMany.mockResolvedValue([]);

    await HouseholdService.leave(9);
    expect(mockPrisma.household.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });

  it("promotes the oldest remaining member when the OWNER leaves", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue({
      id: 11,
      householdId: 3,
      role: "OWNER",
    });
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.householdMember.findMany.mockResolvedValue([
      { id: 12, role: "MEMBER" },
      { id: 13, role: "MEMBER" },
    ]);

    await HouseholdService.leave(9);
    expect(mockPrisma.householdMember.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { role: "OWNER" },
    });
  });
});

describe("HouseholdService.removeOnDowngrade", () => {
  it("no-ops when the user has no membership", async () => {
    mockPrisma.householdMember.findUnique.mockResolvedValue(null);
    await HouseholdService.removeOnDowngrade(9, prisma);
    expect(mockPrisma.inventoryShare.updateMany).not.toHaveBeenCalled();
  });
});
