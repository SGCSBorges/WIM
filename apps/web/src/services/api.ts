/**
 * Web API client — one shared `fetchWithTimeout` wrapper + per-domain
 * client objects (authAPI, articlesAPI, …). Conventions worth knowing:
 *
 * • 45 s default timeout. Render free-tier API + Postgres cold-starts can
 *   easily stack to ~30 s; 45 s gives headroom without leaving real hangs
 *   unbounded. Per-call overrides exist for known-fast endpoints.
 *
 * • Cookie credentials always included (`credentials: "include"`) so the
 *   httpOnly `wim_token` cookie rides every request. The API enforces
 *   CSRF via Origin/Referer on mutating routes — fetch sends both
 *   automatically.
 *
 * • `_cachedRole` — in-memory only. Populated on login / register / getMe;
 *   cleared on logout. Lost on page reload, so the app re-fetches /me on
 *   boot. Used by the router to gate role-aware nav items without an
 *   extra fetch each render.
 *
 * • `extractError` — pulls the server-supplied `error` field. For 5xx,
 *   appends the `requestId` (from the X-Request-Id header or response
 *   body) so users can quote a reference when reporting a problem. For
 *   4xx we keep the message clean — those are user-actionable.
 *
 * • Pagination contract for endpoints that return more than a flat array:
 *   `{ items: T[], total: number, page: number, limit: number }`.
 *   Examples: articlesAPI.getAll, locationsAPI.listArticles, importRows
 *   (different shape — see method JSDoc).
 */
import type {
  AlertNotifications,
  Article,
  ArticleListParams,
  ArticleListResult,
  ArticleNote,
  ArticleNoteKind,
  BillingSubscription,
  ClaimStatus,
  DateFormatPref,
  FetchedArticle,
  LanguagePref,
  SavedView,
  ShareInviteItem,
  ShareItem,
  SharedArticleRow,
  ThemePref,
  UserPreferences,
  WarrantyExtendRequest,
  WarrantyHistoryItem,
  WarrantyItem,
  WarrantyRenewRequest,
} from "../types";

// Re-export shared response shapes so existing `import { X } from
// "../services/api"` sites keep working after the move into @wim/types.
export type {
  ArticleListParams,
  ArticleListResult,
  ArticleNote,
  ArticleNoteKind,
  BillingSubscription,
  SavedView,
  ShareInviteItem,
  ShareItem,
  SharedArticleRow,
  WarrantyItem,
};

// API base URL strategy:
// - In development, default to the local API.
// - In production, prefer setting VITE_API_BASE_URL (e.g. https://wimapi.onrender.com/api).
//   If you *do* have a reverse proxy that serves the web app and forwards /api to the API service,
//   you can omit VITE_API_BASE_URL and same-origin "/api" will work.
export const API_BASE_URL: string = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) {
    const trimmed = fromEnv.replace(/\/$/, "");
    try {
      const u = new URL(trimmed);
      if (!u.pathname || u.pathname === "/") {
        u.pathname = "/api";
        return u.toString().replace(/\/$/, "");
      }
    } catch {
      // relative path like "/api"
    }
    return trimmed;
  }

  if (import.meta.env.PROD) return "/api";

  return "http://localhost:3000/api";
})();

// In-memory role cache — populated on login/register/getMe; no localStorage.
let _cachedRole: string | null = null;

// Optional hook registered by the root App component. When set, any 401 from
// the API (cookie expired mid-session) triggers it so the app can flip to
// "unauthed" instead of staying stuck on a broken authenticated shell.
let _on401: (() => void) | null = null;
export function register401Handler(fn: () => void) {
  _on401 = fn;
}
export function unregister401Handler() {
  _on401 = null;
}

const getHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
});

// 45s default — generous enough to ride out a Render free-tier cold start
// (Postgres + API container can take ~30s to wake) without leaving real
// hangs unbounded. Override per-call when the endpoint is known to be fast.
const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 45000
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...(init ?? {}),
      signal: controller.signal,
      credentials: "include", // always send the httpOnly cookie
    });
    if (response.status === 401) _on401?.();
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out — please try again");
    }
    if (!navigator.onLine) throw new Error("You appear to be offline");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

// Extract the server-supplied error message from a non-ok Response, falling
// back to a caller-supplied default when the body is absent or unparseable.
async function extractError(
  response: Response,
  fallback: string
): Promise<string> {
  // Try JSON first; fall back to raw text for non-JSON responses (e.g. HTML
  // gateway pages from a Render cold-start 502).
  const text = await response.text().catch(() => "");
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON — leave data empty; message falls through to fallback.
  }
  const message = (data as { error?: string }).error ?? fallback;
  // For server errors only, append the request id so a user can quote the
  // reference when reporting a problem (4xx are user-actionable — kept clean).
  if (response.status >= 500) {
    const requestId =
      (data as { requestId?: string }).requestId ??
      response.headers.get("x-request-id") ??
      undefined;
    if (requestId) return `${message} (ref: ${requestId})`;
  }
  return message;
}

