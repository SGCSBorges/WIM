// Prune AuditLog rows older than the given retention window.
//
// Usage: npm --workspace apps/api run prune:audit -- 180
// (default retention: 180 days)
//
// Intended to be invoked from a cron job or the operator's shell. The
// service-layer helper does the chunking; this script is a thin wrapper
// that handles arg parsing and exit codes.

import "dotenv/config";
import { AuditService } from "../modules/audit/audit.service";
import { logger } from "../config/logger";
import { prisma } from "../libs/prisma";

const DEFAULT_DAYS = 180;

async function main() {
  const arg = process.argv[2];
  const days = arg ? Number(arg) : DEFAULT_DAYS;
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`Usage: prune:audit [DAYS] — got ${arg}`);
    process.exit(2);
  }

  logger.info({ days }, "[prune:audit] starting");
  const t0 = Date.now();
  const { deleted } = await AuditService.pruneOlderThan(days);
  const elapsedMs = Date.now() - t0;
  logger.info({ deleted, elapsedMs }, "[prune:audit] done");
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, "[prune:audit] failed");
  process.exit(1);
});
