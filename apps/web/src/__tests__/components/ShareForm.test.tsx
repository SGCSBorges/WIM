import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShareForm from "../../components/sharing/ShareForm";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

function renderForm(onSubmit = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ShareForm onSubmit={onSubmit} />
      </ThemeProvider>
    </I18nProvider>
  );
  return { onSubmit };
}

const submit = () => screen.getByRole("button", { name: /send invitation/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<ShareForm />", () => {
  it("requires an email", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(submit());

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/email address/i), "not-an-email");
    await user.click(submit());

    expect(
      await screen.findByText(/please enter a valid email address/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid invite defaulting to READ permission", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(
      screen.getByLabelText(/email address/i),
      "friend@example.com"
    );
    await user.click(submit());

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: "friend@example.com",
        permission: "READ",
      })
    );
  });

  it("submits WRITE permission when selected", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(
      screen.getByLabelText(/email address/i),
      "friend@example.com"
    );
    await user.click(screen.getByRole("radio", { name: /read & write/i }));
    await user.click(submit());

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: "friend@example.com",
        permission: "WRITE",
      })
    );
  });
});