// Auth API
export const authAPI = {
  /** Returns either a session payload (`{ user }`) or, when the account has
   *  TOTP enabled, a 2FA challenge (`{ totpRequired: true, challengeToken }`)
   *  the caller must complete via `verifyTotp` to receive a real session. */
  async login(
    email: string,
    password: string
  ): Promise<
    | { user: { userId: number; email: string; role: string } }
    | { totpRequired: true; challengeToken: string }
  > {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Login failed"));

    const data = await response.json();
    if (data?.totpRequired) return data;
    _cachedRole = data.user?.role ?? null;
    return data;
  },

  async verifyTotp(challengeToken: string, code: string) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/login/verify-totp`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ challengeToken, code }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "TOTP verification failed"));
    const data = await response.json();
    _cachedRole = data.user?.role ?? null;
    return data;
  },

  async register(email: string, password: string, role: string = "USER") {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ email, password, role }),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Registration failed"));

    const data = await response.json();
    _cachedRole = data.user?.role ?? null;
    return data;
  },

  async logout() {
    await fetchWithTimeout(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
    }).catch(() => undefined);
    _cachedRole = null;
  },

  async getMe(): Promise<{
    userId: number;
    email: string;
    role: string;
    theme?: ThemePref | null;
    language?: LanguagePref | null;
    dateFormat?: DateFormatPref | null;
  }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/me`);
    if (!response.ok) throw new Error("Not authenticated");
    const user = await response.json();
    _cachedRole = user?.role ?? null;
    return user;
  },

  getRole(): string | null {
    return _cachedRole;
  },

  async forgotPassword(email: string): Promise<void> {
    // The endpoint always 204s (no enumeration). Surface a thrown error only
    // for transport / 5xx issues so the UI can show generic success copy.
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/forgot-password`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email }),
      }
    );
    if (!response.ok && response.status >= 500) {
      throw new Error(await extractError(response, "Request failed"));
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/reset-password`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ token, newPassword }),
      }
    );
    if (!response.ok) {
      throw new Error(await extractError(response, "Reset failed"));
    }
  },

  // Temporary helper: hits the one-shot bootstrap endpoint that promotes
  // admin@admin.com to ADMIN if no admin exists yet. Remove this once the
  // seed admin is in place.
  async bootstrapAdmin(): Promise<{ ok: true; email: string; role: string }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/bootstrap-admin`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Bootstrap failed"));
    return response.json();
  },
};

// Articles API
export const articlesAPI = {
  /**
   * Paginated article list. The full filter vocabulary the server accepts
   * is mirrored on `params` (location, tag, q, warrantyStatus, price/date
   * range, sort, dir, page, limit). Returns `{ items, total, page, limit }`
   * so the caller can render a pager without a second fetch.
   */
  async getAll(params: ArticleListParams = {}): Promise<ArticleListResult> {
    const url = new URL(`${API_BASE_URL}/articles`);
    const p = url.searchParams;
    if (params.locationId) p.set("locationId", String(params.locationId));
    if (params.tagId) p.set("tag", String(params.tagId));
    if (params.q) p.set("q", params.q);
    if (params.warrantyStatus) p.set("warrantyStatus", params.warrantyStatus);
    if (params.priceMin != null) p.set("priceMin", String(params.priceMin));
    if (params.priceMax != null) p.set("priceMax", String(params.priceMax));
    if (params.createdFrom) p.set("createdFrom", params.createdFrom);
    if (params.createdTo) p.set("createdTo", params.createdTo);
    if (params.sort) p.set("sort", params.sort);
    if (params.dir) p.set("dir", params.dir);
    if (params.page != null) p.set("page", String(params.page));
    if (params.limit != null) p.set("limit", String(params.limit));

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch articles"));

    return response.json();
  },

  async claimPdf(id: number): Promise<Blob> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${id}/claim.pdf`,
      { headers: { Accept: "application/pdf" } }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to generate PDF"));
    return response.blob();
  },

  async inventoryPdf(): Promise<Blob> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/export/inventory.pdf`,
      { headers: { Accept: "application/pdf" } }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to generate PDF"));
    return response.blob();
  },

  /** CSV export honouring the same filters as the list endpoint. */
  async inventoryCsv(qs: string = ""): Promise<Blob> {
    const url = `${API_BASE_URL}/articles/export/inventory.csv${qs ? `?${qs}` : ""}`;
    const response = await fetchWithTimeout(url, {
      headers: { Accept: "text/csv" },
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to generate CSV"));
    return response.blob();
  },

  async labelsPdf(): Promise<Blob> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/export/labels.pdf`,
      { headers: { Accept: "application/pdf" } }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to generate PDF"));
    return response.blob();
  },

  async getById(id: number): Promise<FetchedArticle> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch article"));
    return response.json();
  },

  async create(article: Omit<Article, "articleId">) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(article),
    });

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to create article (${response.status})`
        )
      );
    return response.json();
  },

  /**
   * Bulk-import articles from parsed CSV rows.
   *
   * `options.dryRun: true` returns a per-row validation report WITHOUT
   * writing anything — the CsvImportModal uses this to render error rows
   * before committing. Without dryRun the same rows persist + return
   * `{ created, errors }` so the UI can show which rows failed mid-batch.
   */
  async importRows(
    rows: Array<{
      name: string;
      model: string;
      description?: string | null;
      price?: number | null;
      locations: string[];
      tags: string[];
    }>,
    options: { dryRun?: boolean } = {}
  ): Promise<{
    created: number;
    errors: Array<{ row: number; message: string }>;
    dryRun?: boolean;
  }> {
    const url = new URL(`${API_BASE_URL}/articles/import`);
    if (options.dryRun) url.searchParams.set("dryRun", "1");
    const response = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ rows }),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to import articles")
      );
    return response.json();
  },

  async update(id: number, article: Omit<Article, "articleId">) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(article),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update article"));
    return response.json();
  },

  // Partial update to set (or clear) the primary product image. The server's
  // update schema is partial, so other fields are left untouched.
  async setPrimaryImage(id: number, productImageUrl: string | null) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ productImageUrl }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update image"));
    return response.json();
  },

  async getShares(articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/shares`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch article shares")
      );
    return response.json();
  },

  async removeShare(articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/share`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to remove share"));
  },

  async setSharedWithPowerUsers(articleId: number, shared: boolean) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/share`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ shared }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update sharing"));
    return response.json();
  },

  async delete(id: number) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to delete article (${response.status})`
        )
      );
    return null;
  },

  /** Server-side clone: deep-copies the article (name suffixed " (copy)",
   *  same locations and tags) but intentionally skips the warranty so a
   *  duplicate doesn't trigger a second set of reminders for the same
   *  purchase. */
  async duplicate(id: number): Promise<FetchedArticle> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${id}/duplicate`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to duplicate article")
      );
    return response.json();
  },

  /** List soft-deleted articles for the current user (Trash view). */
  async listTrash(): Promise<{ items: FetchedArticle[] }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/trash`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load trash"));
    return response.json();
  },

  /** Restore a soft-deleted article (clears deletedAt). */
  async restore(id: number): Promise<FetchedArticle> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${id}/restore`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to restore article")
      );
    return response.json();
  },

  /** Permanently delete (skip the retention window). */
  async purge(id: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${id}/purge`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to purge article"));
    return null;
  },

  async bulkRestoreTrash(ids: number[]): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/trash/bulk-restore`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to restore articles")
      );
    return response.json();
  },

  async bulkPurgeTrash(ids: number[]): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/trash/bulk-purge`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to purge articles"));
    return response.json();
  },

  // Bulk operations on the caller's owned articles.
  async bulkDelete(ids: number[]): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/bulk-delete`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to delete articles")
      );
    return response.json();
  },

  async bulkSetSharedWithPowerUsers(
    ids: number[],
    shared: boolean
  ): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/bulk-share`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids, shared }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update sharing"));
    return response.json();
  },

  async bulkAssign(
    ids: number[],
    add: { addLocationIds?: number[]; addTagIds?: number[] }
  ): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/bulk-assign`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids, ...add }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to assign articles")
      );
    return response.json();
  },

  /** Bulk-update scalar fields. `null` clears a value, missing keys leave
   *  it alone. Server enforces ownership + skips trashed rows. */
  async bulkUpdate(
    ids: number[],
    fields: {
      purchasePrice?: number | null;
      depreciationRate?: number | null;
      brand?: string | null;
      serialNumber?: string | null;
    }
  ): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/bulk-update`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids, fields }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update articles")
      );
    return response.json();
  },

  // GET /api/articles/shared-public — caller's articles where
  // sharedWithPowerUsers = true. Used by the Profile view's
  // "Articles you've shared publicly" panel.
  async getMySharedPublic(): Promise<FetchedArticle[]> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/shared-public`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch shared articles")
      );
    return response.json();
  },

  // POST /api/articles/unshare-all — kill switch on the public-share
  // toggle for every article the caller owns. Returns the count.
  async unshareAll(): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/unshare-all`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to unshare all articles")
      );
    return response.json();
  },
};

// Locations API
export const locationsAPI = {
  /** Paginated list of the caller's locations.
   *  Returns `{ items, total, page, limit }` when pagination params are
   *  supplied; a bare list otherwise (legacy callers that don't paginate). */
  async getAll(page?: number, limit?: number) {
    const url = new URL(`${API_BASE_URL}/locations`);
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch locations")
      );
    return response.json();
  },

  async create(data: { name: string; description?: string | null }) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/locations`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to create location (${response.status})`
        )
      );
    return response.json();
  },

  async update(
    locationId: number,
    data: { name?: string; description?: string | null }
  ) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update location")
      );
    return response.json();
  },

  async delete(locationId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to delete location")
      );
  },

  async listArticles(
    locationId: number,
    params: { page?: number; limit?: number } = {}
  ): Promise<{
    items: Array<{
      articleId: number;
      articleNom: string;
      articleModele: string;
      articleDescription: string | null;
      productImageUrl: string | null;
      assignedAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const url = `${API_BASE_URL}/locations/${locationId}/articles${
      qs.toString() ? `?${qs.toString()}` : ""
    }`;
    const response = await fetchWithTimeout(url, { headers: getHeaders() });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch location articles")
      );
    return response.json();
  },

  async addArticle(locationId: number, articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}/articles`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ articleId }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to add article to location")
      );
    return response.json();
  },

  async removeArticle(locationId: number, articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}/articles/${articleId}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to remove article from location")
      );
    return null;
  },
};

