/**
 * Regression: the per-article sections (loans / maintenance / insurance) are
 * reused across article → article navigation (the round-9 "bundled with"
 * sibling links), so a slow response for the previous article must never
 * overwrite the newer one. Each `load()` stamps a request sequence and drops
 * its own result if a newer request started meanwhile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { LoanItem } from "@wim/types";

vi.mock("../../services/api", () => ({
  loansAPI: {
    list: vi.fn(),
    create: vi.fn(),
    markReturned: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../../features/features", () => ({
  useFeature: () => true,
  useFeatures: () => ({
    loaded: true,
    features: {},
    refresh: vi.fn(),
    canAccess: () => true,
  }),
}));

import LoanSection from "../../components/articles/LoanSection";
import { loansAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";
import { ToastProvider } from "../../components/common/Toast";

const list = loansAPI.list as unknown as ReturnType<typeof vi.fn>;

function loan(articleId: number, borrowerName: string): LoanItem {
  return {
    loanId: articleId * 100,
    articleId,
    borrowerName,
    borrowerEmail: null,
    loanedAt: new Date().toISOString(),
    dueAt: null,
    returnedAt: null,
    note: null,
    article: {
      articleId,
      articleNom: `Article ${articleId}`,
      articleModele: "M",
    },
  } as LoanItem;
}

function wrap(articleId: number) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <ToastProvider>
            <LoanSection articleId={articleId} />
          </ToastProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("<LoanSection /> stale-response guard", () => {
  it("ignores a slow response for the previous article", async () => {
    // Article 1's request resolves LAST (slow); article 2's resolves first.
    let resolveSlow: (v: LoanItem[]) => void = () => {};
    const slow = new Promise<LoanItem[]>((r) => {
      resolveSlow = r;
    });
    list.mockReturnValueOnce(slow);
    list.mockResolvedValueOnce([loan(2, "Bob")]);

    const { rerender } = wrap(1);
    // Navigate to the sibling article before the first response lands.
    rerender(
      <I18nProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <ToastProvider>
              <LoanSection articleId={2} />
            </ToastProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </I18nProvider>
    );

    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    // The stale article-1 response arrives late and must be discarded.
    resolveSlow([loan(1, "Alice")]);
    await Promise.resolve();

    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
