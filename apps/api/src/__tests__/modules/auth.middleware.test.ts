import { describe, it, expect, vi } from "vitest";
import type { Response, NextFunction } from "express";
import { requireRole, AuthRequest } from "../../modules/auth/auth.middleware";

function run(role: string | undefined, required: "POWER_USER" | "ADMIN") {
  const req = { user: role ? { sub: 1, role } : undefined } as AuthRequest;
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requireRole(required)(req, res, next);
  return { res, next, json };
}

describe("requireRole (role hierarchy)", () => {
  it("ADMIN passes a POWER_USER guard (inherits sharing)", () => {
    const { next, res } = run("ADMIN", "POWER_USER");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("POWER_USER passes a POWER_USER guard", () => {
    const { next } = run("POWER_USER", "POWER_USER");
    expect(next).toHaveBeenCalledOnce();
  });

  it("USER is denied a POWER_USER guard with 403", () => {
    const { next, res, json } = run("USER", "POWER_USER");
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Access denied" });
  });

  it("POWER_USER is denied an ADMIN guard (no downward leak)", () => {
    const { next, res } = run("POWER_USER", "ADMIN");
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("a missing user is denied", () => {
    const { next, res } = run(undefined, "POWER_USER");
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
