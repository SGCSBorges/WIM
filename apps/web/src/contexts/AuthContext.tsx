import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, LoginRequest, RegisterRequest } from "../types";
import apiClient from "../services/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("wim_token");
      const storedUser = localStorage.getItem("wim_user");

      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));

          // Verify token is still valid by fetching profile
          const profile = await apiClient.getProfile();
          setUser(profile);
          localStorage.setItem("wim_user", JSON.stringify(profile));
        } catch (error) {
          console.error("Token validation failed:", error);
          // Clear invalid token
          localStorage.removeItem("wim_token");
          localStorage.removeItem("wim_user");
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await apiClient.login(credentials);

      setUser(response.user);
      setToken(response.token);

      // Store in localStorage
      localStorage.setItem("wim_token", response.token);
      localStorage.setItem("wim_user", JSON.stringify(response.user));
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const register = async (userData: RegisterRequest) => {
    try {
      const response = await apiClient.register(userData);

      setUser(response.user);
      setToken(response.token);

      // Store in localStorage
      localStorage.setItem("wim_token", response.token);
      localStorage.setItem("wim_user", JSON.stringify(response.user));
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("wim_token");
    localStorage.removeItem("wim_user");
  };

  const refreshProfile = async () => {
    try {
      const profile = await apiClient.getProfile();
      setUser(profile);
      localStorage.setItem("wim_user", JSON.stringify(profile));
    } catch (error) {
      console.error("Profile refresh failed:", error);
      logout();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    register,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