// Attachments API
export const attachmentsAPI = {
  async getAll(options?: {
    articleId?: number;
    garantieId?: number;
    page?: number;
    limit?: number;
  }) {
    const url = new URL(`${API_BASE_URL}/attachments`);
    if (options?.articleId)
      url.searchParams.set("articleId", options.articleId.toString());
    if (options?.garantieId)
      url.searchParams.set("garantieId", options.garantieId.toString());
    if (options?.page != null)
      url.searchParams.set("page", String(options.page));
    if (options?.limit != null)
      url.searchParams.set("limit", String(options.limit));

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to fetch attachments (${response.status})`
        )
      );
    return response.json();
  },

  async uploadFile(
    file: File,
    type: "INVOICE" | "WARRANTY" | "OTHER" = "OTHER",
    options: { articleId?: number } = {}
  ) {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    if (options.articleId != null)
      form.append("articleId", String(options.articleId));

    // No Content-Type header — let the browser set multipart/form-data boundary.
    // credentials: 'include' is added by fetchWithTimeout automatically.
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/attachments/upload`,
      {
        method: "POST",
        body: form,
      }
    );

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to upload file (${response.status})`
        )
      );
    return response.json();
  },

  /** Delete an attachment row. `removeFile: true` also unlinks the
   *  underlying file from disk; default is to keep the file (the row
   *  goes away but the bytes survive — useful when a sibling row
   *  references the same file). */
  async deleteAttachment(id: number, options?: { removeFile?: boolean }) {
    const removeFile = options?.removeFile === true;
    const url = new URL(`${API_BASE_URL}/attachments/${id}`);
    if (removeFile) url.searchParams.set("removeFile", "true");

    const response = await fetchWithTimeout(url.toString(), {
      method: "DELETE",
    });

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to delete attachment (${response.status})`
        )
      );
  },

  async bulkDelete(ids: number[]): Promise<{ count: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/attachments/bulk-delete`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to delete attachments")
      );
    return response.json();
  },
};

// Tags API
export const tagsAPI = {
  async getAll(): Promise<
    Array<{ tagId: number; name: string; articleCount: number }>
  > {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tags`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load tags"));
    return response.json();
  },

  async create(name: string): Promise<{ tagId: number; name: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tags`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to create tag"));
    return response.json();
  },

  async rename(
    tagId: number,
    name: string
  ): Promise<{ tagId: number; name: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tags/${tagId}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to rename tag"));
    return response.json();
  },

  /** Move every article from `fromId` to `intoId` (deduping on the
   *  join table), then delete `fromId`. Returns the count of articles
   *  re-tagged so the UI can show "merged N articles". */
  async merge(
    fromId: number,
    intoId: number
  ): Promise<{ articlesAffected: number }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tags/merge`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ fromId, intoId }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to merge tags"));
    return response.json();
  },

  async remove(tagId: number): Promise<void> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tags/${tagId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to delete tag"));
  },
};

