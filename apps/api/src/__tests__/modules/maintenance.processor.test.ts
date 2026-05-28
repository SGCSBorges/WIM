import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

vi.mock("../../modules/audit/audit.service", () => ({
  AuditService: {
    pruneOlderThan: vi.fn().mockResolvedValue({ deleted: 0 }),
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AuditService } from "../../modules/audit/audit.service";
import { MaintenanceProcessor } from "../../jobs/processors/maintenance.processor";
import type { MaintenanceJobPayload } from "../../jobs/queues";

const mockedPrune = AuditService.pruneOlderThan as unknown as ReturnType<
  typeof vi.fn
>;

const job = (data: MaintenanceJobPayload) =>
  ({ id: "j1", data }) as unknown as Job<MaintenanceJobPayload>;

beforeEach(() => vi.clearAllMocks());

describe("MaintenanceProcessor.audit_prune", () => {
  it("prunes audit rows older than retentionDays", async () => {
    mockedPrune.mockResolvedValueOnce({ deleted: 17 });
    await MaintenanceProcessor.handle(
      job({ type: "audit_prune", retentionDays: 90 })
    );
    expect(mockedPrune).toHaveBeenCalledWith(90);
  });

  it("skips silently when retentionDays is invalid", async () => {
    await MaintenanceProcessor.handle(
      job({ type: "audit_prune", retentionDays: 0 })
    );
    await MaintenanceProcessor.handle(
      job({ type: "audit_prune", retentionDays: -3 })
    );
    expect(mockedPrune).not.toHaveBeenCalled();
  });
});
