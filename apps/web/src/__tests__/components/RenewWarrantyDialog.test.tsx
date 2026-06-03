import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  warrantiesAPI: {
    renew: vi.fn(),
    extend: vi.fn(),
  },
  authAPI: { getRole: () => null },
  profileAPI: { updatePreferences: vi.fn() },
}));

import RenewWarrantyDialog from "../../components/warranties/RenewWarrantyDialog";
import { warrantiesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";
import { ToastProvider } from "../../components/common/Toast";

const mocked = warrantiesAPI as unknown as {
  renew: ReturnType<typeof vi.fn>;
  extend: ReturnType<typeof vi.fn>;
};

const baseWarranty = {
  garantieId: 42,
  garantieDateAchat: "2024-01-01",
  garantieDuration: 24,
};

function renderDialog(onUpdated = vi.fn()) {
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <ToastProvider>
            <RenewWarrantyDialog
              open
              warranty={baseWarranty}
              onClose={onClose}
              onUpdated={onUpdated}
            />
          </ToastProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
  return { onClose, onUpdated };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<RenewWarrantyDialog />", () => {
  it("submits a renew with the typed date and duration", async () => {
    const user = userEvent.setup();
    mocked.renew.mockResolvedValue({ garantieId: 42 });
    const { onClose, onUpdated } = renderDialog();

    await user.click(screen.getByRole("button", { name: /renew warranty/i }));

    await waitFor(() =>
      expect(mocked.renew).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ garantieDuration: 24 })
      )
    );
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to extend mode and posts months", async () => {
    const user = userEvent.setup();
    mocked.extend.mockResolvedValue({ garantieId: 42 });
    renderDialog();

    await user.click(screen.getByRole("radio", { name: /^extend$/i }));
    await user.click(screen.getByRole("button", { name: /extend warranty/i }));

    await waitFor(() =>
      expect(mocked.extend).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ months: 12 })
      )
    );
  });
});
