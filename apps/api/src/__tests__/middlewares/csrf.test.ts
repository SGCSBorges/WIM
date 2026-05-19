import { describe, it, expect, vi, beforeEach } from "vitest";

// Force a known allowlist before importing the middleware (which reads the
// frozen value from security.ts at import time).
vi.mock("../../config/security", () => ({
  csrfAllowedOrigins: ["https://wim.example.com"],
}));

import { csrfGuard } from "../../middlewares/csrf";
import type { Request, Response, NextFunction } from "express";

function makeReq(
  partial: Partial<Request> & {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }
): Request {
  return {
    method: partial.method ?? "POST",
    headers: partial.headers ?? {},
    cookies: partial.cookies ?? {},
  } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe("csrfGuard", () => {
  let next: NextFunction;
  beforeEach(() => {
    next = vi.fn();
  });

  it("skips safe methods", () => {
    const { res } = makeRes();
    csrfGuard(makeReq({ method: "GET" }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("skips requests without the auth cookie (API client / public route)", () => {
    const { res } = makeRes();
    csrfGuard(
      makeReq({ method: "POST", headers: { origin: "https://evil.com" } }),
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it("blocks cookie-auth POST from a foreign origin", () => {
    const { res, status, json } = makeRes();
    csrfGuard(
      makeReq({
        method: "POST",
        cookies: { wim_token: "abc" },
        headers: { origin: "https://evil.com" },
      }),
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalled();
  });

  it("allows cookie-auth POST from an allowlisted origin", () => {
    const { res } = makeRes();
    csrfGuard(
      makeReq({
        method: "POST",
        cookies: { wim_token: "abc" },
        headers: { origin: "https://wim.example.com" },
      }),
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it("falls back to Referer header when Origin is absent", () => {
    const { res } = makeRes();
    csrfGuard(
      makeReq({
        method: "POST",
        cookies: { wim_token: "abc" },
        headers: { referer: "https://wim.example.com/sharing" },
      }),
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it("blocks cookie-auth POST with neither Origin nor Referer", () => {
    const { res, status } = makeRes();
    csrfGuard(
      makeReq({
        method: "POST",
        cookies: { wim_token: "abc" },
        headers: {},
      }),
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
