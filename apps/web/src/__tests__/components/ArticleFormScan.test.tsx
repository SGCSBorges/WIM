import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  API_BASE_URL: "http://test/api",
  locationsAPI: { getAll: vi.fn().mockResolvedValue([]), create: vi.fn() },
  attachmentsAPI: { uploadFile: vi.fn(), deleteAttachment: vi.fn() },
  tagsAPI: { getAll: vi.fn().mockResolvedValue([]), create: vi.fn() },
  articleTemplatesAPI: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

import ArticleForm from "../../components/articles/ArticleForm";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

function renderForm() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <ArticleForm onSubmit={vi.fn()} />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

afterEach(() => {
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
});

beforeEach(() => vi.clearAllMocks());

describe("ArticleForm barcode scan button", () => {
  it("hides the Scan button when BarcodeDetector is unavailable", async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/model|modèle|modelo/i)).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: /^(scan|scanner|digitalizar)$/i })
    ).toBeNull();
  });

  it("shows the Scan button when BarcodeDetector is present", async () => {
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      function BarcodeDetector() {} as unknown;
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/model|modèle|modelo/i)).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: /^(scan|scanner|digitalizar)$/i })
    ).toBeInTheDocument();
  });
});
