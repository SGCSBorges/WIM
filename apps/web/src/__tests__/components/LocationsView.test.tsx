import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  locationsAPI: {
    getAll: vi.fn(),
    listArticles: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 1 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  profileAPI: {
    getMe: vi.fn().mockResolvedValue({
      userId: 1,
      email: "u@e.com",
      role: "USER",
      currency: "USD",
    }),
  },
}));

import LocationsView from "../../components/locations/LocationsView";
import { locationsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mocked = locationsAPI as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  listArticles: ReturnType<typeof vi.fn>;
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
    // The name renders both as a list row and as a parent-select option.
    const hits = await screen.findAllByText("Garage");
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the article count from the list `_count` without a per-location request", async () => {
    mocked.getAll.mockResolvedValueOnce([
      {
        locationId: 1,
        name: "Garage",
        description: null,
        totalValue: 0,
        _count: { articles: 3 },
      },
    ]);
    renderView();

    // Count badge comes straight from the list row's `_count.articles`.
    expect(await screen.findByText("3 article(s)")).toBeInTheDocument();
    // Regression guard: the old code fired listArticles({page:1,limit:1}) per
    // location just to read this number — it must not be called anymore.
    expect(mocked.listArticles).not.toHaveBeenCalled();
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
