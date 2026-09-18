/**
 * Allowlist guard for the redirect URLs the billing endpoints hand back.
 *
 * `startCheckout` / the portal call both end in `window.location.href = url`
 * with a URL the API returned, so the check in front of that assignment is a
 * real security control: it is what stops a compromised or misconfigured
 * billing response from turning into an open redirect. It lives here — in one
 * place — because three call sites used to carry byte-identical private copies
 * and a control that exists in triplicate is a control that drifts.
 *
 * Exact hostname match, never `endsWith`: `checkout.stripe.com.evil.test`
 * would pass a suffix test.
 */
const STRIPE_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);

export function isStripeUrl(url: string): boolean {
  try {
    return STRIPE_HOSTS.has(new URL(url).hostname);
  } catch {
    // Not a parseable absolute URL — never redirect to it.
    return false;
  }
}
