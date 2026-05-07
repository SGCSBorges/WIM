import type { Article } from "../types";

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
    return await fetch(input, {
      ...(init ?? {}),
      signal: controller.signal,
      credentials: "include", // always send the httpOnly cookie
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out — please try again");
    }
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
  const data = await response
    .json()
    .catch(() => ({}) as Record<string, unknown>);
  return (data as { error?: string }).error ?? fallback;
}

// Auth API
export const authAPI = {
  async login(email: string, password: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Login failed"));

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

  async getMe(): Promise<{ userId: number; email: string; role: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/me`);
    if (!response.ok) throw new Error("Not authenticated");
    const user = await response.json();
    _cachedRole = user?.role ?? null;
    return user;
  },

  getRole(): string | null {
    return _cachedRole;
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
  async getAll(locationId?: number, page?: number, limit?: number) {
    const url = new URL(`${API_BASE_URL}/articles`);
    if (locationId) url.searchParams.set("locationId", String(locationId));
    if (page != null) url.searchParams.set("page", String(page));
    if (limit != null) url.searchParams.set("limit", String(limit));

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok)
      throw new Error(await extractError(response, "Failed to fetch articles"));

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
};

// Locations API
export const locationsAPI = {
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
    type: "INVOICE" | "WARRANTY" | "OTHER" = "OTHER"
  ) {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);

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
};

// Alerts API
export const alertsAPI = {
  async getAll(status?: string, page?: number, limit?: number) {
    const url = new URL(`${API_BASE_URL}/alerts`);
    if (status) url.searchParams.set("status", status);
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
  async getMe(): Promise<{ userId: number; email: string; role: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      headers: getHeaders(),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to load profile"));
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

  async deleteAccount(currentPassword: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      method: "DELETE",
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword }),
    });
    if (!response.ok)
      throw new Error(await extractError(response, "Failed to delete account"));
  },
};

// Admin API
export const adminAPI = {
  async listUsers() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/users`, {
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
    limit?: number;
    cursor?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.userId !== undefined) qs.set("userId", String(params.userId));
    if (params.action) qs.set("action", params.action);
    if (params.entity) qs.set("entity", params.entity);
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
};

export interface WarrantyItem {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin: string;
  garantieIsValide: boolean;
  garantieArticleId: number | null;
}

export interface ShareItem {
  inventoryShareId: number;
  permission: "READ" | "WRITE";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: { userId: number; email: string };
}

export interface ShareInviteItem {
  shareInviteId: number;
  email: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  permission: "READ" | "WRITE";
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

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
};

export interface SharedArticleRow {
  rowId: number;
  owner: { userId: number; email: string };
  article: {
    articleId: number;
    articleNom: string;
    articleModele: string;
    articleDescription?: string | null;
    createdAt: string;
    updatedAt: string;
    garantie?: {
      garantieId: number;
      garantieNom: string;
      garantieFin: string;
      garantieIsValide: boolean;
    } | null;
    locations?: Array<{ locationId: number; location?: { name: string } }>;
    ownerUserId: number;
  };
  createdAt: string;
  updatedAt: string;
}

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
};

// Billing / Stripe
export type BillingSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  cancelAt: number | null;
  endedAt: number | null;
  plan: "monthly" | "yearly" | null;
};

export const billingAPI = {
  async createPowerUserCheckoutSession(
    plan: "monthly" | "yearly",
    locale?: "en" | "fr" | "pt"
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

  async openPortal(locale?: "en" | "fr" | "pt"): Promise<{ url: string }> {
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