// Article maintenance/service notes
export const notesAPI = {
  async list(articleId: number): Promise<ArticleNote[]> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/notes`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load notes"));
    return response.json();
  },

  async create(
    articleId: number,
    content: string,
    kind?: ArticleNoteKind
  ): Promise<ArticleNote> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/notes`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ content, ...(kind ? { kind } : {}) }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to add note"));
    return response.json();
  },

  async update(
    articleId: number,
    noteId: number,
    patch: { content?: string; kind?: ArticleNoteKind }
  ): Promise<ArticleNote> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/notes/${noteId}`,
      {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(patch),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update note"));
    return response.json();
  },

  async remove(articleId: number, noteId: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/notes/${noteId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to delete note"));
  },
};

// Saved Articles filter presets
export const savedViewsAPI = {
  async list(): Promise<SavedView[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/saved-views`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load views"));
    return response.json();
  },

  async create(name: string, query: string): Promise<SavedView> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/saved-views`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, query }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to save view"));
    return response.json();
  },

  async remove(id: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/saved-views/${id}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to delete view"));
  },
};

// Web Push subscriptions
export const pushAPI = {
  // Returns the VAPID public key, or null when push isn't configured server-side.
  async publicKey(): Promise<string | null> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/push/public-key`, {
      headers: getHeaders(),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load push key"));
    const data = await response.json();
    return data.publicKey ?? null;
  },

  async subscribe(sub: PushSubscriptionJSON): Promise<void> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/push/subscribe`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(sub),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to subscribe"));
  },

  async unsubscribe(endpoint: string): Promise<void> {
    await fetchWithTimeout(`${API_BASE_URL}/push/unsubscribe`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  },
};

// Calendar feed
export const calendarAPI = {
  async enable(): Promise<{ token: string; path: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/calendar/token`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to enable calendar feed")
      );
    return response.json();
  },

  async disable(): Promise<void> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/calendar/token`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to disable calendar feed")
      );
  },

  // Build the absolute feed URL from the API origin + returned path.
  feedUrl(path: string): string {
    try {
      return new URL(API_BASE_URL).origin + path;
    } catch {
      return path;
    }
  },
};

// Alerts API
export const alertsAPI = {
  async getAll(
    status?: string,
    page?: number,
    limit?: number,
    kind?: "WARRANTY" | "CUSTOM",
    articleId?: number
  ) {
    const url = new URL(`${API_BASE_URL}/alerts`);
    if (status) url.searchParams.set("status", status);
    if (kind) url.searchParams.set("kind", kind);
    if (articleId != null) url.searchParams.set("articleId", String(articleId));
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to fetch alerts (${response.status})`
        )
      );
    return response.json();
  },

  async create(input: {
    alerteNom: string;
    alerteDate: string;
    alerteDescription?: string | null;
    recurrenceMonths?: number | null;
    alerteArticleId?: number | null;
  }) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to create alert"));
    return response.json();
  },

  async snooze(alerteId: number, days: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/alerts/${alerteId}/snooze`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ days }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to snooze alert"));
    return response.json();
  },

  async cancel(alerteId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/alerts/${alerteId}/cancel`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to cancel alert"));
    return response.json();
  },

  async notifications(): Promise<AlertNotifications> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/alerts/notifications`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch notifications")
      );
    return response.json();
  },

  async markSeen(): Promise<void> {
    await fetchWithTimeout(`${API_BASE_URL}/alerts/mark-seen`, {
      method: "POST",
      headers: getHeaders(),
    });
  },
};

// Statistics API
export const statisticsAPI = {
  async getDashboard() {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/statistics/dashboard`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch dashboard statistics")
      );
    return response.json();
  },

  async getBasic() {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/statistics/basic`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch basic statistics")
      );
    return response.json();
  },

  async getAdmin() {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/statistics/admin`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch admin statistics")
      );
    return response.json();
  },
};

