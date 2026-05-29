import type { Job } from "bullmq";
import { logger } from "../../config/logger";
import { AuditService } from "../../modules/audit/audit.service";
import { ArticleService } from "../../modules/articles/article.service";
import { WarrantyDigestService } from "../../modules/warranties/warranty.digest.service";
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
    if (data.type === "warranty_digest_weekly") {
      logger.info("[maintenance] warranty digest weekly starting");
      const t0 = Date.now();
      const counts = await WarrantyDigestService.sendWeeklyDigests();
      logger.info(
        { ...counts, elapsedMs: Date.now() - t0 },
        "[maintenance] warranty digest weekly done"
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
