import React, { useState } from "react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { useTheme } from "../../theme/theme";

interface LoginFormProps {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "USER" as "USER" | "POWER_USER" | "ADMIN",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await authAPI.login(formData.email, formData.password);
        onLogin();
      } else {
        await authAPI.register(
          formData.email,
          formData.password,
          formData.role,
        );
        // After successful registration, try to login
        await authAPI.login(formData.email, formData.password);
        onLogin();
      }
    } catch (err: any) {
      setError(err.message || t("auth.error.default"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full ui-card rounded-lg shadow p-8">
        <div className="flex items-center justify-end gap-3 mb-4">
          <label className="text-xs ui-text-muted">{t("nav.language")}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="ui-select px-2 py-1 rounded-md text-sm"
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="pt">Português</option>
          </select>

          <label className="text-xs ui-text-muted">{t("nav.theme")}</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="ui-select px-2 py-1 rounded-md text-sm"
          >
            <option value="light">{t("theme.light")}</option>
            <option value="dark">{t("theme.dark")}</option>
            <option value="ocean">{t("theme.ocean")}</option>
          </select>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">WIM</h1>
          <p className="ui-text-muted">{t("auth.subtitle")}</p>
        </div>

        <div className="mb-4">
          <div className="flex rounded-lg ui-divider p-1">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                isLogin ? "ui-btn-primary" : "ui-btn-ghost"
              }`}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                !isLogin ? "ui-btn-primary" : "ui-btn-ghost"
              }`}
            >
              {t("auth.register")}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {t("auth.email")}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full ui-input px-3 py-2 rounded-md shadow-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
            >
              {t("auth.password")}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full ui-input px-3 py-2 rounded-md shadow-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="px-4 py-3 rounded-md text-sm border ui-divider"
              style={{ color: "var(--danger, #dc2626)" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
              loading ? "opacity-70 cursor-not-allowed" : ""
            } ui-btn-primary`}
          >
            {loading
              ? t("auth.loading")
              : isLogin
                ? t("auth.login")
                : t("auth.register")}
          </button>
        </form>
      </div>
    </div>
  );
}
