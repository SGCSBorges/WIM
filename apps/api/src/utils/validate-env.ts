const REQUIRED_VARS = ["JWT_SECRET", "DATABASE_URL"] as const;

// Stripe vars are required in production; warn only in dev so local testing still works.
const STRIPE_VARS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

// These vars are not hard-required at boot but will cause runtime failures in
// production if missing. Log a warning rather than exiting so a partial deploy
// can still start and serve non-billing traffic.
const PRODUCTION_WARN_VARS: Array<[string, string]> = [
  ["APP_URL", "Stripe checkout redirect URLs will fail"],
  [
    "REDIS_URL",
    "Alert reminder jobs may not queue (Redis fallback to localhost)",
  ],
  ["CORS_ORIGIN", "All cross-origin requests will be blocked by CORS"],
  ["VAPID_PUBLIC_KEY", "Web push delivery disabled"],
  ["VAPID_PRIVATE_KEY", "Web push delivery disabled"],
  ["RESEND_API_KEY", "Email reminders + weekly digest disabled"],
  ["MAIL_FROM", "Email reminders + weekly digest disabled"],
];

// Numeric env vars where a typo like `RATE_LIMIT_MAX=abc` would silently
// become NaN and let express-rate-limit run with no effective cap. We warn
// rather than exit because the fallback default kicks in inside each
// consumer module; the visibility is what matters.
const NUMERIC_ENV_VARS = [
  "PORT",
  "RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX",
  "AUTH_RATE_LIMIT_MAX",
  "CREATE_RATE_LIMIT_MAX",
  "STRIPE_WEBHOOK_MAX_AGE_SEC",
  "AUDIT_RETENTION_DAYS",
  "ARTICLE_TRASH_RETENTION_DAYS",
] as const;

function isValidPort(raw: string): boolean {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  // Validate every SET numeric env. An unset value falls back to its
  // consumer's default; a present value must parse to a finite number (and
  // PORT must be a valid integer in [1, 65535]).
  for (const name of NUMERIC_ENV_VARS) {
    const raw = process.env[name];
    if (raw === undefined || raw === "") continue;
    if (name === "PORT") {
      if (!isValidPort(raw)) {
        console.warn(
          `[startup] WARNING: ${name}="${raw}" is not a valid port (1-65535); falling back to default`
        );
      }
      continue;
    }
    if (!Number.isFinite(Number(raw))) {
      console.warn(
        `[startup] WARNING: ${name}="${raw}" is not a number; falling back to default`
      );
    }
  }

  if (process.env.NODE_ENV === "production") {
    const missingStripe = STRIPE_VARS.filter((v) => !process.env[v]);
    if (missingStripe.length > 0) {
      console.error(
        `[startup] Missing Stripe environment variables in production: ${missingStripe.join(", ")}`
      );
      process.exit(1);
    }

    for (const [varName, consequence] of PRODUCTION_WARN_VARS) {
      if (!process.env[varName]) {
        console.warn(
          `[startup] WARNING: ${varName} is not set — ${consequence}`
        );
      }
    }
  }
}
