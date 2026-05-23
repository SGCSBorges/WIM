import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  profileAPI: {
    getMe: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
    deleteAccount: vi.fn(),
  },
  billingAPI: {
    getBillingMe: vi.fn(),
    openPortal: vi.fn(),
    cancelAtPeriodEnd: vi.fn(),
  },
  articlesAPI: { getAll: vi.fn(), getMySharedPublic: vi.fn() },
  warrantiesAPI: { getAll: vi.fn() },
  attachmentsAPI: { getAll: vi.fn() },
  sharesAPI: { getOwned: vi.fn(), getSentInvites: vi.fn() },
}));

import ProfileView from "../../components/profile/ProfileView";
import { profileAPI, billingAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mockedProfile = profileAPI as unknown as {
  getMe: ReturnType<typeof vi.fn>;
  updateEmail: ReturnType<typeof vi.fn>;
  deleteAccount: ReturnType<typeof vi.fn>;
};
const mockedBilling = billingAPI as unknown as {
  getBillingMe: ReturnType<typeof vi.fn>;
};

function renderProfile() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <ProfileView />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedProfile.getMe.mockResolvedValue({
    userId: 1,
    email: "user@example.com",
    role: "USER",
  });
  mockedBilling.getBillingMe.mockResolvedValue({ subscription: null });
});

describe("<ProfileView />", () => {
  it("renders the signed-in email after load", async () => {
    renderProfile();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it("calls updateEmail with the new address and current password", async () => {
    mockedProfile.updateEmail.mockResolvedValueOnce({
      userId: 1,
      email: "new@example.com",
      role: "USER",
    });
    renderProfile();
    await screen.findByText("user@example.com");

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText(/new email address/i);
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    // "Current password" appears in both the email and password sections;
    // the email section is the first.
    const currentPw = screen.getAllByLabelText(/current password/i)[0];
    await user.type(currentPw, "secret123");

    await user.click(screen.getByRole("button", { name: /update email/i }));

    await waitFor(() => {
      expect(mockedProfile.updateEmail).toHaveBeenCalledWith(
        "new@example.com",
        "secret123"
      );
    });
  });

  it("gates account deletion behind a confirm step", async () => {
    renderProfile();
    await screen.findByText("user@example.com");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /delete my account/i })
    );

    // The first click only reveals the confirm UI — no API call yet.
    expect(mockedProfile.deleteAccount).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/irreversible|permanently deleted/i)
    ).toBeInTheDocument();
  });
});
