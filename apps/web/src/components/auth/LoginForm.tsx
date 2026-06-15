/**
 * Login / Register — the unauthenticated first impression. Split-screen: a
 * brand panel (gradient, value props) on large screens + the credential form.
 * Uses react-hook-form + Zod for validation matching the API's password rules.
 * Includes "Forgot password" + the temporary "TestAdmin" bootstrap entry
 * point (see CLAUDE.md "Open items").
 */
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Package,
  BellRing,
  Search,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import InstallPwaButton from "../common/InstallPwaButton";
import { useApiForm } from "../../hooks/useApiForm";
import { Button, Field, Input } from "../ui";

interface LoginFormProps {
  onLogin: () => void;
}

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

  // When the user has TOTP enabled, the first /auth/login call returns
  // `{ totpRequired, challengeToken }` instead of a session cookie. We stash
  // the challenge token and surface the code prompt; submitting it calls
  // /auth/login/verify-totp to mint the real session.
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);

  const onSubmit = useCallback(
    async ({ email, password }: CredentialsInput) => {
      if (isLogin) {
        const result = await authAPI.login(email, password);
        if ("totpRequired" in result) {
          setChallengeToken(result.challengeToken);
          return;
        }
      } else {
        await authAPI.register(email, password);
        await authAPI.login(email, password);
      }
      onLogin();
    },
    [isLogin, onLogin]
  );

  const submitTotp = async () => {
    if (!challengeToken) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      await authAPI.verifyTotp(challengeToken, totpCode.trim());
      setChallengeToken(null);
      setTotpCode("");
      onLogin();
    } catch (e) {
      setTotpError(e instanceof Error ? e.message : t("auth.error.default"));
    } finally {
      setTotpBusy(false);
    }
  };

  const switchTab = (next: boolean) => {
    setIsLogin(next);
    clearSubmissionError();
  };

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

  // Zod resolver returns the translation key we stored in the schema.
  const fieldError = (key?: string) => (key ? t(key as never) : undefined);

  const features = [
    { icon: Package, label: t("auth.hero.f1") },
    { icon: BellRing, label: t("auth.hero.f2") },
    { icon: Search, label: t("auth.hero.f3") },
  ];

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Brand panel (lg+) */}
      {/* text-white (not text-primary-contrast): the contrast token is
          near-black in dark/ocean/cyber and would vanish on the gradient. */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary bg-gradient-brand p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="text-2xl font-bold tracking-tight">WIM</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            {t("auth.hero.tagline")}
          </h1>
          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-white/90">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-white/70">
          {t("auth.subtitle")}
        </p>

        {/* Decorative glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl"
        />
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-6 text-center lg:hidden">
            <img
              src="/logo.png"
              alt="WIM — Warranty & Inventory Manager"
              className="mx-auto mb-3 h-14 w-auto"
            />
          </div>

          <h2 className="text-2xl font-bold tracking-tight ui-title">
            {isLogin ? t("auth.login") : t("auth.register")}
          </h2>
          <p className="mt-1 mb-6 text-sm ui-text-muted">
            {t("auth.subtitle")}
          </p>

          {/* Mode toggle (tabs) */}
          <div className="mb-5 flex rounded-xl bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => switchTab(true)}
              aria-pressed={isLogin}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isLogin ? "bg-surface text-fg shadow-sm" : "ui-text-muted"
              }`}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              onClick={() => switchTab(false)}
              aria-pressed={!isLogin}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                !isLogin ? "bg-surface text-fg shadow-sm" : "ui-text-muted"
              }`}
            >
              {t("auth.register")}
            </button>
          </div>

          {challengeToken ? (
            // Distinct key from the credential form below: both render a
            // <form> at the same position, so without it React reconciles the
            // two and reuses the first <input> DOM node across the swap —
            // turning the uncontrolled password field into the controlled
            // TOTP-code field (a controlled/uncontrolled warning + potential
            // value bleed). Keying forces a clean unmount/mount.
            <form
              key="totp-challenge"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitTotp();
              }}
            >
              <Field
                label={t("auth.totp.codeLabel")}
                htmlFor="auth-totp-code"
                hint={t("auth.totp.hint")}
              >
                {/* Callback ref focuses on mount: the challenge step replaces
                    the password form the user just submitted, so moving focus
                    to its only input is the expected continuation. */}
                <Input
                  id="auth-totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  ref={(el: HTMLInputElement | null) => el?.focus()}
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                />
              </Field>
              {totpError && (
                <div
                  role="alert"
                  className="rounded-lg border ui-alert-error px-4 py-3 text-sm ui-text-error"
                >
                  {totpError}
                </div>
              )}
              <Button
                fullWidth
                type="submit"
                loading={totpBusy}
                disabled={!totpCode.trim()}
              >
                {t("auth.totp.verify")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setTotpCode("");
                  setTotpError(null);
                }}
                className="block w-full text-center text-sm ui-text-muted hover:ui-title"
              >
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <form
              key="credentials"
              onSubmit={handleApiSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <Field
                label={t("auth.email")}
                error={fieldError(errors.email?.message)}
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="your@email.com"
                  {...register("email")}
                />
              </Field>

              <Field
                label={t("auth.password")}
                error={fieldError(errors.password?.message)}
              >
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    className="pr-10"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 ui-text-muted hover:ui-title"
                    aria-label={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </Field>

              {submissionError && (
                <div
                  role="alert"
                  className="rounded-lg border ui-alert-error px-4 py-3 text-sm ui-text-error"
                >
                  {submissionError}
                </div>
              )}

              <Button type="submit" fullWidth loading={isSubmitting}>
                {isSubmitting
                  ? t("auth.loading")
                  : isLogin
                    ? t("auth.login")
                    : t("auth.register")}
              </Button>

              {isLogin && (
                <div className="text-center text-sm">
                  <Link
                    to="/auth/forgot"
                    className="ui-action-primary hover:underline"
                  >
                    {t("auth.forgot.link")}
                  </Link>
                </div>
              )}
            </form>
          )}

          <div className="mt-8 flex flex-col items-center gap-3 border-t ui-divider pt-6">
            <InstallPwaButton />
            <LanguageThemeSelector />
            {/* TEMPORARY: bootstrap admin@admin.com to ADMIN. Remove once done. */}
            <div className="w-full text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={runTestAdmin}
                loading={testAdminBusy}
                className="border ui-divider"
              >
                TestAdmin
              </Button>
              {testAdminMsg && (
                <p className="mt-2 text-xs ui-text-muted">{testAdminMsg}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
