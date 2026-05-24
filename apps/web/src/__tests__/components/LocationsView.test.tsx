import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  locationsAPI: {
    getAll: vi.fn(),
    listArticles: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import LocationsView from "../../components/locations/LocationsView";
import { locationsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mocked = locationsAPI as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function renderView() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <LocationsView />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<LocationsView />", () => {
  it("lists existing locations", async () => {
    mocked.getAll.mockResolvedValueOnce([
      { locationId: 1, name: "Garage", description: null },
    ]);
    renderView();
    expect(await screen.findByText("Garage")).toBeInTheDocument();
  });

  it("creates a location from the form", async () => {
    mocked.getAll.mockResolvedValue([]);
    mocked.create.mockResolvedValueOnce({ locationId: 2, name: "Office" });
    renderView();
    await waitFor(() => expect(mocked.getAll).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/name \(e\.g\./i), "Office");
    await user.click(screen.getByRole("button", { name: /create location/i }));

    await waitFor(() => {
      expect(mocked.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Office" })
      );
    });
  });
});