// Profile API
export const profileAPI = {
  async getMe(): Promise<{
    userId: number;
    email: string;
    role: string;
    currency?: string;
    emailReminders?: boolean;
    weeklyDigest?: boolean;
    theme?: ThemePref | null;
    language?: LanguagePref | null;
    dateFormat?: DateFormatPref | null;
    totpEnabled?: boolean;
  }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load profile"));
    return response.json();
  },

  async getSessions(): Promise<{
    items: Array<{
      id: number;
      jti: string;
      deviceLabel: string | null;
      ip: string | null;
      userAgent: string | null;
      lastActiveAt: string;
      createdAt: string;
    }>;
    currentJti: string | null;
  }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/sessions`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch sessions"));
    return response.json();
  },

  async revokeSession(id: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/sessions/${id}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to revoke session"));
  },

  async revokeOtherSessions(): Promise<{ revoked: number }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/sessions/revoke-others`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to revoke other sessions")
      );
    return response.json();
  },

  /** Provision a fresh TOTP secret. Returns the QR data-URL (to render as
   *  an <img>) and the plaintext backup codes — surfaced ONCE; the server
   *  only stores bcrypt hashes. The caller must save them out-of-band. */
  async setupTotp(currentPassword: string): Promise<{
    otpauthUrl: string;
    qrDataUrl: string;
    backupCodes: string[];
  }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/totp/setup`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ currentPassword }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to set up two-factor auth")
      );
    return response.json();
  },

  async verifyTotpSetup(currentPassword: string, code: string): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/totp/verify`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ currentPassword, code }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to confirm two-factor code")
      );
  },

  async disableTotp(currentPassword: string): Promise<void> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me/totp`, {
      method: "DELETE",
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword }),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to disable two-factor auth")
      );
  },

  async getLoginHistory(): Promise<
    Array<{
      id: number;
      action: "LOGIN" | "LOGOUT";
      ip: string | null;
      userAgent: string | null;
      createdAt: string;
    }>
  > {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/login-history`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch login history")
      );
    return response.json();
  },

  async updatePreferences(prefs: UserPreferences) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/preferences`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(prefs),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update preferences")
      );
    return response.json();
  },

  async updateEmailReminders(enabled: boolean) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/email-reminders`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update email reminders")
      );
    return response.json();
  },

  async updateWeeklyDigest(enabled: boolean) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/weekly-digest`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update weekly digest")
      );
    return response.json();
  },

  async updateCurrency(currency: string) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/currency`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ currency }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update currency")
      );
    return response.json();
  },

  async updateEmail(email: string, currentPassword: string) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/email`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ email, currentPassword }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update email"));
    return response.json();
  },

  async updatePassword(currentPassword: string, newPassword: string) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/profile/me/password`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update password")
      );
    return response.json().catch(() => null);
  },

  /**
   * Deletes the current user's account. Throws a regular Error on failure,
   * but attaches the HTTP status as `err.status` so callers can distinguish
   * "wrong password" (401) from "account already gone" (404) without
   * parsing the message text. The "already gone" case is treated as
   * idempotent success by the UI.
   */
  async deleteAccount(currentPassword: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      method: "DELETE",
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword }),
    });
    if (!response.ok) {
      const err = new Error(
        await extractError(response, "Failed to delete account")
      ) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
  },
};

