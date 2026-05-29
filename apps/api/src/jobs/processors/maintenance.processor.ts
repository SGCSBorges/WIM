import type { Job } from "bullmq";
import { logger } from "../../config/logger";
import { AuditService } from "../../modules/audit/audit.service";
import { ArticleService } from "../../modules/articles/article.service";
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
    if (data.type === "article_trash_purge") {
      const { retentionDays } = data;
      if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        logger.info(
          { retentionDays },
          "[maintenance] article trash purge skipped (invalid retentionDays)"
        );
        return;
      }
      logger.info(
        { retentionDays },
        "[maintenance] article trash purge starting"
      );
      const t0 = Date.now();
      const { deleted } =
        await ArticleService.purgeTrashOlderThan(retentionDays);
      logger.info(
        { deleted, elapsedMs: Date.now() - t0, retentionDays },
        "[maintenance] article trash purge done"
      );
      return;
    }
  },
};
