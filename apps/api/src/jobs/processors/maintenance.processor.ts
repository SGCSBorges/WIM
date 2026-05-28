import type { Job } from "bullmq";
import { logger } from "../../config/logger";
import { AuditService } from "../../modules/audit/audit.service";
import type { MaintenanceJobPayload } from "../queues";

export const MaintenanceProcessor = {
  async handle(job: Job<MaintenanceJobPayload>) {
    const data = job.data;
    if (data.type === "audit_prune") {
      const { retentionDays } = data;
      if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        logger.info(
          { retentionDays },
          "[maintenance] audit prune skipped (invalid retentionDays)"
        );
        return;
      }
      logger.info({ retentionDays }, "[maintenance] audit prune starting");
      const t0 = Date.now();
      const { deleted } = await AuditService.pruneOlderThan(retentionDays);
      logger.info(
        { deleted, elapsedMs: Date.now() - t0, retentionDays },
        "[maintenance] audit prune done"
      );
      return;
    }
  },
};
