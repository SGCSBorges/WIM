import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  messagesAPI: {
    startThread: vi.fn(),
  },
}));

import MessageComposeDialog from "../../components/messages/MessageComposeDialog";
import { messagesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const api = messagesAPI as unknown as {
  startThread: ReturnType<typeof vi.fn>;
};

function renderDialog(onSent = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <MessageComposeDialog
          articleId={42}
          articleName="OLED TV"
          articleModel="C3"
          productImageUrl={null}
          ownerEmail="owner@example.com"
          onSent={onSent}
          onClose={onClose}
        />
      </ThemeProvider>
    </I18nProvider>
  );
  return { onSent, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<MessageComposeDialog />", () => {
  it("starts a thread with the typed message and hands back the new thread id", async () => {
    api.startThread.mockResolvedValueOnce({ threadId: 7, message: {} });
    const user = userEvent.setup();
    const { onSent } = renderDialog();

    await user.type(screen.getByLabelText(/your message/i), "Interested!");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(api.startThread).toHaveBeenCalledWith(42, "Interested!");
      expect(onSent).toHaveBeenCalledWith(7);
    });
  });

  it("keeps the send button disabled until a non-empty message is entered", async () => {
    const user = userEvent.setup();
    renderDialog();

    const send = screen.getByRole("button", { name: /send message/i });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText(/your message/i), "hi");
    expect(send).toBeEnabled();
  });

  it("surfaces a submit error via role=alert and does not call onSent", async () => {
    api.startThread.mockRejectedValueOnce(new Error("Article not found"));
    const user = userEvent.setup();
    const { onSent } = renderDialog();

    await user.type(screen.getByLabelText(/your message/i), "hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/article not found/i);
    expect(onSent).not.toHaveBeenCalled();
  });
});
