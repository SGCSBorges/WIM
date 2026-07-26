import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  articlesAPI: {
    listTrash: vi.fn(),
    restore: vi.fn(),
    purge: vi.fn(),
  },
}));

import ArticlesTrash from "../../components/articles/ArticlesTrash";
import { articlesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ToastProvider } from "../../components/common/Toast";

const list = articlesAPI.listTrash as unknown as ReturnType<typeof vi.fn>;
const restore = articlesAPI.restore as unknown as ReturnType<typeof vi.fn>;
const purge = articlesAPI.purge as unknown as ReturnType<typeof vi.fn>;

const fixture = (id: number, name: string) => ({
  articleId: id,
  articleNom: name,
  articleModele: "M",
  articleDescription: null,
  productImageUrl: null,
  purchasePrice: null,
  depreciationRate: null,
  sharedWithPowerUsers: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  locations: [],
  tags: [],
});

function renderTrash() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ToastProvider>
          <ArticlesTrash />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Block window.confirm prompts; the purge path uses it via the inline
  // confirm UI, not native confirm, so a default-deny is safe.
  vi.stubGlobal("confirm", () => true);
});

describe("<ArticlesTrash />", () => {
  it("renders the empty state when listTrash returns nothing", async () => {
    list.mockResolvedValueOnce({ items: [] });
    renderTrash();
    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();
  });

  it("calls articlesAPI.restore and removes the row from the list", async () => {
    list.mockResolvedValueOnce({ items: [fixture(7, "Stapler")] });
    restore.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderTrash();

    expect(await screen.findByText("Stapler")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith(7);
    });
    await waitFor(() => {
      expect(screen.queryByText("Stapler")).toBeNull();
    });
  });

  it("requires the inline confirm step before purging", async () => {
    list.mockResolvedValueOnce({
      items: [fixture(11, "Old keyboard")],
    });
    purge.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderTrash();

    expect(await screen.findByText("Old keyboard")).toBeInTheDocument();
    // First click reveals the confirm UI; the API hasn't been called yet.
    await user.click(screen.getByRole("button", { name: /delete forever/i }));
    expect(purge).not.toHaveBeenCalled();
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

    // The confirm button — labelled "Yes, delete forever" — fires the purge.
    fireEvent.click(
      screen.getByRole("button", { name: /yes, delete forever/i })
    );
    await waitFor(() => {
      expect(purge).toHaveBeenCalledWith(11);
    });
    await waitFor(() => {
      expect(screen.queryByText("Old keyboard")).toBeNull();
    });
  });
});
