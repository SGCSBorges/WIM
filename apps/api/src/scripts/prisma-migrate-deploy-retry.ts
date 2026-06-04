/**
 * prisma-migrate-deploy-retry
 *
 * Handles two failure modes for `prisma migrate deploy`:
 *
 *  P1002 — transient advisory-lock timeout (Render cold-start race).
 *           Retry with exponential backoff; Prisma prints details.
 *
 *  P3009 — a previous migration attempt left a "failed" row in
 *           _prisma_migrations (e.g. the deploy container died mid-apply).
 *           Prisma refuses to continue until each failed migration is
 *           explicitly resolved. When detected, this script runs
 *           `prisma migrate resolve --rolled-back <name>` for every
 *           migration listed in the P3009 error, then retries.
 */

import { spawn, spawnSync } from "child_process";

type RunResult = { code: number; output: string };

const PRISMA_BIN = process.platform === "win32" ? "prisma.cmd" : "prisma";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPrismaMigrateDeploy(): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = "";

    const child = spawn(PRISMA_BIN, ["migrate", "deploy"], {
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
      shell: true,
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      output += text;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);
      output += text;
    });

    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

// P3009 error lines look like:
//   The `20260604000000_add_article_transfer` migration started at … failed
function resolveFailedMigrations(output: string) {
  const pattern = /The `([^`]+)` migration started at .+ failed/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    const name = match[1];
    console.log(`[migrate] Resolving failed migration as rolled-back: ${name}`);
    const result = spawnSync(
      PRISMA_BIN,
      ["migrate", "resolve", "--rolled-back", name],
      { stdio: "inherit", env: process.env, shell: true }
    );
    if (result.status !== 0) {
      console.error(
        `[migrate] Failed to resolve ${name} (exit ${result.status ?? "?"})`
      );
    }
  }
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

    const { code, output } = await runPrismaMigrateDeploy();
    if (code === 0) return;

    // P3009: failed migration blocking deploy — resolve then retry immediately
    if (output.includes("P3009")) {
      resolveFailedMigrations(output);
      continue;
    }

    if (attempt === maxAttempts) {
      process.exit(code);
    }
  }
}

main().catch((err) => {
  console.error("[migrate] Unexpected error:", err);
  process.exit(1);
});
