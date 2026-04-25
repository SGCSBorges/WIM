const REQUIRED_VARS = ["JWT_SECRET", "DATABASE_URL"] as const;

// Stripe vars are required in production; warn only in dev so local testing still works.
const STRIPE_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

// These vars are not hard-required at boot but will cause runtime failures in
// production if missing. Log a warning rather than exiting so a partial deploy
// can still start and serve non-billing traffic.
const PRODUCTION_WARN_VARS: Array<[string, string]> = [
  ["APP_URL", "Stripe checkout redirect URLs will fail"],
  ["REDIS_URL", "Alert reminder jobs may not queue (Redis fallback to localhost)"],
  ["CORS_ORIGIN", "All cross-origin requests will be blocked by CORS"],
];

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
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
        console.warn(`[startup] WARNING: ${varName} is not set — ${consequence}`);
      }
    }
  }
}
