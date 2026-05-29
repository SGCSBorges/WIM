import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async () => undefined),
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    processedStripeEvent: { create: vi.fn() },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Stripe so signature verification accepts any payload and we control
// the synthesized event object directly via the request body JSON.
vi.mock("stripe", () => {
  const Stripe = vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (raw: Buffer) =>
        JSON.parse(raw.toString("utf8")) as unknown,
    },
  }));
  return { default: Stripe };
});

import webhookRouter from "../../modules/billing/billing.webhook.routes";

function makeApp() {
  const app = express();
  app.use("/billing", webhookRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.STRIPE_WEBHOOK_MAX_AGE_SEC;
});

describe("Stripe webhook hardening", () => {
  it("drops a stale event (older than the configured window) with 200", async () => {
    const oldEvent = {
      id: "evt_old",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) - 60 * 60, // 1 hour old
      data: { object: {} },
    };
    const res = await request(makeApp())
      .post("/billing/webhook")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(oldEvent));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stale: true });
  });

  it("acks unhandled event types without entering the processing transaction", async () => {
    const unhandled = {
      id: "evt_unhandled",
      type: "invoice.payment_succeeded",
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    };
    const { prisma } = await import("../../libs/prisma");
    const res = await request(makeApp())
      .post("/billing/webhook")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(unhandled));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unhandled: true });
    expect(
      (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> })
        .$transaction
    ).not.toHaveBeenCalled();
  });
});
