import { describe, it, expect } from "vitest";
import { createHttpError } from "../../utils/http-error";

describe("createHttpError", () => {
  it("creates an Error with the given message", () => {
    const err = createHttpError(404, "Not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Not found");
  });

  it("attaches status to the error", () => {
    const err = createHttpError(422, "Unprocessable");
    expect(err.status).toBe(422);
  });

  it("supports all common HTTP status codes", () => {
    expect(createHttpError(400, "Bad request").status).toBe(400);
    expect(createHttpError(401, "Unauthorized").status).toBe(401);
    expect(createHttpError(403, "Forbidden").status).toBe(403);
    expect(createHttpError(500, "Internal").status).toBe(500);
  });
});
