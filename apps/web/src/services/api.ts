// API base URL strategy:
// - In development, default to the local API.
// - In production, prefer setting VITE_API_BASE_URL (e.g. https://wimapi.onrender.com/api).
//   If you *do* have a reverse proxy that serves the web app and forwards /api to the API service,
//   you can omit VITE_API_BASE_URL and same-origin "/api" will work.
export const API_BASE_URL: string = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) {
    // Allow setting either:
    //  - https://wimapi.onrender.com/api  (full)
    //  - https://wimapi.onrender.com      (origin only)
    // If it's just an origin (no pathname or just "/"), append "/api".
    const trimmed = fromEnv.replace(/\/$/, "");
    try {
      const u = new URL(trimmed);
      if (!u.pathname || u.pathname === "/") {
        u.pathname = "/api";
        return u.toString().replace(/\/$/, "");
      }
    } catch {
      // If it's a relative path like "/api", just keep it.
    }
    return trimmed;
  }

  // Vite sets PROD/DEV booleans.
  if (import.meta.env.PROD) return "/api";

  return "http://localhost:3000/api";
})();

// Get JWT token from localStorage
const getToken = (): string | null => {
  return localStorage.getItem("token");
};

const getRole = (): string | null => {
  return localStorage.getItem("role");
};

// Create headers with auth token
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 15000,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

// Auth API
export const authAPI = {
  async login(email: string, password: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = "Login failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
    }
    if (data.user?.role) {
      localStorage.setItem("role", data.user.role);
    }
    return data;
  },

  async register(email: string, password: string, role: string = "USER") {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, role }),
    });

    if (!response.ok) {
      let errorMessage = "Registration failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
    }
    if (data.user?.role) {
      localStorage.setItem("role", data.user.role);
    }
    return data;
  },

  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
  },

  async getProfile() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/me`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to get profile");
    }

    return response.json();
  },

  isAuthenticated(): boolean {
    return !!getToken();
  },

  getRole(): string | null {
    return getRole();
  },
};

// Articles API
export const articlesAPI = {
  async getAll(locationId?: number) {
    const url = new URL(`${API_BASE_URL}/articles`);
    if (locationId) url.searchParams.set("locationId", String(locationId));

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch articles");
    }

    return response.json();
  },

  async create(article: any) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(article),
    });

    if (!response.ok) {
      let errorMessage = `Failed to create article (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Keep default error message
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },

  async update(id: number, article: any) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(article),
    });

    if (!response.ok) {
      throw new Error("Failed to update article");
    }

    return response.json();
  },

  async getShares(articleId: number) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${articleId}/shares`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch article shares");
    return response.json();
  },

  async removeShare(articleId: number, shareId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/articles/${articleId}/share/${shareId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to remove share");
  },

  async setSharedWithPowerUsers(articleId: number, shared: boolean) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${articleId}/share`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ shared }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to update sharing");
    }
    return response.json();
  },

  async delete(id: number) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/articles/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (!response.ok) {
      let errorMessage = `Failed to delete article (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Keep default error message
      }
      throw new Error(errorMessage);
    }

    // DELETE returns 204 No Content, so no JSON to parse
    return null;
  },
};

// Locations API
export const locationsAPI = {
  async getAll() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/locations`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch locations");
    return response.json();
  },

  async create(data: { name: string; description?: string | null }) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/locations`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorMessage = `Failed to create location (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async addArticle(locationId: number, articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}/articles`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ articleId }),
      },
    );
    if (!response.ok) throw new Error("Failed to add article to location");
    return response.json();
  },

  async removeArticle(locationId: number, articleId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/locations/${locationId}/articles/${articleId}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      },
    );
    if (!response.ok) throw new Error("Failed to remove article from location");
    return null;
  },
};

// Attachments API
export const attachmentsAPI = {
  async getAll(options?: { articleId?: number; garantieId?: number }) {
    const url = new URL(`${API_BASE_URL}/attachments`);
    if (options?.articleId)
      url.searchParams.set("articleId", options.articleId.toString());
    if (options?.garantieId)
      url.searchParams.set("garantieId", options.garantieId.toString());

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch attachments (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },

  async uploadFile(
    file: File,
    type: "INVOICE" | "WARRANTY" | "OTHER" = "OTHER",
  ) {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);

    const response = await fetchWithTimeout(`${API_BASE_URL}/attachments/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    if (!response.ok) {
      let errorMessage = `Failed to upload file (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },

  async deleteAttachment(id: number, options?: { removeFile?: boolean }) {
    const token = getToken();
    const removeFile = options?.removeFile === true;
    const url = new URL(`${API_BASE_URL}/attachments/${id}`);
    if (removeFile) url.searchParams.set("removeFile", "true");

    const response = await fetchWithTimeout(url.toString(), {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      let errorMessage = `Failed to delete attachment (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },
};

// Alerts API
export const alertsAPI = {
  async getAll(status?: string) {
    const url = new URL(`${API_BASE_URL}/alerts`);
    if (status) url.searchParams.set("status", status);

    const response = await fetchWithTimeout(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch alerts (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },
};

// Statistics API
export const statisticsAPI = {
  async getDashboard() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/statistics/dashboard`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch dashboard statistics");
    }

    return response.json();
  },

  async getBasic() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/statistics/basic`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch basic statistics");
    }

    return response.json();
  },

  async getAdmin() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/statistics/admin`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch admin statistics");
    }

    return response.json();
  },
};

// Profile API
export const profileAPI = {
  async getMe(): Promise<{ userId: number; email: string; role: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to load profile");
    }
    return response.json();
  },

  async updateEmail(email: string, currentPassword: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me/email`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ email, currentPassword }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to update email");
    }
    return response.json();
  },

  async updatePassword(currentPassword: string, newPassword: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me/password`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to update password");
    }
    return response.json().catch(() => null);
  },

  async deleteAccount(currentPassword: string) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/profile/me`, {
      method: "DELETE",
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to delete account");
    }
  },
};

