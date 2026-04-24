import { describe, it, expect } from "vitest";
import { RegisterSchema, LoginSchema } from "../../modules/auth/auth.schemas";

describe("RegisterSchema", () => {
  const valid = {
    email: "user@example.com",
    password: "SecurePass1!",
    role: "USER" as const,
  };

  it("accepts a valid registration payload", () => {
    const result = RegisterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults role to USER when omitted", () => {
    const result = RegisterSchema.safeParse({ email: valid.email, password: valid.password });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("USER");
  });

  it("rejects an invalid email", () => {
    const result = RegisterSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "Ab1!" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no uppercase letter", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "securepass1!" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no lowercase letter", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "SECUREPASS1!" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "SecurePass!!" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no special character", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "SecurePass11" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = RegisterSchema.safeParse({ ...valid, role: "SUPER_ADMIN" });
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = LoginSchema.safeParse({ email: "a@b.com", password: "any" });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = LoginSchema.safeParse({ password: "abc" });
    expect(result.success).toBe(false);
  });
});
