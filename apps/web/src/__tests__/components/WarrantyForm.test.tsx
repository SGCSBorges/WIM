import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WarrantyForm from "../../components/warranties/WarrantyForm";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

function renderForm(onSubmit = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <WarrantyForm articleId={9} onSubmit={onSubmit} />
      </ThemeProvider>
    </I18nProvider>
  );
  return { onSubmit };
}

const submit = () => screen.getByRole("button", { name: /create warranty/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<WarrantyForm /> validation", () => {
  it("requires a warranty name", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(submit());

    expect(
      await screen.findByText(/warranty name is required/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a duration below 1 month", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const duration = screen.getByLabelText(/duration \(months\)/i);
    await user.clear(duration);
    await user.type(duration, "0");
    // Blur the number field before submitting: clicking submit while it's
    // focused dispatches a change-on-blur that re-runs the "clear error on
    // edit" handler and would wipe the just-set error.
    await user.type(screen.getByLabelText(/warranty name/i), "Laptop");
    await user.click(submit());

    expect(
      await screen.findByText(/duration must be at least 1 month/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a duration over 120 months", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const duration = screen.getByLabelText(/duration \(months\)/i);
    await user.clear(duration);
    await user.type(duration, "200");
    await user.type(screen.getByLabelText(/warranty name/i), "Laptop");
    await user.click(submit());

    expect(
      await screen.findByText(/duration cannot exceed 120 months/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid warranty with empty provider fields nulled", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/warranty name/i), "  Laptop  ");
    await user.click(submit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      garantieNom: "  Laptop  ", // form keeps the raw value; trimming is server-side concern
      garantieDuration: 12, // default
      garantieArticleId: 9,
      providerName: null,
      providerPhone: null,
      providerUrl: null,
    });
  });
});
