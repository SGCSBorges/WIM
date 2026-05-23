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
    // name/model carry the native `required` attribute, so we fill them and
    // leave locations empty — that path is validated in JS and surfaces the
    // inline alert we want to assert (including its aria-live wiring).
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
