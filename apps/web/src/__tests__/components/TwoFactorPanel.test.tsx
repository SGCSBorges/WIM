import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  profileAPI: {
    setupTotp: vi.fn(),
    verifyTotpSetup: vi.fn(),
    disableTotp: vi.fn(),
  },
}));

import TwoFactorPanel from "../../components/profile/TwoFactorPanel";
import { profileAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const api = profileAPI as unknown as {
  setupTotp: ReturnType<typeof vi.fn>;
  verifyTotpSetup: ReturnType<typeof vi.fn>;
  disableTotp: ReturnType<typeof vi.fn>;
};

function renderPanel(enabled: boolean, onChanged = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <TwoFactorPanel enabled={enabled} onChanged={onChanged} />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<TwoFactorPanel /> enable flow", () => {
  it("walks password → confirm → verify and reports the change", async () => {
    api.setupTotp.mockResolvedValueOnce({
      qrDataUrl: "data:image/png;base64,AAAA",
      otpauthUrl: "otpauth://totp/WIM:u@e.com?secret=ABC",
      backupCodes: ["aaaa1111", "bbbb2222"],
    });
    api.verifyTotpSetup.mockResolvedValueOnce(undefined);
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel(false, onChanged);

    // idle → password phase
    await user.click(screen.getByRole("button", { name: /^enable$/i }));
    const pw = screen.getByLabelText(/confirm your password/i);
    await user.type(pw, "hunter222");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // setup called with the password; advances to the confirm (QR) phase
    await waitFor(() =>
      expect(api.setupTotp).toHaveBeenCalledWith("hunter222")
    );
    const codeInput = await screen.findByLabelText(/enter the 6-digit code/i);

    // The code input strips non-digits and caps at 6.
    await user.type(codeInput, "1a2b3c456789");
    expect(codeInput).toHaveValue("123456");

    await user.click(
      screen.getByRole("button", { name: /verify and enable/i })
    );

    await waitFor(() => {
      // Verify reuses the same password captured in the first step.
      expect(api.verifyTotpSetup).toHaveBeenCalledWith("hunter222", "123456");
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces a setup error via role=alert and stays on the password step", async () => {
    api.setupTotp.mockRejectedValueOnce(new Error("Wrong password"));
    const user = userEvent.setup();
    renderPanel(false);

    await user.click(screen.getByRole("button", { name: /^enable$/i }));
    await user.type(
      screen.getByLabelText(/confirm your password/i),
      "bad-pass"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Wrong password");
    // Did not advance to the QR/confirm phase.
    expect(
      screen.queryByLabelText(/enter the 6-digit code/i)
    ).not.toBeInTheDocument();
  });
});

describe("<TwoFactorPanel /> disable flow", () => {
  it("password-gates disabling and reports the change", async () => {
    api.disableTotp.mockResolvedValueOnce(undefined);
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel(true, onChanged);

    await user.click(screen.getByRole("button", { name: /^disable$/i }));
    await user.type(
      screen.getByLabelText(/confirm your password/i),
      "hunter222"
    );
    await user.click(
      screen.getByRole("button", { name: /yes, disable two-factor/i })
    );

    await waitFor(() => {
      expect(api.disableTotp).toHaveBeenCalledWith("hunter222");
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });
});
