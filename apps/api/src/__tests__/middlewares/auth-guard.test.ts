import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../../libs/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("../../modules/auth/token-denylist", () => ({
  isTokenDenied: vi.fn().mockResolvedValue(false),
}));
vi.mock("../../modules/auth/session.service", () => ({
  SessionService: { touch: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { authGuard, AuthRequest } from "../../modules/auth/auth.middleware";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const SECRET = "test-secret-for-auth-guard";

function run(token: string) {
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  } as unknown as AuthRequest;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next, done: authGuard(req, res as never, next) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
  // tokenVersion 0 is the default for any account that has never had a
  // password reset, email change or force-logout.
  mockPrisma.user.findUnique.mockResolvedValue({
    tokenVersion: 0,
    role: "ADMIN",
  });
});

describe("authGuard", () => {
  it("accepts a real session token", async () => {
    const token = jwt.sign(
      { sub: 42, role: "USER", v: 0, jti: "abc" },
      SECRET,
      { expiresIn: "7d" }
    );
    const { res, next } = run(token);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  // Pre-auth challenge tokens are signed with the SAME JWT_SECRET as session
  // tokens and are handed out before the second factor is proven — the TOTP
  // one after only a password, and the WebAuthn one to anyone who knows an
  // email address. They are distinguished from a session solely by their
  // `kind` claim, so authGuard has to reject that claim or they ARE sessions.
  it("rejects a TOTP pre-auth challenge token presented as a session", async () => {
    const token = jwt.sign(
      { sub: 42, role: "USER", kind: "totp-challenge", jti: "chal" },
      SECRET,
      { expiresIn: "5m" }
    );
    const { res, next } = run(token);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a WebAuthn challenge token presented as a session", async () => {
    // POST /auth/webauthn/login/options is unauthenticated and mints this for
    // any email, with no jti at all — so the denylist check is skipped too.
    const token = jwt.sign(
      { sub: 42, kind: "webauthn-auth", chal: "x" },
      SECRET,
      { expiresIn: "5m" }
    );
    const { res, next } = run(token);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token signed with a different algorithm family", async () => {
    const token = jwt.sign({ sub: 42, role: "USER", v: 0 }, SECRET, {
      algorithm: "HS512",
    });
    const { res, next } = run(token);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
