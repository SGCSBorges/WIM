/**
 * Insurance policy tracking — providers, premiums, coverage limits, and which
 * articles each policy covers (many-to-many). An optional renewal date spawns a
 * CUSTOM reminder via the existing alert engine, rescheduled on edit and
 * cancelled on delete. Alert wiring is best-effort: a Redis hiccup must never
 * fail the policy write (mirrors the Loan/PushService pattern).
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";
import { AlertService } from "../alerts/alert.service";
import type { PolicyCreateInput, PolicyUpdateInput } from "./insurance.schemas";

const articleSelect = {
  articleId: true,
  articleNom: true,
  articleModele: true,
  productImageUrl: true,
} as const;

const policyInclude = {
  articles: { include: { article: { select: articleSelect } } },
} as const;

type PolicyRow = {
  policyId: number;
  articles: { article: Record<string, unknown> }[];
} & Record<string, unknown>;

// Flatten the join rows into a plain article array for the client.
function shape(policy: PolicyRow) {
  const { articles, ...rest } = policy;
  return { ...rest, articles: articles.map((a) => a.article) };
}

async function assertPolicyOwned(policyId: number, ownerUserId: number) {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { policyId, ownerUserId },
  });
  if (!policy) throw createHttpError(404, "Policy not found");
  return policy;
}

async function assertArticleOwned(articleId: number, ownerUserId: number) {
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    select: { articleId: true },
  });
  if (!article) throw createHttpError(404, "Article not found");
}

// Best-effort renewal reminder; failures are logged, never thrown.
async function scheduleReminder(
  ownerUserId: number,
  provider: string,
  renewalAt: Date
): Promise<number | null> {
  try {
    const alert = await AlertService.createCustom({
      ownerUserId,
      alerteNom: `Insurance renewal: ${provider}`,
      alerteDate: renewalAt,
    });
    return alert.alerteId;
  } catch (err) {
    logger.warn({ err }, "[insurance] reminder schedule failed");
    return null;
  }
}

export const InsuranceService = {
  async list(ownerUserId: number) {
    const policies = await prisma.insurancePolicy.findMany({
      where: { ownerUserId },
      orderBy: [{ renewalAt: "asc" }, { createdAt: "desc" }],
      include: policyInclude,
    });
    return policies.map((p) => shape(p as PolicyRow));
  },

  async listForArticle(ownerUserId: number, articleId: number) {
    await assertArticleOwned(articleId, ownerUserId);
    const policies = await prisma.insurancePolicy.findMany({
      where: { ownerUserId, articles: { some: { articleId } } },
      orderBy: [{ renewalAt: "asc" }, { createdAt: "desc" }],
      include: policyInclude,
    });
    return policies.map((p) => shape(p as PolicyRow));
  },

  async create(ownerUserId: number, data: PolicyCreateInput) {
    const reminderAlerteId = data.renewalAt
      ? await scheduleReminder(ownerUserId, data.provider, data.renewalAt)
      : null;

    const policy = await prisma.insurancePolicy.create({
      data: {
        ownerUserId,
        provider: data.provider,
        policyNumber: data.policyNumber ?? null,
        premium: data.premium ?? null,
        coverageAmount: data.coverageAmount ?? null,
        renewalAt: data.renewalAt ?? null,
        note: data.note ?? null,
        reminderAlerteId,
      },
      include: policyInclude,
    });
    return shape(policy as PolicyRow);
  },

  async update(policyId: number, ownerUserId: number, data: PolicyUpdateInput) {
    const existing = await assertPolicyOwned(policyId, ownerUserId);

    // Reschedule the reminder only when the renewal date is part of the patch.
    let reminderAlerteId = existing.reminderAlerteId;
    if ("renewalAt" in data) {
      if (existing.reminderAlerteId)
        await AlertService.cancel(existing.reminderAlerteId, ownerUserId).catch(
          () => undefined
        );
      reminderAlerteId = data.renewalAt
        ? await scheduleReminder(
            ownerUserId,
            data.provider ?? existing.provider,
            data.renewalAt
          )
        : null;
    }

    const policy = await prisma.insurancePolicy.update({
      where: { policyId },
      data: {
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...("policyNumber" in data
          ? { policyNumber: data.policyNumber ?? null }
          : {}),
        ...("premium" in data ? { premium: data.premium ?? null } : {}),
        ...("coverageAmount" in data
          ? { coverageAmount: data.coverageAmount ?? null }
          : {}),
        ...("renewalAt" in data
          ? { renewalAt: data.renewalAt ?? null, reminderAlerteId }
          : {}),
        ...("note" in data ? { note: data.note ?? null } : {}),
      },
      include: policyInclude,
    });
    return shape(policy as PolicyRow);
  },

  async remove(policyId: number, ownerUserId: number) {
    const policy = await assertPolicyOwned(policyId, ownerUserId);
    if (policy.reminderAlerteId)
      await AlertService.cancel(policy.reminderAlerteId, ownerUserId).catch(
        () => undefined
      );
    await prisma.insurancePolicy.delete({ where: { policyId } });
  },

  async linkArticle(policyId: number, ownerUserId: number, articleId: number) {
    await assertPolicyOwned(policyId, ownerUserId);
    await assertArticleOwned(articleId, ownerUserId);
    // Idempotent: re-linking an already-covered item is a no-op.
    await prisma.articleInsurance.upsert({
      where: { articleId_policyId: { articleId, policyId } },
      create: { articleId, policyId },
      update: {},
    });
  },

  async unlinkArticle(
    policyId: number,
    ownerUserId: number,
    articleId: number
  ) {
    await assertPolicyOwned(policyId, ownerUserId);
    await prisma.articleInsurance.deleteMany({
      where: { policyId, articleId },
    });
  },
};