// Admin API
export const adminAPI = {
  async listUsers(
    options: {
      q?: string;
      sort?: "email" | "role" | "createdAt";
      dir?: "asc" | "desc";
    } = {}
  ) {
    const url = new URL(`${API_BASE_URL}/admin/users`);
    if (options.q) url.searchParams.set("q", options.q);
    if (options.sort) url.searchParams.set("sort", options.sort);
    if (options.dir) url.searchParams.set("dir", options.dir);
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch users"));
    return response.json();
  },

  async getUserInventory(userId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}/inventory`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch inventory")
      );
    return response.json();
  },

  async deleteUser(userId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to delete user"));
  },

  async createUser(input: {
    email: string;
    password: string;
    role: "USER" | "POWER_USER" | "ADMIN";
  }) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/users`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to create user"));
    return response.json();
  },

  async updateUser(
    userId: number,
    input: { email?: string; role?: "USER" | "POWER_USER" | "ADMIN" }
  ) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}`,
      {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(input),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update user"));
    return response.json();
  },

  async resetPassword(userId: number, password: string) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}/reset-password`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ password }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to reset password"));
  },

  async forceLogout(userId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}/force-logout`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to force logout"));
  },

  async listAuditLog(params: {
    userId?: number;
    action?: string;
    entity?: string;
    createdFrom?: string;
    createdTo?: string;
    limit?: number;
    cursor?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.userId !== undefined) qs.set("userId", String(params.userId));
    if (params.action) qs.set("action", params.action);
    if (params.entity) qs.set("entity", params.entity);
    if (params.createdFrom) qs.set("createdFrom", params.createdFrom);
    if (params.createdTo) qs.set("createdTo", params.createdTo);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.cursor !== undefined) qs.set("cursor", String(params.cursor));
    const url = `${API_BASE_URL}/admin/audit-log${qs.toString() ? `?${qs}` : ""}`;
    const response = await fetchWithTimeout(url, { headers: getHeaders() });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch audit log")
      );
    return response.json() as Promise<{
      entries: Array<{
        id: number;
        userId: number | null;
        action: string;
        entity: string;
        entityId: number | null;
        method: string | null;
        path: string | null;
        status: number | null;
        metadata: unknown;
        createdAt: string;
        user: { email: string } | null;
      }>;
      nextCursor: number | null;
    }>;
  },

  /** Per-queue job state for the Admin → Jobs panel. `alerts` and
   *  `maintenance` are BullMQ job-state histograms (active/waiting/
   *  delayed/etc.); `auditPruneNextRun` is the next repeatable-job
   *  millisecond timestamp. */
  async getJobs(): Promise<{
    alerts: Record<string, number> | null;
    maintenance: Record<string, number> | null;
    auditPruneNextRun: number | null;
  }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/jobs`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch jobs"));
    return response.json();
  },

  async getFailedJobs(): Promise<{
    items: Array<{
      queue: string;
      id: string | undefined;
      name: string;
      failedReason: string | undefined;
      stacktrace: string[];
      attemptsMade: number;
      maxAttempts: number | undefined;
      data: unknown;
      finishedOn: number | undefined;
    }>;
  }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/failed-jobs`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch failed jobs")
      );
    return response.json();
  },

  /** Full-database export: returns the raw JSON blob so the caller can
   *  save it to disk. Round-trips through `importDatabase` as-is. */
  async exportDatabase(): Promise<{ blob: Blob; filename: string }> {
    // 5 minutes: large dumps + cold-start API + slow connection can stack up.
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/db/export`,
      { headers: getHeaders() },
      5 * 60 * 1000
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to export database")
      );
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? `wim-backup-${Date.now()}.json`;
    const blob = await response.blob();
    return { blob, filename };
  },

  // Full-database import: send the previously exported JSON back. The
  // server replaces every row. Caller MUST treat this as a destructive
  // logout — the calling admin's User row was rewritten. The caller's
  // current password is required as a tripwire against stolen sessions.
  async importDatabase(
    payload: unknown,
    options: { currentPassword: string; keepStripeIds?: boolean }
  ): Promise<{
    counts: Record<string, number>;
    sessionInvalidated: boolean;
  }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/db/import`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          confirm: "REPLACE",
          currentPassword: options.currentPassword,
          keepStripeIds: options.keepStripeIds === true,
          payload,
        }),
      },
      5 * 60 * 1000
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to import database")
      );
    return response.json();
  },
};

// Warranties API
export const warrantiesAPI = {
  async getAll(page?: number, limit?: number): Promise<WarrantyItem[]> {
    const url = new URL(`${API_BASE_URL}/warranties`);
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch warranties")
      );
    return response.json();
  },

  async updateClaim(
    garantieId: number,
    input: { status: ClaimStatus; note?: string | null }
  ) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/warranties/${garantieId}/claim`,
      {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(input),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to update claim"));
    return response.json();
  },

  async renew(garantieId: number, input: WarrantyRenewRequest) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/warranties/${garantieId}/renew`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(input),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to renew warranty"));
    return response.json();
  },

  async extend(garantieId: number, input: WarrantyExtendRequest) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/warranties/${garantieId}/extend`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(input),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to extend warranty")
      );
    return response.json();
  },

  async getHistory(garantieId: number): Promise<WarrantyHistoryItem[]> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/warranties/${garantieId}/history`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch warranty history")
      );
    return response.json();
  },
};

// Article templates — reusable starting points for the create form.
// Payload is owner-decoded; locations + tags are stored by name so they
// survive a rename or a delete of the live row.
export interface ArticleTemplatePayload {
  articleNom?: string;
  articleModele?: string;
  articleDescription?: string | null;
  brand?: string | null;
  serialNumber?: string | null;
  productImageUrl?: string | null;
  purchasePrice?: number | null;
  depreciationRate?: number | null;
  locationNames?: string[];
  tagNames?: string[];
}

export interface ArticleTemplate {
  id: number;
  name: string;
  payload: ArticleTemplatePayload;
  createdAt: string;
  updatedAt: string;
}

export const articleTemplatesAPI = {
  async list(): Promise<ArticleTemplate[]> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/article-templates`,
      { headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch templates")
      );
    return response.json();
  },

  async create(
    name: string,
    payload: ArticleTemplatePayload
  ): Promise<ArticleTemplate> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/article-templates`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, payload }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to save template"));
    return response.json();
  },

  async remove(id: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/article-templates/${id}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to delete template")
      );
  },
};

// Reports API — currently only the insurance portfolio PDF. Returns a Blob
// so the caller can download it via `downloadBlob`.
export const reportsAPI = {
  async portfolioPdf(filters: {
    locationId?: number | null;
    tagId?: number | null;
    warrantyStatus?: "valid" | "expiringSoon" | "expired" | "none" | null;
  }): Promise<Blob> {
    const url = new URL(`${API_BASE_URL}/reports/portfolio.pdf`);
    if (filters.locationId)
      url.searchParams.set("locationId", String(filters.locationId));
    if (filters.tagId) url.searchParams.set("tagId", String(filters.tagId));
    if (filters.warrantyStatus)
      url.searchParams.set("warrantyStatus", filters.warrantyStatus);
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to download report")
      );
    return response.blob();
  },
};

// Shares API (owned-inventory sharing)
export const sharesAPI = {
  async getOwned(page?: number, limit?: number): Promise<ShareItem[]> {
    const url = new URL(`${API_BASE_URL}/shares/owned`);
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch shares"));
    return response.json();
  },

  async revoke(targetUserId: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/shares/${targetUserId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to revoke share"));
  },

  async createInvite(data: {
    email: string;
    permission: "READ" | "WRITE";
    expiresAt?: Date | string;
  }): Promise<ShareInviteItem> {
    const expiresAt =
      data.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const response = await fetchWithTimeout(`${API_BASE_URL}/shares/invites`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ ...data, expiresAt }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to create invite"));
    return response.json();
  },

  async getSentInvites(
    page?: number,
    limit?: number
  ): Promise<ShareInviteItem[]> {
    const url = new URL(`${API_BASE_URL}/shares/invites/sent`);
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch invites"));
    return response.json();
  },

  async revokeInvite(inviteId: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/shares/invites/${inviteId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to revoke invite"));
  },

  // Redeem a token-based invite. The server creates an active
  // InventoryShare from the invite's owner to the calling user.
  async acceptInvite(token: string): Promise<{
    ownerUserId: number;
    targetUserId: number;
    permission: "READ" | "WRITE";
  }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/shares/invites/accept`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ token }),
      }
    );
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to accept invite"));
    return response.json();
  },
};

