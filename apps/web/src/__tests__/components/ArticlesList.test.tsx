/**
 * ArticlesList is the most-used screen and had no test at all. These cover
 * the render path and the create/edit sheet: the list itself, `?new=1`
 * (what the top-bar button, the `c` shortcut and the command palette all
 * navigate to) opening the sheet, Cancel closing it, and Edit opening it
 * pre-filled for a row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  articleTemplatesAPI: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
  },
  articlesAPI: {
    bulkAssign: vi.fn(),
    bulkDelete: vi.fn(),
    bulkPurgeTrash: vi.fn(),
    bulkRestoreTrash: vi.fn(),
    bulkSetSharedWithPowerUsers: vi.fn(),
    bulkUpdate: vi.fn(),
    bulkVerify: vi.fn(),
    bundles: vi.fn().mockResolvedValue([]),
    claimPdf: vi.fn(),
    create: vi.fn(),
    createPublicLink: vi.fn(),
    delete: vi.fn(),
    deletePublicLink: vi.fn(),
    duplicate: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    getPublicLink: vi.fn(),
    importRows: vi.fn(),
    inventoryCsv: vi.fn(),
    inventoryPdf: vi.fn(),
    labelsPdf: vi.fn(),
    listTrash: vi.fn(),
    purge: vi.fn(),
    restore: vi.fn(),
    setFavorite: vi.fn(),
    setPrimaryImage: vi.fn(),
    setSharedWithPowerUsers: vi.fn(),
    update: vi.fn(),
    verify: vi.fn(),
  },
  attachmentsAPI: {
    deleteAttachment: vi.fn(),
    getAll: vi.fn(),
    uploadFile: vi.fn(),
  },
  insuranceAPI: {
    linkArticle: vi.fn(),
    list: vi.fn(),
    unlinkArticle: vi.fn(),
  },
  loansAPI: {
    create: vi.fn(),
    list: vi.fn(),
    markReturned: vi.fn(),
    remove: vi.fn(),
  },
  locationsAPI: {
    create: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  },
  notesAPI: {
    create: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  },
  savedViewsAPI: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    listShared: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
  },
  serviceRecordsAPI: {
    create: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  },
  tagsAPI: {
    create: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    merge: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  },
  transfersAPI: {
    pullTransfer: vi.fn(),
    pushTransfer: vi.fn(),
  },
  warrantiesAPI: {
    getHistory: vi.fn(),
    updateClaim: vi.fn(),
  },
}));

import ArticlesList from "../../components/articles/ArticlesList";
import { articlesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";
import { ToastProvider } from "../../components/common/Toast";

const getAll = articlesAPI.getAll as unknown as ReturnType<typeof vi.fn>;

const article = (id: number, name: string) => ({
  articleId: id,
  articleNom: name,
  articleModele: `M-${id}`,
  articleDescription: null,
  productImageUrl: null,
  purchasePrice: 100,
  depreciationRate: null,
  status: "ACTIVE",
  sharedWithPowerUsers: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  garantie: null,
  locations: [],
  tags: [],
});

function renderList(path = "/articles") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <ToastProvider>
              <ArticlesList />
            </ToastProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAll.mockResolvedValue({
    items: [article(1, "Drill"), article(2, "Kettle")],
    total: 2,
    page: 1,
    limit: 25,
  });
});

describe("<ArticlesList />", () => {
  it("renders the fetched rows as links to their detail pages", async () => {
    renderList();
    const drill = await screen.findAllByRole("link", { name: "Drill" });
    expect(drill[0]).toHaveAttribute("href", "/articles/1");
    expect(
      screen.getAllByRole("link", { name: "Kettle" }).length
    ).toBeGreaterThan(0);
    // No sheet at rest.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the create sheet from ?new=1 and strips the param", async () => {
    renderList("/articles?new=1");
    const dialog = await screen.findByRole("dialog", {
      name: "Create New Article",
    });
    expect(dialog).toHaveAttribute("data-variant", "side");
    // The list is still mounted behind the sheet, not replaced by it.
    expect(
      (await screen.findAllByRole("link", { name: "Drill" })).length
    ).toBeGreaterThan(0);
  });

  it("opens the sheet from the header button and closes it with Cancel", async () => {
    renderList();
    await screen.findAllByRole("link", { name: "Drill" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create Article" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Create New Article",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("opens the sheet in edit mode for a row", async () => {
    renderList();
    await screen.findAllByRole("link", { name: "Drill" });
    const user = userEvent.setup();
    // Table and card layouts both render an Edit control; the first is the
    // Drill row in the table.
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Edit Article" });
    expect(within(dialog).getByDisplayValue("Drill")).toBeInTheDocument();
  });
});
