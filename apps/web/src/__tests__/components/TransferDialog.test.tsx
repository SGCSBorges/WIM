import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  transfersAPI: {
    pushTransfer: vi.fn(),
    pullTransfer: vi.fn(),
  },
}));

import TransferDialog from "../../components/articles/TransferDialog";
import { transfersAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const api = transfersAPI as unknown as {
  pushTransfer: ReturnType<typeof vi.fn>;
  pullTransfer: ReturnType<typeof vi.fn>;
};

function renderDialog(
  direction: "push" | "pull",
  onDone = vi.fn(),
  onClose = vi.fn()
) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <TransferDialog
          articleId={42}
          articleName="OLED TV"
          direction={direction}
          onDone={onDone}
          onClose={onClose}
        />
      </ThemeProvider>
    </I18nProvider>
  );
  return { onDone, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<TransferDialog />", () => {
  it("pushes a transfer with the recipient email + message", async () => {
    api.pushTransfer.mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { onDone } = renderDialog("push");

    await user.type(
      screen.getByLabelText(/recipient email/i),
      "new-owner@example.com"
    );
    await user.type(screen.getByLabelText(/message/i), "yours now");
    await user.click(
      screen.getByRole("button", { name: /send transfer offer/i })
    );

    await waitFor(() => {
      expect(api.pushTransfer).toHaveBeenCalledWith(
        42,
        "new-owner@example.com",
        "yours now"
      );
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("pulls a transfer (no email field) and omits an empty message", async () => {
    api.pullTransfer.mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { onDone } = renderDialog("pull");

    // Pull mode never collects an email — the owner is resolved server-side.
    expect(screen.queryByLabelText(/recipient email/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /request transfer/i }));

    await waitFor(() => {
      expect(api.pullTransfer).toHaveBeenCalledWith(42, undefined);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces a submit error via role=alert and does not call onDone", async () => {
    api.pushTransfer.mockRejectedValueOnce(new Error("Recipient not found"));
    const user = userEvent.setup();
    const { onDone } = renderDialog("push");

    await user.type(
      screen.getByLabelText(/recipient email/i),
      "missing@example.com"
    );
    await user.click(
      screen.getByRole("button", { name: /send transfer offer/i })
    );

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((a) => /recipient not found/i.test(a.textContent ?? ""))
    ).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });
});
