import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  transfersAPI: {
    getIncoming: vi.fn(),
    getOutgoing: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
    revoke: vi.fn(),
  },
}));

import { MemoryRouter } from "react-router";
import TransfersView from "../../components/transfers/TransfersView";
import { transfersAPI, type TransferItem } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const api = transfersAPI as unknown as {
  getIncoming: ReturnType<typeof vi.fn>;
  getOutgoing: ReturnType<typeof vi.fn>;
  accept: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
};

function makeTransfer(over: Partial<TransferItem> = {}): TransferItem {
  return {
    id: 1,
    articleId: 10,
    direction: "PUSH",
    status: "PENDING",
    token: "tok-abc",
    message: null,
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    createdAt: new Date().toISOString(),
    article: { articleId: 10, articleNom: "TV", articleModele: "OLED" },
    requester: { userId: 2, email: "me@example.com" },
    owner: { userId: 3, email: "owner@example.com" },
    ...over,
  };
}

function renderView() {
  render(
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <TransfersView />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<TransfersView />", () => {
  it("renders an incoming pending transfer with Accept/Decline actions", async () => {
    api.getIncoming.mockResolvedValue({ items: [makeTransfer()] });
    api.getOutgoing.mockResolvedValue({ items: [] });

    renderView();

    expect(await screen.findByText("TV")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decline/i })
    ).toBeInTheDocument();
  });

  it("accepts a transfer by token and reloads the lists", async () => {
    api.getIncoming.mockResolvedValue({ items: [makeTransfer()] });
    api.getOutgoing.mockResolvedValue({ items: [] });
    api.accept.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    renderView();

    await screen.findByText("TV");
    await user.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(api.accept).toHaveBeenCalledWith("tok-abc");
      // Initial load + reload after the action = 2 fetches each.
      expect(api.getIncoming).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the empty state when there are no incoming transfers", async () => {
    api.getIncoming.mockResolvedValue({ items: [] });
    api.getOutgoing.mockResolvedValue({ items: [] });

    renderView();

    expect(
      await screen.findByText(/no pending transfer requests/i)
    ).toBeInTheDocument();
  });

  it("offers Cancel (revoke) for an outgoing pending transfer", async () => {
    api.getIncoming.mockResolvedValue({ items: [] });
    api.getOutgoing.mockResolvedValue({
      items: [makeTransfer({ id: 5, status: "PENDING" })],
    });
    api.revoke.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    renderView();

    // Switch to the Outgoing tab.
    await user.click(screen.getByRole("radio", { name: /outgoing/i }));

    await screen.findByText("TV");
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(api.revoke).toHaveBeenCalledWith(5);
    });
  });
});
