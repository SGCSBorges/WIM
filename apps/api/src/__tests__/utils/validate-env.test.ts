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
});
