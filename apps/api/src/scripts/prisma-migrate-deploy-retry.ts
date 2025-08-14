/**
 * prisma-migrate-deploy-retry
 *
 * Render (and other CI) can occasionally hit transient Postgres advisory-lock timeouts (P1002)
 * during `prisma migrate deploy`.
 *
 * This script retries `prisma migrate deploy` a few times with a short backoff.
 * It intentionally does NOT swallow persistent failures.
 */

import { spawn } from "child_process";

type RunResult = { code: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPrismaMigrateDeploy(): Promise<RunResult> {
  return new Promise((resolve) => {
    // Use the local Prisma CLI binary to avoid npx quirks and platform-specific spawn issues.
    // On Windows, this resolves to node_modules/.bin/prisma.cmd.
    const prismaBin = process.platform === "win32" ? "prisma.cmd" : "prisma";

    const child = spawn(prismaBin, ["migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
      shell: true,
    });

    child.on("close", (code) => resolve({ code: code ?? 1 }));
  });
}

function getArg(name: string, def: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((a) => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : def;
}

async function main() {
  const maxAttempts = Number(
    getArg("attempts", process.env.MIGRATE_ATTEMPTS ?? "10")
  );
  const baseDelayMs = Number(
    getArg("delayMs", process.env.MIGRATE_RETRY_DELAY_MS ?? "5000")
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const backoff = baseDelayMs * attempt;
      console.log(
        `[migrate] Retry attempt ${attempt}/${maxAttempts} (waiting ${backoff}ms before retry)…`
      );
      await sleep(backoff);
    }

    const { code } = await runPrismaMigrateDeploy();
    if (code === 0) return;

    // Keep retrying; Prisma will already have printed the P1002 details.
    if (attempt === maxAttempts) {
      process.exit(code);
    }
  }
}

main().catch((err) => {
  console.error("[migrate] Unexpected error:", err);
  process.exit(1);
});
