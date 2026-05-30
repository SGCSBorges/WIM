import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  articlesAPI: { importRows: vi.fn() },
}));

vi.mock("../../utils/csv", () => ({
  // Skip the FileReader path — return a single valid + a single invalid row.
  // The component maps fields case-insensitively and treats a missing name
  // or empty locations as invalid.
  parseCSV: vi.fn().mockReturnValue([
    { name: "Laptop", model: "X1", locations: "Office" },
    { name: "", model: "missing-name", locations: "" },
  ]),
}));

import CsvImportModal from "../../components/articles/CsvImportModal";
import { articlesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ToastProvider } from "../../components/common/Toast";

const importRows = articlesAPI.importRows as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom's File.prototype.text is unreliable for these test flows; stub it
  // to return an opaque CSV blob — parseCSV is mocked anyway, so the actual
  // content doesn't matter to the assertion.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (File.prototype as any).text = vi.fn().mockResolvedValue("name,model\nx,y");
});

function renderModal(open: boolean, onImported = vi.fn()) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <CsvImportModal open={open} onClose={vi.fn()} onImported={onImported} />
      </ToastProvider>
    </I18nProvider>
  );
}

describe("<CsvImportModal />", () => {
  it("renders nothing when open=false", () => {
    const { container } = renderModal(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the file picker when open=true", () => {
    renderModal(true);
    expect(
      screen.getByRole("dialog", { name: /import/i })
    ).toBeInTheDocument();
    expect(
      document.querySelector('input[type="file"]')
    ).toBeInTheDocument();
  });

  it("parses the picked file and posts only valid rows to importRows", async () => {
    importRows.mockResolvedValueOnce({ created: 1, errors: [], dryRun: false });
    const onImported = vi.fn();
    const user = userEvent.setup();
    renderModal(true, onImported);

    // parseCSV is mocked so we don't depend on File.text() actually
    // returning in jsdom — the file pick just feeds an opaque blob.
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["x"], "rows.csv", { type: "text/csv" });
    await user.upload(fileInput, file);

    // The preview surfaces the filename once parseCSV resolves.
    await screen.findByText(/rows\.csv/);

    // Find the Validate button — its label contains the valid-row count
    // (1 here). Match loosely so the en/fr/pt variants all pass.
    const validateBtn = await screen.findByRole("button", {
      name: /validate|import.*1/i,
    });
    await user.click(validateBtn);

    await waitFor(() => {
      expect(importRows).toHaveBeenCalled();
    });
    // Only the valid row was sent — the second (empty name + empty
    // locations) was filtered out by `payload()`.
    const sentRows = importRows.mock.calls[0][0];
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].name).toBe("Laptop");
    expect(sentRows[0].locations).toEqual(["Office"]);
  });
});
