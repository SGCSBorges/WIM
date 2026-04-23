const REQUIRED_VARS = ["JWT_SECRET", "DATABASE_URL"] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }
}