// Shared articles API (read-only view for POWER_USER receivers)
export const sharedAPI = {
  async getSharedArticles(
    page?: number,
    limit?: number
  ): Promise<SharedArticleRow[]> {
    const url = new URL(`${API_BASE_URL}/shared/articles`);
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to fetch shared articles")
      );
    return response.json();
  },

  // PUT /shared/articles/:id — only valid when caller has a WRITE
  // InventoryShare from the article's owner. Server enforces.
  async updateSharedArticle(
    articleId: number,
    patch: {
      articleNom?: string;
      articleModele?: string;
      articleDescription?: string | null;
      productImageUrl?: string | null;
    }
  ) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/shared/articles/${articleId}`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(patch),
      }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to update shared article")
      );
    return response.json();
  },
};

// Billing / Stripe
export const billingAPI = {
  async createPowerUserCheckoutSession(
    plan: "monthly" | "yearly",
    locale?: "en" | "fr" | "pt" | "es" | "nl"
  ): Promise<{ url: string }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/billing/upgrade/power-user/checkout`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ plan, locale }),
      }
    );

    if (!response.ok)
      throw new Error(
        await extractError(
          response,
          `Failed to start checkout (${response.status})`
        )
      );
    return response.json();
  },

  async openPortal(
    locale?: "en" | "fr" | "pt" | "es" | "nl"
  ): Promise<{ url: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/billing/portal`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ locale }),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to open billing portal")
      );
    return response.json();
  },

  async cancelAtPeriodEnd() {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/billing/cancel/power-user`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to cancel subscription")
      );
    return response.json().catch(() => null);
  },

  /** Re-read the user's role from the API, updating the in-memory
   *  `_cachedRole`. Used by the router to detect a server-side role
   *  change (Stripe webhook upgraded the user) without forcing a
   *  full /me refetch. Errors are swallowed — keeps the cached value. */
  async refreshRoleFromServer(): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/billing/me`, {
        headers: getHeaders(),
      });
      if (!response.ok) return _cachedRole;
      const data = await response.json();
      if (data?.role) {
        _cachedRole = data.role;
        return data.role;
      }
      return _cachedRole;
    } catch {
      return _cachedRole;
    }
  },

  async getBillingMe(): Promise<{
    userId: number;
    email: string;
    role: string;
    subscription: BillingSubscription | null;
  }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/billing/me`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(
        await extractError(response, "Failed to load billing info")
      );
    return response.json();
  },

  // Asks the API to query Stripe directly for the current subscription and
  // reconcile the user's role + stripeSubscriptionId. Use this on return
  // from Stripe Checkout so the user doesn't have to wait for the webhook.
  async syncFromStripe(): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/billing/sync`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!response.ok) return _cachedRole;
      const data = await response.json();
      if (data?.role) {
        _cachedRole = data.role;
        return data.role;
      }
      return _cachedRole;
    } catch {
      return _cachedRole;
    }
  },
};
