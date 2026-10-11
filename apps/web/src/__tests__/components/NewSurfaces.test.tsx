import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  messagesAPI: { startThread: vi.fn() },
  statisticsAPI: { getAnalytics: vi.fn() },
  profileAPI: { getMe: vi.fn() },
}));

import MessageComposeDialog from "../../components/messages/MessageComposeDialog";
import AnalyticsView from "../../components/analytics/AnalyticsView";
import { messagesAPI, statisticsAPI, profileAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";
import { ToastProvider } from "../../components/common/Toast";

const startThread = messagesAPI.startThread as unknown as ReturnType<
  typeof vi.fn
>;
const getAnalytics = statisticsAPI.getAnalytics as unknown as ReturnType<
  typeof vi.fn
>;
const getMe = profileAPI.getMe as unknown as ReturnType<typeof vi.fn>;

function wrap(ui: React.ReactNode) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <ToastProvider>{ui}</ToastProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

describe("<MessageComposeDialog />", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts the typed message and hands the new thread id back", async () => {
    startThread.mockResolvedValue({ threadId: 42, message: {} });
    const onSent = vi.fn();
    wrap(
      <MessageComposeDialog
        articleId={7}
        articleName="OLED TV"
        onSent={onSent}
        onClose={() => {}}
      />
    );

    // The pinned item name is shown so both sides know the subject.
    expect(screen.getAllByText("OLED TV").length).toBeGreaterThan(0);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "Is this still available?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(startThread).toHaveBeenCalledWith(7, "Is this still available?")
    );
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(42));
  });

  it("keeps send disabled until something is typed", () => {
    wrap(
      <MessageComposeDialog
        articleId={7}
        articleName="OLED TV"
        onSent={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});

describe("<AnalyticsView />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMe.mockResolvedValue({ currency: "USD" });
  });

  it("shows the empty state when nothing is priced", async () => {
    getAnalytics.mockResolvedValue({
      totalSpend: 0,
      currentValue: 0,
      itemsPriced: 0,
      spendByMonth: [],
      byLocation: [],
      byTag: [],
      byCategory: [],
      topItems: [],
    });
    wrap(<AnalyticsView />);
    // The empty-state hint is shown once the fetch resolves.
    expect(
      await screen.findByText(/add a purchase price/i)
    ).toBeInTheDocument();
  });

  // An item with no warranty is dated by the day it was added: entered at
  // onboarding, it shows as a spike that month. The charts say so.
  it("says what the monthly figures are dated by", async () => {
    getAnalytics.mockResolvedValue({
      totalSpend: 1200,
      currentValue: 1000,
      itemsPriced: 1,
      spendByMonth: [{ month: "2026-05", amount: 1200, cumulative: 1200 }],
      byLocation: [],
      byTag: [],
      byCategory: [],
      topItems: [{ articleId: 1, name: "TV", value: 1000 }],
    });
    wrap(<AnalyticsView />);
    expect(
      await screen.findAllByText(
        /purchase date, or else the day the item was added/i
      )
    ).toHaveLength(2);
  });

  it("surfaces an error banner when the analytics fetch fails", async () => {
    getAnalytics.mockRejectedValue(new Error("boom"));
    wrap(<AnalyticsView />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
