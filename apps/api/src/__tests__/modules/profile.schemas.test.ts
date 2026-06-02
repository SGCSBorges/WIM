import { describe, it, expect } from "vitest";
import { UpdatePreferencesSchema } from "../../modules/profile/profile.schemas";

describe("profile/schemas — UpdatePreferences", () => {
  it("accepts a partial patch of one field", () => {
    expect(UpdatePreferencesSchema.parse({ theme: "ocean" })).toEqual({
      theme: "ocean",
    });
  });

  it("accepts all three fields together", () => {
    const input = {
      theme: "dark",
      language: "fr",
      dateFormat: "dd/MM/yyyy",
    };
    expect(UpdatePreferencesSchema.parse(input)).toEqual(input);
  });

  it("allows null to clear a preference back to the device default", () => {
    expect(UpdatePreferencesSchema.parse({ theme: null })).toEqual({
      theme: null,
    });
  });

  it("rejects an empty patch", () => {
    expect(UpdatePreferencesSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown enum values", () => {
    expect(
      UpdatePreferencesSchema.safeParse({ theme: "midnight" }).success
    ).toBe(false);
    expect(UpdatePreferencesSchema.safeParse({ language: "de" }).success).toBe(
      false
    );
    expect(
      UpdatePreferencesSchema.safeParse({ dateFormat: "DD-MM-YY" }).success
    ).toBe(false);
  });
});
