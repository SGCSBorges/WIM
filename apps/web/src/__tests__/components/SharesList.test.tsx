import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  sharesAPI: {
    getOwned: vi.fn(),
    getSentInvites: vi.fn(),
    createInvite: vi.fn(),
    revoke: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

import SharesList from "../../components/sharing/SharesList";
import { sharesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const mocked = sharesAPI as unknown as {
  getOwned: ReturnType<typeof vi.fn>;
  getSentInvites: ReturnType<typeof vi.fn>;
  createInvite: ReturnType<typeof vi.fn>;
};

function renderList() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <SharesList />
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getOwned.mockResolvedValue([]);
  mocked.getSentInvites.mockResolvedValue([]);
});

async function openInviteForm(user: ReturnType<typeof userEvent.setup>) {
  // Header toggle opens the invite form (English default locale).
  const addBtn = await screen.findByRole("button", { name: "Share Inventory" });
  await user.click(addBtn);
}

describe("<SharesList />", () => {
  it("loads owned shares and sent invites on mount", async () => {
    renderList();
    await waitFor(() => {
      expect(mocked.getOwned).toHaveBeenCalledTimes(1);
      expect(mocked.getSentInvites).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks invite submit on an invalid email", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(mocked.getOwned).toHaveBeenCalled());

    await openInviteForm(user);
    const email = screen.getByPlaceholderText("Enter email address");
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send Invitation" }));

    expect(mocked.createInvite).not.toHaveBeenCalled();
  });

  it("calls createInvite for a valid email", async () => {
    mocked.createInvite.mockResolvedValueOnce({
      shareInviteId: 1,
      email: "x@y.com",
      permission: "READ",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8.64e7).toISOString(),
    });
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(mocked.getOwned).toHaveBeenCalled());

    await openInviteForm(user);
    await user.type(
      screen.getByPlaceholderText("Enter email address"),
      "x@y.com"
    );
    await user.click(screen.getByRole("button", { name: "Send Invitation" }));

    await waitFor(() => {
      expect(mocked.createInvite).toHaveBeenCalledWith({
        email: "x@y.com",
        permission: "READ",
      });
    });
  });
});
