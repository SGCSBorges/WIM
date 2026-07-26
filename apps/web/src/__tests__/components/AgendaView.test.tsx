import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  calendarAPI: { agenda: vi.fn() },
}));

import AgendaView from "../../components/agenda/AgendaView";
import { calendarAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";

const agenda = calendarAPI.agenda as unknown as ReturnType<typeof vi.fn>;

function wrap() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <MemoryRouter>
            <AgendaView />
          </MemoryRouter>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString();

beforeEach(() => vi.clearAllMocks());

describe("<AgendaView />", () => {
  it("groups events into time buckets and links article-bound rows", async () => {
    agenda.mockResolvedValue({
      events: [
        {
          kind: "loan",
          date: iso(-2),
          title: "Drill — loan due back (Sam)",
          articleId: 3,
        },
        {
          kind: "warranty",
          date: iso(3),
          title: "Fridge — warranty expires",
          articleId: 1,
        },
        {
          kind: "insurance",
          date: iso(40),
          title: "Acme — policy renewal",
          articleId: null,
        },
      ],
    });

    wrap();

    // Overdue bucket appears with the overdue loan.
    await waitFor(() =>
      expect(screen.getByText(/loan due back/i)).toBeInTheDocument()
    );

    // The article-bound warranty row is a link to its article…
    const warrantyRow = screen.getByText("Fridge — warranty expires");
    expect(warrantyRow.closest("a")).toHaveAttribute("href", "/articles/1");

    // …while the policy renewal (no article) is not a link.
    const policyRow = screen.getByText("Acme — policy renewal");
    expect(policyRow.closest("a")).toBeNull();
  });

  it("shows an empty state when there is nothing scheduled", async () => {
    agenda.mockResolvedValue({ events: [] });
    wrap();
    await waitFor(() =>
      expect(screen.getByText(/nothing on the horizon/i)).toBeInTheDocument()
    );
  });
});
