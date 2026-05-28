import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "../openapi/document";

// One path per router so a forgotten module gets caught loudly.
const EXPECTED_PRIMARY_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/articles",
  "/api/locations",
  "/api/warranties",
  "/api/alerts",
  "/api/attachments",
  "/api/articles/{id}/notes",
  "/api/tags",
  "/api/saved-views",
  "/api/shares/invites",
  "/api/shared/articles",
  "/api/calendar/token",
  "/api/push/public-key",
  "/api/billing/me",
  "/api/profile/me",
  "/api/statistics/dashboard",
  "/api/admin/users",
  "/api/admin/audit-log",
  "/health",
];

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument() as {
    info: { title: string };
    paths: Record<string, unknown>;
  };

  it("renders with the expected metadata", () => {
    expect(doc.info.title).toBe("WIM API");
  });

  it("documents every router's primary path", () => {
    for (const path of EXPECTED_PRIMARY_PATHS) {
      expect(
        Object.keys(doc.paths),
        `missing OpenAPI path: ${path}`
      ).toContain(path);
    }
  });
});
