import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateEnv", () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Prevent actual process.exit in tests
    process.exit = vi.fn() as never;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    vi.resetModules();
  });

  it("calls process.exit(1) when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = "postgres://test";
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when DATABASE_URL is missing", async () => {
    process.env.JWT_SECRET = "secret";
    delete process.env.DATABASE_URL;
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("does not call process.exit when required vars are present in dev", async () => {
    process.env.JWT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://test";
    process.env.NODE_ENV = "development";
    delete process.env.STRIPE_SECRET_KEY;
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("calls process.exit(1) when Stripe vars missing in production", async () => {
    process.env.JWT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://test";
    process.env.NODE_ENV = "production";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("warns (and does not exit) when PORT is not a valid integer", async () => {
    process.env.JWT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://test";
    process.env.NODE_ENV = "development";
    process.env.PORT = "abc";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.some((args) =>
        String(args[0]).includes('PORT="abc"')
      )
    ).toBe(true);
    warn.mockRestore();
  });

  it("warns when a numeric env var (RATE_LIMIT_MAX) is not a number", async () => {
    process.env.JWT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://test";
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_MAX = "notanumber";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    expect(
      warn.mock.calls.some((args) =>
        String(args[0]).includes("RATE_LIMIT_MAX")
      )
    ).toBe(true);
    warn.mockRestore();
  });

  it("warns about missing VAPID and Resend vars in production", async () => {
    process.env.JWT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://test";
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("../../utils/validate-env");
    validateEnv();
    const allWarnings = warn.mock.calls.map((args) => String(args[0])).join("\n");
    expect(allWarnings).toMatch(/VAPID_PUBLIC_KEY/);
    expect(allWarnings).toMatch(/RESEND_API_KEY/);
    expect(allWarnings).toMatch(/MAIL_FROM/);
    warn.mockRestore();
  });
});
