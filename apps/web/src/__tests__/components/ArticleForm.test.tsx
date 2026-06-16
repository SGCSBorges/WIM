import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  API_BASE_URL: "http://test/api",
  locationsAPI: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
  attachmentsAPI: {
    uploadFile: vi.fn(),
    deleteAttachment: vi.fn(),
  },
  tagsAPI: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  articleTemplatesAPI: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

import ArticleForm from "../../components/articles/ArticleForm";
import { locationsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mockedGetAll = locationsAPI.getAll as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<ArticleForm />", () => {
  it("blocks submit with an aria-live alert when no location is selected", async () => {
    // The form is noValidate, so all checks run in handleSubmit. We fill
    // name/model and leave locations empty to surface the inline alert we
    // want to assert (including its aria-live wiring).
    mockedGetAll.mockResolvedValueOnce([{ locationId: 7, name: "Garage" }]);
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <ArticleForm onSubmit={onSubmit} />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    );
    await waitFor(() => expect(screen.getByText("Garage")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name|nom/i), "Drill");
    await user.type(screen.getByLabelText(/model|modèle|modelo/i), "DW-100");
    const submit = container.querySelector(
      "button[type='submit']"
    ) as HTMLButtonElement;
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a negative purchase price with a localized message", async () => {
    // With noValidate the input's native min="0" no longer blocks submit, so
    // handleSubmit's own range check must catch it and show the app's message.
    mockedGetAll.mockResolvedValueOnce([{ locationId: 7, name: "Garage" }]);
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <ArticleForm onSubmit={onSubmit} />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    );
    await waitFor(() => expect(screen.getByText("Garage")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name|nom/i), "Drill");
    await user.type(screen.getByLabelText(/model|modèle|modelo/i), "DW-100");
    await user.click(screen.getByRole("checkbox", { name: /garage/i }));
    await user.type(screen.getByLabelText(/purchase price/i), "-5");
    const submit = container.querySelector(
      "button[type='submit']"
    ) as HTMLButtonElement;
    await user.click(submit);

    expect(
      await screen.findByText(/purchase price must be 0 or more/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits when name, model and a location are provided", async () => {
    mockedGetAll.mockResolvedValueOnce([{ locationId: 7, name: "Garage" }]);
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <ArticleForm onSubmit={onSubmit} />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    );
    await waitFor(() => expect(screen.getByText("Garage")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name|nom/i), "Drill");
    await user.type(screen.getByLabelText(/model|modèle|modelo/i), "DW-100");
    await user.click(screen.getByRole("checkbox", { name: /garage/i }));
    const submit = container.querySelector(
      "button[type='submit']"
    ) as HTMLButtonElement;
    await user.click(submit);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.articleNom).toBe("Drill");
    expect(payload.articleModele).toBe("DW-100");
    expect(payload.locationIds).toEqual([7]);
  });
});
