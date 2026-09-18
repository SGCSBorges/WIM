import { describe, it, expect } from "vitest";
import { isStripeUrl } from "../../utils/stripeUrl";

describe("isStripeUrl", () => {
  it("accepts the two Stripe redirect hosts", () => {
    expect(isStripeUrl("https://checkout.stripe.com/c/pay/cs_test_123")).toBe(
      true
    );
    expect(isStripeUrl("https://billing.stripe.com/p/session/abc")).toBe(true);
  });

  it("rejects look-alike hosts that a suffix match would let through", () => {
    expect(isStripeUrl("https://checkout.stripe.com.evil.test/x")).toBe(false);
    expect(isStripeUrl("https://evil.test/checkout.stripe.com")).toBe(false);
    expect(isStripeUrl("https://notcheckout.stripe.com/x")).toBe(false);
  });

  it("rejects other stripe.com subdomains", () => {
    expect(isStripeUrl("https://dashboard.stripe.com/x")).toBe(false);
    expect(isStripeUrl("https://stripe.com/x")).toBe(false);
  });

  it("rejects non-http schemes and unparseable input", () => {
    expect(isStripeUrl("javascript:alert(1)")).toBe(false);
    expect(isStripeUrl("/relative/path")).toBe(false);
    expect(isStripeUrl("")).toBe(false);
  });
});
