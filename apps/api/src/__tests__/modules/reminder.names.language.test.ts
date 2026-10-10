import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn(), update: vi.fn() },
    loan: { create: vi.fn(), update: vi.fn() },
    serviceRecord: { create: vi.fn(), update: vi.fn() },
    insurancePolicy: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    createCustom: vi.fn().mockResolvedValue({ alerteId: 77 }),
    cancel: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { LoanService } from "../../modules/loans/loan.service";
import { ServiceRecordService } from "../../modules/service-records/service-record.service";
import { InsuranceService } from "../../modules/insurance/insurance.service";

const db = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  loan: Record<string, ReturnType<typeof vi.fn>>;
  serviceRecord: Record<string, ReturnType<typeof vi.fn>>;
  insurancePolicy: Record<string, ReturnType<typeof vi.fn>>;
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const createCustom = AlertService.createCustom as unknown as ReturnType<
  typeof vi.fn
>;

const nameWritten = () =>
  (createCustom.mock.calls[0][0] as { alerteNom: string }).alerteNom;

beforeEach(() => {
  vi.clearAllMocks();
  createCustom.mockResolvedValue({ alerteId: 77 });
  db.article.findFirst.mockResolvedValue({
    articleId: 9,
    articleNom: "Perceuse",
  });
  db.article.update.mockResolvedValue({});
  db.loan.create.mockResolvedValue({ loanId: 1, reminderAlerteId: null });
  db.loan.update.mockResolvedValue({});
  db.serviceRecord.create.mockResolvedValue({
    serviceId: 2,
    reminderAlerteId: null,
  });
  db.serviceRecord.update.mockResolvedValue({});
  db.insurancePolicy.create.mockResolvedValue({
    policyId: 3,
    provider: "MAIF",
    articles: [],
  });
});

const lend = () =>
  LoanService.create(1, {
    articleId: 9,
    borrowerName: "Julien",
    dueAt: new Date("2026-12-01T00:00:00Z"),
  } as never);

const service = () =>
  ServiceRecordService.create(1, {
    articleId: 9,
    performedAt: new Date("2026-01-10T00:00:00Z"),
    description: "Charbons remplacés",
    intervalMonths: 12,
  } as never);

describe("server-written reminder names follow the owner's language", () => {
  it("names a loan reminder in French for a French owner", async () => {
    db.user.findUnique.mockResolvedValue({ language: "fr" });
    await lend();
    expect(nameWritten()).toBe("Retour de prêt : Perceuse (Julien)");
  });

  it("names a service reminder in French for a French owner", async () => {
    db.user.findUnique.mockResolvedValue({ language: "fr" });
    await service();
    expect(nameWritten()).toBe("Entretien à prévoir : Perceuse");
  });

  it("names an insurance renewal reminder in French for a French owner", async () => {
    db.user.findUnique.mockResolvedValue({ language: "fr" });
    await InsuranceService.create(1, {
      provider: "MAIF",
      renewalAt: new Date("2027-03-01T00:00:00Z"),
    } as never);
    expect(nameWritten()).toBe("Renouvellement d'assurance : MAIF");
  });

  it("keeps English for an English-speaking owner", async () => {
    db.user.findUnique.mockResolvedValue({ language: "en" });
    await lend();
    expect(nameWritten()).toBe("Loan due: Perceuse (Julien)");
  });

  it("uses the default language when the owner has none or the read fails", async () => {
    db.user.findUnique.mockResolvedValue({ language: null });
    await service();
    expect(nameWritten()).toBe("Entretien à prévoir : Perceuse");

    createCustom.mockClear();
    db.user.findUnique.mockRejectedValue(new Error("db down"));
    await lend();
    // The reminder is still created — a failed language read never costs it.
    expect(nameWritten()).toBe("Retour de prêt : Perceuse (Julien)");
  });
});
