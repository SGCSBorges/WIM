import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock, so this ref is available inside the factory.
// We use it to capture the real bcrypt.hash so login tests can produce valid hashes
// without calling the mocked version (which just returns "$hashed$").
const bcryptRef = vi.hoisted(() => ({
  realHash: null as null | ((data: string, rounds: number) => Promise<string>),
}));

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcrypt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bcrypt")>();
  bcryptRef.realHash = actual.hash;
  return {
    default: {
      ...actual,
      hash: vi.fn().mockResolvedValue("$hashed$"),
      compare: actual.compare,
    },
  };
});

import { prisma } from "../../libs/prisma";
import { AuthService } from "../../modules/auth/auth.service";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-for-unit-tests";
});

describe("AuthService.register", () => {
  it("rejects with 409 when email is already registered", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 1, email: "a@b.com" });
    await expect(
      AuthService.register({ email: "a@b.com", password: "Pass1!xyz", role: "USER" })
    ).rejects.toMatchObject({ status: 409, message: "Email already registered" });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("hashes password and creates user on unique email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      userId: 2,
      email: "new@example.com",
      role: "USER",
    });

    const result = await AuthService.register({
      email: "new@example.com",
      password: "Pass1!xyz",
      role: "USER",
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: "$hashed$" }),
      })
    );
    expect(result.user).toMatchObject({ userId: 2, email: "new@example.com" });
    expect(typeof result.token).toBe("string");
    expect(result.token.split(".").length).toBe(3); // valid JWT shape
  });
});

describe("AuthService.login", () => {
  it("rejects with 401 when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      AuthService.login({ email: "no@one.com", password: "anything" })
    ).rejects.toMatchObject({ status: 401, message: "Invalid credentials" });
  });

  it("rejects with 401 when password does not match", async () => {
    const realHash = await bcryptRef.realHash!("correct-password", 1);
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 3,
      email: "user@x.com",
      password: realHash,
      role: "USER",
    });

    await expect(
      AuthService.login({ email: "user@x.com", password: "wrong-password" })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns user and JWT on correct credentials", async () => {
    const realHash = await bcryptRef.realHash!("correct-password", 1);
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 4,
      email: "user@x.com",
      password: realHash,
      role: "USER",
    });

    const result = await AuthService.login({
      email: "user@x.com",
      password: "correct-password",
    });

    expect(result.user).toMatchObject({ userId: 4, email: "user@x.com" });
    expect(result.token.split(".").length).toBe(3);
  });
});

describe("AuthService.profile", () => {
  it("returns null when user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await AuthService.profile(999);
    expect(result).toBeNull();
  });

  it("returns selected fields for existing user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 5,
      email: "u@example.com",
      role: "USER",
    });
    const result = await AuthService.profile(5);
    expect(result).toMatchObject({ userId: 5, email: "u@example.com", role: "USER" });
  });
});