// Admin API
export const adminAPI = {
  async listUsers() {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/users`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to fetch users");
    }
    return response.json();
  },

  async getUserInventory(userId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}/inventory`,
      { headers: getHeaders() }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to fetch inventory");
    }
    return response.json();
  },

  async deleteUser(userId: number) {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/admin/users/${userId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to delete user");
    }
  },
};

// Warranties API
export const warrantiesAPI = {
  async getAll(): Promise<any[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/warranties`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to fetch warranties");
    }
    return response.json();
  },
};

// Shares API (owned-inventory sharing)
export const sharesAPI = {
  async getOwned(): Promise<any[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/shares/owned`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to fetch shares");
    }
    return response.json();
  },

  async revoke(targetUserId: number): Promise<void> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/shares/${targetUserId}`,
      { method: "DELETE", headers: getHeaders() }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to revoke share");
    }
  },
};

// Shared articles API (read-only view for POWER_USER receivers)
export const sharedAPI = {
  async getSharedArticles(): Promise<any[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/shared/articles`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to fetch shared articles");
    }
    return response.json();
  },
};

// Billing / Stripe
export const billingAPI = {
  async createPowerUserCheckoutSession(
    plan: "monthly" | "yearly",
  ): Promise<{ url: string }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/billing/upgrade/power-user/checkout`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ plan }),
      },
    );

    if (!response.ok) {
      let errorMessage = `Failed to start checkout (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },

  async openPortal(): Promise<{ url: string }> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/billing/portal`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to open billing portal");
    }
    return response.json();
  },

  async cancelAtPeriodEnd() {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/billing/cancel/power-user`,
      { method: "POST", headers: getHeaders() }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Failed to cancel subscription");
    }
    return response.json().catch(() => null);
  },

  async refreshRoleFromServer(): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/billing/me`, {
        headers: getHeaders(),
      });
      if (!response.ok) return getRole();
      const data = await response.json();
      if (data?.role) {
        localStorage.setItem("role", data.role);
        return data.role;
      }
      return getRole();
    } catch {
      return getRole();
    }
  },
};
