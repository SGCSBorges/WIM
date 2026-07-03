/**
 * Round-trip TOTP setup → verify against the otplib `authenticator` so the
 * exact same code flow used at login passes when the user types in what
 * the app would compute. We mock Prisma so the test is hermetic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticator } from "otplib";

const totpRow = { userId: 7, secret: "", backupCodesHash: "[]", verified: false };

vi.mock("../../libs/prisma", () => ({
  prisma: {
    totpSecret: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn(
      async (
        ops: Array<{
          /* prisma returns an array of awaited promises; in test mode our
           * mocks already return values directly */
        }>
      ) => ops
    ),
  },
}));

vi.mock("../../libs/redis", () => ({
  getRedis: () => null, // Redis unavailable in unit tests → fail open
}));

import { TotpService } from "../../modules/auth/totp.service";
import { prisma } from "../../libs/prisma";

const p = prisma as unknown as {
  totpSecret: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  user: { update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-for-totp-challenge";
});

describe("TotpService", () => {
  it("setup() returns an otpauth URL + plaintext backup codes once", async () => {
    p.totpSecret.findUnique.mockResolvedValue(null);
    let savedSecret = "";
    p.totpSecret.upsert.mockImplementation(({ create }) => {
      savedSecret = create.secret;
      return Promise.resolve({ ...create });
    });

    const result = await TotpService.setup(7, "user@example.com");

    expect(result.backupCodes).toHaveLength(10);
    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(savedSecret).toBeTruthy();
    expect(result.secret).toBe(savedSecret);
  });

  it("setup() rejects when 2FA is already enabled", async () => {
    p.totpSecret.findUnique.mockResolvedValue({ verified: true });
    await expect(TotpService.setup(7, "x@y")).rejects.toThrow(/already enabled/);
  });

  it("verify() accepts a code generated from the live secret", async () => {
    const secret = authenticator.generateSecret();
    p.totpSecret.findUnique.mockResolvedValue({ ...totpRow, secret });
    const code = authenticator.generate(secret);
    await expect(TotpService.verify(7, code)).resolves.toEqual({ ok: true });
  });

  it("verify() rejects a bad code", async () => {
    const secret = authenticator.generateSecret();
    p.totpSecret.findUnique.mockResolvedValue({ ...totpRow, secret });
    await expect(TotpService.verify(7, "000000")).rejects.toThrow(
      /invalid code/i
    );
  });

  it("signChallenge / verifyChallenge round-trip; rejects a normal session token", async () => {
    const tok = await TotpService.signChallenge(7, "USER");
    await expect(TotpService.verifyChallenge(tok)).resolves.toMatchObject({
      sub: 7,
      role: "USER",
    });

    const jwt = require("jsonwebtoken");
    const sessionShaped = jwt.sign(
      { sub: 7, role: "USER", v: 0, jti: "x" },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" }
    );
    await expect(TotpService.verifyChallenge(sessionShaped)).rejects.toThrow(
      /invalid challenge/i
    );
  });
});

describe("TotpService.regenerateBackupCodes", () => {
  it("rejects when TOTP is not enabled (no row / unverified)", async () => {
    p.totpSecret.findUnique.mockResolvedValue(null);
    await expect(
      TotpService.regenerateBackupCodes(7)
    ).rejects.toMatchObject({ status: 400 });

    p.totpSecret.findUnique.mockResolvedValue({
      userId: 7,
      verified: false,
    });
    await expect(
      TotpService.regenerateBackupCodes(7)
    ).rejects.toMatchObject({ status: 400 });
    expect(p.totpSecret.update).not.toHaveBeenCalled();
  });

  it("replaces the stored hashes with 10 fresh bcrypt hashes and returns plaintext once", async () => {
    p.totpSecret.findUnique.mockResolvedValue({
      userId: 7,
      verified: true,
      backupCodesHash: "[]",
    });
    p.totpSecret.update.mockResolvedValue({});

    const codes = await TotpService.regenerateBackupCodes(7);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-f0-9]{10}$/);

    const arg = p.totpSecret.update.mock.calls[0][0];
    const stored: string[] = JSON.parse(arg.data.backupCodesHash);
    expect(stored).toHaveLength(10);
    // Hashes stored, never the plaintext.
    for (const h of stored) expect(h.startsWith("$2")).toBe(true);
    for (const c of codes) expect(stored).not.toContain(c);
  });
});
