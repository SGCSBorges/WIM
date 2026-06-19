import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  billingAPI: {
    createPowerUserCheckoutSession: vi.fn(),
  },
}));

import UpgradeTeaser from "../../components/common/UpgradeTeaser";
import { UpgradeProvider } from "../../features/upgrade";
import { I18nProvider } from "../../i18n/i18n";
import { billingAPI } from "../../services/api";

const checkout =
  billingAPI.createPowerUserCheckoutSession as unknown as ReturnType<
    typeof vi.fn
  >;

function renderTeaser(feature: "reports" | "sharing" | "transfers") {
  return render(
    <I18nProvider>
      <UpgradeProvider>
        <UpgradeTeaser feature={feature} />
      </UpgradeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<UpgradeTeaser />", () => {
  it("names the locked feature and lists what Power User unlocks", () => {
    renderTeaser("reports");
    // The feature's nav label is the heading.
    expect(
      screen.getByRole("heading", { name: /reports/i })
    ).toBeInTheDocument();
    // At least one benefit line is shown.
    expect(screen.getByText(/insurance-ready/i)).toBeInTheDocument();
  });

  it("starts monthly checkout when the monthly plan is chosen", async () => {
    checkout.mockResolvedValueOnce({ url: "https://checkout.stripe.com/x" });
    const user = userEvent.setup();
    renderTeaser("reports");

    await user.click(screen.getByRole("button", { name: /2\.99\/mo/i }));
    await waitFor(() =>
      expect(checkout).toHaveBeenCalledWith("monthly", expect.anything())
    );
  });

  it("surfaces a checkout error inline instead of throwing", async () => {
    checkout.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderTeaser("sharing");

    await user.click(screen.getByRole("button", { name: /29\/yr/i }));
    await waitFor(() =>
      expect(checkout).toHaveBeenCalledWith("yearly", expect.anything())
    );
    // The error region uses role="alert".
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
