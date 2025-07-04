import axios, { AxiosInstance, AxiosResponse } from "axios";
import type {
  User,
  Article,
  Warranty,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ArticleCreateRequest,
  WarrantyCreateRequest,
  InventoryShare,
  ApiError,
} from "../types";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("wim_token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor to handle common errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear token and redirect to login
          localStorage.removeItem("wim_token");
          localStorage.removeItem("wim_user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      },
    );
  }

  // Helper method to handle API responses
  private handleResponse<T>(response: AxiosResponse<T>): T {
    return response.data;
  }

  private handleError(error: any): never {
    if (error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw { error: error.message || "Network error" } as ApiError;
  }

  // Auth endpoints
  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await this.client.post<AuthResponse>(
        "/auth/login",
        data,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await this.client.post<AuthResponse>(
        "/auth/register",
        data,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getProfile(): Promise<User> {
    try {
      const response = await this.client.get<User>("/auth/me");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Articles endpoints
  async getArticles(): Promise<Article[]> {
    try {
      const response = await this.client.get<Article[]>("/articles");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getArticle(id: number): Promise<Article> {
    try {
      const response = await this.client.get<Article>(`/articles/${id}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createArticle(data: ArticleCreateRequest): Promise<Article> {
    try {
      const response = await this.client.post<Article>("/articles", data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateArticle(
    id: number,
    data: Partial<ArticleCreateRequest>,
  ): Promise<Article> {
    try {
      const response = await this.client.put<Article>(`/articles/${id}`, data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteArticle(id: number): Promise<void> {
    try {
      await this.client.delete(`/articles/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Warranties endpoints
  async getWarranties(): Promise<Warranty[]> {
    try {
      const response = await this.client.get<Warranty[]>("/warranties");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getWarranty(id: number): Promise<Warranty> {
    try {
      const response = await this.client.get<Warranty>(`/warranties/${id}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createWarranty(data: WarrantyCreateRequest): Promise<Warranty> {
    try {
      const response = await this.client.post<Warranty>("/warranties", data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateWarranty(
    id: number,
    data: Partial<WarrantyCreateRequest>,
  ): Promise<Warranty> {
    try {
      const response = await this.client.put<Warranty>(
        `/warranties/${id}`,
        data,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteWarranty(id: number): Promise<void> {
    try {
      await this.client.delete(`/warranties/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Sharing methods
  async getShares(): Promise<InventoryShare[]> {
    try {
      const response = await this.client.get<InventoryShare[]>("/shares");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createShare(data: {
    sharedWithUserId: number;
    accessLevel: string;
  }): Promise<InventoryShare> {
    try {
      const response = await this.client.post<InventoryShare>("/shares", data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteShare(id: number): Promise<void> {
    try {
      await this.client.delete(`/shares/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Users methods
  async getUsers(): Promise<User[]> {
    try {
      const response = await this.client.get<User[]>("/users");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await this.client.get<{ status: string }>("/health");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
