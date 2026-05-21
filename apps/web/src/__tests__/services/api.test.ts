import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authAPI, API_BASE_URL } from "../../services/api";

describe("API_BASE_URL", () => {
  it("defaults to localhost in dev when VITE_API_BASE_URL is unset", () => {
    expect(API_BASE_URL).toBe("http://localhost:3000/api");
  });
});

describe("authAPI.login", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("posts credentials to /auth/login and returns JSON on success", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { role: "USER" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await authAPI.login("alice@example.com", "hunter2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/auth/login`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "alice@example.com",
      password: "hunter2",
    });
    expect(result).toEqual({ user: { role: "USER" } });
  });

  it("throws with the server-supplied error message on non-ok response", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(authAPI.login("alice@example.com", "wrong")).rejects.toThrow(
      "Invalid credentials"
    );
  });

  it("falls back to a default error message when body has no error field", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response("not json", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    );

    await expect(authAPI.login("alice@example.com", "x")).rejects.toThrow(
      "Login failed"
    );
  });
});
