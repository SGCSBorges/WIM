import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  adminAPI: { exportDatabase: vi.fn(), importDatabase: vi.fn() },
  authAPI: { logout: vi.fn() },
}));

import AdminDbBackup from "../../components/admin/AdminDbBackup";
import { adminAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ToastProvider } from "../../components/common/Toast";

const exportDb = adminAPI.exportDatabase as unknown as ReturnType<typeof vi.fn>;
const importDb = adminAPI.importDatabase as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPanel() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <AdminDbBackup />
      </ToastProvider>
    </I18nProvider>
  );
}

describe("<AdminDbBackup />", () => {
  it("calls exportDatabase when the Export button is clicked", async () => {
    exportDb.mockResolvedValueOnce({
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "wim-export.json",
    });
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:fake");
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    const user = userEvent.setup();
    renderPanel();
    await user.click(
      screen.getByRole("button", { name: /export full database/i })
    );
    await waitFor(() => expect(exportDb).toHaveBeenCalledTimes(1));

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it("keeps the destructive confirm button disabled until a password is typed", async () => {
    const user = userEvent.setup();
    renderPanel();

    // Stage a file via the hidden <input type="file">.
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['{"users":[]}'], "dump.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    const confirm = await screen.findByRole("button", {
      name: /yes, replace the database/i,
    });
    // The button is disabled while the password field is empty — the
    // tripwire is at the button level, not just inside the click handler.
    expect(confirm).toBeDisabled();
    expect(importDb).not.toHaveBeenCalled();
  });

  it("toggles the keep-Stripe-IDs checkbox and surfaces the confirm UI after a file is staged", async () => {
    const user = userEvent.setup();
    renderPanel();
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['{"users":[]}'], "dump.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    // After a file is staged, the destructive UI mounts: password field +
    // keepStripeIds checkbox + the danger button.
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    // The password label is rendered now.
    expect(
      screen.getByLabelText(/re-enter your password/i)
    ).toBeInTheDocument();
    // No API call happens just from toggling.
    expect(importDb).not.toHaveBeenCalled();
  });
});
