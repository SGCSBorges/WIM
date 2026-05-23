import { useCallback, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import InstallPwaButton from "../common/InstallPwaButton";
import { useApiForm } from "../../hooks/useApiForm";

interface LoginFormProps {
  onLogin: () => void;
}

// Validation lives in a Zod schema so the rules are visible at a glance and
// can be reused by future API DTOs through @wim/types.
const credentialsSchema = z.object({
  email: z.string().email({ message: "auth.error.emailInvalid" }),
  password: z.string().min(8, { message: "auth.error.passwordTooShort" }),
});

type CredentialsInput = z.infer<typeof credentialsSchema>;

export default function LoginForm({ onLogin }: LoginFormProps) {
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);

  const {
    register,
    handleApiSubmit,
    formState: { errors, isSubmitting },
    submissionError,
    clearSubmissionError,
  } = useApiForm<CredentialsInput>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
    defaultErrorMessage: t("auth.error.default"),
  });

  const onSubmit = useCallback(
    async ({ email, password }: CredentialsInput) => {
      if (isLogin) {
        await authAPI.login(email, password);
      } else {
        await authAPI.register(email, password);
        await authAPI.login(email, password);
      }
      onLogin();
    },
    [isLogin, onLogin]
  );

  const switchTab = (next: boolean) => {
    setIsLogin(next);
    clearSubmissionError();
  };

  // Temporary one-shot helper to promote admin@admin.com to ADMIN.
  // Remove this button (and the matching API endpoint) once the seed admin
  // account exists. The endpoint refuses to run after the first admin is
  // created, so leaving this in is bounded — but please clean it up.
  const [testAdminMsg, setTestAdminMsg] = useState<string | null>(null);
  const [testAdminBusy, setTestAdminBusy] = useState(false);
  const runTestAdmin = async () => {
    setTestAdminMsg(null);
    setTestAdminBusy(true);
    try {
      const res = await authAPI.bootstrapAdmin();
      setTestAdminMsg(
        t("auth.bootstrap.success")
          .replace("{email}", res.email)
          .replace("{role}", res.role)
      );
    } catch (e) {
      setTestAdminMsg(e instanceof Error ? e.message : "Bootstrap failed");
    } finally {
      setTestAdminBusy(false);
    }
  };

  // Zod resolver returns the message string we put in the schema; for i18n we
  // store the translation key there and translate at render time.
  const fieldError = (key?: string) => (key ? t(key as never) : undefined);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full ui-card rounded-lg shadow p-8">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="WIM — Warranty & Inventory Manager"
            className="mx-auto h-16 w-auto mb-3"
          />
          <p className="ui-text-muted">{t("auth.subtitle")}</p>
        </div>

        <div className="mb-4">
          <div className="flex rounded-lg ui-divider p-1">
            <button
              type="button"
              onClick={() => switchTab(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                isLogin ? "ui-btn-primary" : "ui-btn-ghost"
              }`}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              onClick={() => switchTab(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                !isLogin ? "ui-btn-primary" : "ui-btn-ghost"
              }`}
            >
              {t("auth.register")}
            </button>
          </div>
        </div>

        <form
          onSubmit={handleApiSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className={`w-full ui-input px-3 py-2 rounded-md shadow-sm ${
                errors.email ? "border-red-400" : ""
              }`}
              placeholder="your@email.com"
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={errors.email ? "true" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs ui-text-error">
                {fieldError(errors.email.message)}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
            >
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className={`w-full ui-input px-3 py-2 rounded-md shadow-sm ${
                errors.password ? "border-red-400" : ""
              }`}
              placeholder="••••••••"
              aria-describedby={errors.password ? "password-error" : undefined}
              aria-invalid={errors.password ? "true" : undefined}
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs ui-text-error">
                {fieldError(errors.password.message)}
              </p>
            )}
          </div>

          {submissionError && (
            <div
              role="alert"
              className="px-4 py-3 rounded-md text-sm border ui-alert-error ui-text-error"
            >
              {submissionError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
              isSubmitting ? "opacity-70 cursor-not-allowed" : ""
            } ui-btn-primary`}
          >
            {isSubmitting
              ? t("auth.loading")
              : isLogin
                ? t("auth.login")
                : t("auth.register")}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t ui-divider flex flex-col items-center gap-3">
          <InstallPwaButton />
          <LanguageThemeSelector />

          {/* TEMPORARY: bootstrap admin@admin.com to ADMIN. Remove once done. */}
          <div className="w-full text-center">
            <button
              type="button"
              onClick={runTestAdmin}
              disabled={testAdminBusy}
              className={`px-3 py-2 text-sm rounded-md ui-btn-ghost border ${
                testAdminBusy ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {testAdminBusy ? "Working…" : "TestAdmin"}
            </button>
            {testAdminMsg && (
              <p className="mt-2 text-xs ui-text-muted">{testAdminMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
