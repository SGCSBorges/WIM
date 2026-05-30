import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  attachmentsAPI: {
    getAll: vi.fn(),
    uploadFile: vi.fn(),
    deleteAttachment: vi.fn(),
    bulkDelete: vi.fn(),
  },
  articlesAPI: {},
  warrantiesAPI: {},
}));

vi.mock("../../components/attachments/AttachmentForm", () => ({
  default: () => <div data-testid="attachment-form-stub" />,
}));

import AttachmentsList from "../../components/attachments/AttachmentsList";
import { attachmentsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";

const getAll = attachmentsAPI.getAll as unknown as ReturnType<typeof vi.fn>;
const bulkDelete = attachmentsAPI.bulkDelete as unknown as ReturnType<
  typeof vi.fn
>;

const fixture = (id: number, fileName: string) => ({
  attachmentId: id,
  fileName,
  mimeType: "application/pdf",
  fileSize: 12345,
  fileUrl: `/u/${fileName}`,
  thumbUrl: null,
  type: "OTHER" as const,
  articleId: null,
  garantieId: null,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderList() {
  return render(
    <I18nProvider>
      <AttachmentsList />
    </I18nProvider>
  );
}

describe("<AttachmentsList />", () => {
  it("renders the empty state when getAll returns no rows", async () => {
    getAll.mockResolvedValueOnce([]);
    renderList();
    expect(
      await screen.findByText(/no attachments|attachments.none/i)
    ).toBeInTheDocument();
  });

  it("renders one card per attachment returned by the API", async () => {
    getAll.mockResolvedValueOnce([fixture(1, "a.pdf"), fixture(2, "b.pdf")]);
    renderList();
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  it("shows the bulk action bar once a row is selected and calls bulkDelete on confirm", async () => {
    getAll.mockResolvedValueOnce([fixture(1, "a.pdf"), fixture(2, "b.pdf")]);
    bulkDelete.mockResolvedValueOnce({ count: 1 });
    const user = userEvent.setup();
    renderList();
    await screen.findByText("a.pdf");

    // The per-row checkbox is labelled "Select a.pdf".
    await user.click(screen.getByLabelText(/select a\.pdf/i));
    // The bulk bar reads "1 selected".
    expect(await screen.findByText(/1 selected/i)).toBeInTheDocument();

    // Two-step confirm: click "Delete selected", then "Yes, delete".
    await user.click(screen.getByRole("button", { name: /delete selected/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));

    await waitFor(() => {
      expect(bulkDelete).toHaveBeenCalledWith([1]);
    });
    // The selected row drops out optimistically.
    await waitFor(() => {
      expect(screen.queryByText("a.pdf")).toBeNull();
    });
  });
});
