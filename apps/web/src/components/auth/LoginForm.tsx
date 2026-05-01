import React, { useState } from "react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import LanguageThemeSelector from "../common/LanguageThemeSelector";

interface LoginFormProps {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setPasswordError(null);

    let valid = true;
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setEmailError(t("auth.error.emailInvalid"));
      valid = false;
    }
    if (!formData.password || formData.password.length < 8) {
      setPasswordError(t("auth.error.passwordTooShort"));
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      if (isLogin) {
        await authAPI.login(formData.email, formData.password);
        onLogin();
      } else {
        await authAPI.register(formData.email, formData.password);
        await authAPI.login(formData.email, formData.password);
        onLogin();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.error.default"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (e.target.name === "email") setEmailError(null);
    if (e.target.name === "password") setPasswordError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full ui-card rounded-lg shadow p-8">
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
              className={`w-full ui-input px-3 py-2 rounded-md shadow-sm ${emailError ? "border-red-400" : ""}`}
              placeholder="your@email.com"
              aria-describedby={emailError ? "email-error" : undefined}
              aria-invalid={emailError ? "true" : undefined}
            />
            {emailError && (
              <p id="email-error" className="mt-1 text-xs text-red-600">{emailError}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              {t("auth.password")}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={`w-full ui-input px-3 py-2 rounded-md shadow-sm ${passwordError ? "border-red-400" : ""}`}
              placeholder="••••••••"
              aria-describedby={passwordError ? "password-error" : undefined}
              aria-invalid={passwordError ? "true" : undefined}
            />
            {passwordError && (
              <p id="password-error" className="mt-1 text-xs text-red-600">{passwordError}</p>
            )}
          </div>

          {error && (
            <div role="alert" className="px-4 py-3 rounded-md text-sm border ui-alert-error text-red-700">
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

        <div className="mt-6 pt-4 border-t ui-divider flex justify-center">
          <LanguageThemeSelector />
        </div>
      </div>
    </div>
  );
}
