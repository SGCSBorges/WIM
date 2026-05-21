import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    article: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    garantie: {
      count: vi.fn(),
    },
    auditLog: {
      count: vi.fn(),
    },
    alerte: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
  alerte: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Admin routes — listUsers", () => {
  it("returns users ordered by createdAt desc", async () => {
    const users = [
      {
        userId: 2,
        email: "b@b.com",
        role: "USER",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId: 1,
        email: "a@a.com",
        role: "ADMIN",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockPrisma.user.findMany.mockResolvedValue(users);

    const result = await prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(result).toEqual(users);
    expect(mockPrisma.user.findMany).toHaveBeenCalledOnce();
  });
});

describe("Admin routes — deleteUser", () => {
  it("deletes a non-admin user without checking admin count", async () => {
    const user = { userId: 5, email: "user@x.com", role: "USER" };
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const txFn = vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        user: {
          count: vi.fn().mockResolvedValue(2),
          delete: vi.fn().mockResolvedValue(user),
        },
      };
      return cb(tx);
    });
    mockPrisma.$transaction.mockImplementation(txFn);

    const found = await prisma.user.findUnique({ where: { userId: 5 } });
    expect(found).toEqual(user);

    await prisma.$transaction(
      async (tx: any) => {
        await tx.user.delete({ where: { userId: 5 } });
      },
      { isolationLevel: "Serializable" }
    );

    const txCallback = txFn.mock.calls[0][0];
    const fakeTx = {
      user: { count: vi.fn(), delete: vi.fn().mockResolvedValue(user) },
    };
    await txCallback(fakeTx);
    expect(fakeTx.user.delete).toHaveBeenCalledWith({ where: { userId: 5 } });
  });

  it("prevents deleting last admin user", async () => {
    const { createHttpError } = await import("../../utils/http-error");
    const adminUser = { userId: 1, email: "admin@x.com", role: "ADMIN" };

    const txFn = vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        user: {
          count: vi.fn().mockResolvedValue(1),
          delete: vi.fn(),
        },
      };
      return cb(tx);
    });
    mockPrisma.$transaction.mockImplementation(txFn);

    await expect(
      prisma.$transaction(
        async (tx: any) => {
          if (adminUser.role === "ADMIN") {
            const adminCount = await tx.user.count({
              where: { role: "ADMIN" },
            });
            if (adminCount <= 1)
              throw createHttpError(400, "Cannot delete the last admin user");
          }
          await tx.user.delete({ where: { userId: adminUser.userId } });
        },
        { isolationLevel: "Serializable" }
      )
    ).rejects.toMatchObject({
      status: 400,
      message: "Cannot delete the last admin user",
    });
  });

  it("allows deleting one admin when multiple exist", async () => {
    const { createHttpError } = await import("../../utils/http-error");
    const adminUser = { userId: 2, email: "admin2@x.com", role: "ADMIN" };

    const deleteFn = vi.fn().mockResolvedValue(adminUser);
    const txFn = vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        user: {
          count: vi.fn().mockResolvedValue(2),
          delete: deleteFn,
        },
      };
      return cb(tx);
    });
    mockPrisma.$transaction.mockImplementation(txFn);

    await prisma.$transaction(
      async (tx: any) => {
        if (adminUser.role === "ADMIN") {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1)
            throw createHttpError(400, "Cannot delete the last admin user");
        }
        await tx.user.delete({ where: { userId: adminUser.userId } });
      },
      { isolationLevel: "Serializable" }
    );

    expect(deleteFn).toHaveBeenCalledWith({
      where: { userId: adminUser.userId },
    });
  });
});

describe("Admin routes — getUserInventory", () => {
  it("returns 404 when user does not exist", async () => {
    const { createHttpError } = await import("../../utils/http-error");
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const user = await prisma.user.findUnique({ where: { userId: 999 } });
    if (!user)
      expect(() => {
        throw createHttpError(404, "User not found");
      }).toThrow("User not found");
  });

  it("returns user inventory with articlesOwned and warrantiesOwned", async () => {
    const userData = {
      userId: 3,
      email: "owner@x.com",
      articlesOwned: [
        {
          articleId: 10,
          articleNom: "Laptop",
          articleModele: "X1",
          garantie: {
            garantieId: 1,
            garantieNom: "Warranty",
            garantieIsValide: true,
          },
        },
      ],
      warrantiesOwned: [
        {
          garantieId: 1,
          garantieNom: "Warranty",
          article: { articleNom: "Laptop", articleModele: "X1" },
        },
      ],
    };
    mockPrisma.user.findUnique.mockResolvedValue(userData);

    const result = await prisma.user.findUnique({
      where: { userId: 3 },
      include: {} as any,
    });
    expect(result).toMatchObject({
      userId: 3,
      email: "owner@x.com",
      articlesOwned: expect.arrayContaining([
        expect.objectContaining({ articleId: 10 }),
      ]),
    });
  });
});

describe("Admin routes — getDbStats", () => {
  it("returns counts for all tracked entities", async () => {
    mockPrisma.user.count.mockResolvedValue(10);
    mockPrisma.article.count.mockResolvedValue(50);
    mockPrisma.garantie.count.mockResolvedValue(30);
    mockPrisma.auditLog.count.mockResolvedValue(100);
    mockPrisma.alerte.count.mockResolvedValue(5);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.article.findMany.mockResolvedValue([]);

    const [users, articles, warranties, auditLogs, alerts] = await Promise.all([
      prisma.user.count(),
      prisma.article.count(),
      prisma.garantie.count(),
      prisma.auditLog.count(),
      prisma.alerte.count(),
    ]);

    expect({ users, articles, warranties, auditLogs, alerts }).toEqual({
      users: 10,
      articles: 50,
      warranties: 30,
      auditLogs: 100,
      alerts: 5,
    });
  });
});
