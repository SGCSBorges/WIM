const REQUIRED_VARS = ["JWT_SECRET", "DATABASE_URL"] as const;

// Stripe vars are required in production; warn only in dev so local testing still works.
const STRIPE_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

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
  }
}
