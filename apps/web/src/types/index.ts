// Core entities
export interface User {
  userId: number;
  email: string;
  role: "USER" | "POWER_USER" | "ADMIN";
}

export interface Article {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  ownerUserId: number;
  garantie?: Warranty | null;
}

export interface ArticleWithWarranties extends Article {
  warranties?: Warranty[];
}

export interface Warranty {
  garantieId: number;
  garantieArticleId: number;
  garantieNom: string;
  garantieDateAchat: string; // ISO date string
  garantieDuration: number; // months
  garantieFin: string; // ISO date string
  garantieIsValide: boolean;
  garantieImage?: string | null;
  ownerUserId: number;
}

export interface Alert {
  alerteId: number;
  alerteGarantieId?: number;
  alerteArticleId?: number;
  alerteNom: string;
  alerteDate: string; // ISO date string
  alerteDescription?: string | null;
}

export interface InventoryShare {
  shareId: number;
  ownerUserId: number;
  sharedWithUserId: number;
  accessLevel: "READ" | "WRITE";
  createdAt: string; // ISO date string
}

// API Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role?: "USER" | "POWER_USER" | "ADMIN";
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ArticleCreateRequest {
  articleNom: string;
  articleModele: string;
  articleDescription?: string;
}

export interface WarrantyCreateRequest {
  garantieArticleId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieImage?: string;
}

// API Response wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  issues?: Array<{
    path: (string | number)[];
    message: string;
    code: string;
  }>;
}

// UI State types
export interface LoadingState {
  loading: boolean;
  error: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
