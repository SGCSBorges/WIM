import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../services/api", () => ({
  articlesAPI: { getById: vi.fn() },
  attachmentsAPI: { getAll: vi.fn() },
  notesAPI: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
  profileAPI: { getMe: vi.fn() },
}));

import ArticleDetail from "../../components/articles/ArticleDetail";
import {
  articlesAPI,
  attachmentsAPI,
  notesAPI,
  profileAPI,
} from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mocked = {
  getById: articlesAPI.getById as unknown as ReturnType<typeof vi.fn>,
  attGetAll: attachmentsAPI.getAll as unknown as ReturnType<typeof vi.fn>,
  notesList: notesAPI.list as unknown as ReturnType<typeof vi.fn>,
  notesCreate: notesAPI.create as unknown as ReturnType<typeof vi.fn>,
  getMe: profileAPI.getMe as unknown as ReturnType<typeof vi.fn>,
};

function renderAt(id = "5") {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/articles/${id}`]}>
            <Routes>
              <Route path="/articles/:id" element={<ArticleDetail />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getById.mockResolvedValue({
    articleId: 5,
    articleNom: "Drill",
    articleModele: "DW-100",
    purchasePrice: "199.99",
    locations: [{ locationId: 1, location: { name: "Garage" } }],
    tags: [],
    garantie: null,
  });
  mocked.attGetAll.mockResolvedValue([]);
  mocked.notesList.mockResolvedValue([]);
  mocked.getMe.mockResolvedValue({ currency: "USD" });
});

describe("<ArticleDetail />", () => {
  it("renders the article after load", async () => {
    renderAt();
    expect(await screen.findByText("Drill")).toBeInTheDocument();
    expect(screen.getByText("DW-100")).toBeInTheDocument();
  });

  it("adds a maintenance note", async () => {
    mocked.notesCreate.mockResolvedValueOnce({
      noteId: 1,
      articleId: 5,
      content: "Replaced battery",
      createdAt: new Date().toISOString(),
    });
    renderAt();
    await screen.findByText("Drill");

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/add a note/i),
      "Replaced battery"
    );
    await user.click(screen.getByRole("button", { name: /add note/i }));

    await waitFor(() => {
      // Default kind defaults to OTHER (the picker is reset between adds).
      expect(mocked.notesCreate).toHaveBeenCalledWith(
        5,
        "Replaced battery",
        "OTHER"
      );
    });
    expect(await screen.findByText("Replaced battery")).toBeInTheDocument();
  });
});
