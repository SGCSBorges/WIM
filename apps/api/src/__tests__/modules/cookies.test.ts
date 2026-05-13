import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { cookieOptsFor } from "../../modules/auth/cookies";

const makeReq = (
  overrides: Partial<{
    secure: boolean;
    xfp: string | string[] | undefined;
  }> = {}
): Request => {
  const { secure = false, xfp } = overrides;
  return {
    secure,
    headers: { "x-forwarded-proto": xfp },
  } as unknown as Request;
};

const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  delete process.env.NODE_ENV;
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("cookieOptsFor", () => {
  it("returns sameSite=none + secure=true in production regardless of request protocol", () => {
    process.env.NODE_ENV = "production";
    const opts = cookieOptsFor(makeReq({ secure: false }));
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
    expect(opts.httpOnly).toBe(true);
  });

  it("returns sameSite=lax in non-production", () => {
    const opts = cookieOptsFor(makeReq());
    expect(opts.sameSite).toBe("lax");
  });

  it("sets secure=false in dev over plain HTTP", () => {
    const opts = cookieOptsFor(makeReq({ secure: false }));
    expect(opts.secure).toBe(false);
  });

  it("sets secure=true in dev when req.secure is true", () => {
    const opts = cookieOptsFor(makeReq({ secure: true }));
    expect(opts.secure).toBe(true);
  });

  it("sets secure=true in dev when x-forwarded-proto is https", () => {
    const opts = cookieOptsFor(makeReq({ xfp: "https" }));
    expect(opts.secure).toBe(true);
  });

  it("only considers the first proto in a comma-separated x-forwarded-proto", () => {
    expect(cookieOptsFor(makeReq({ xfp: "https,http" })).secure).toBe(true);
    expect(cookieOptsFor(makeReq({ xfp: "http,https" })).secure).toBe(false);
  });

  it("sets a 7-day maxAge", () => {
    const opts = cookieOptsFor(makeReq());
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
