import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Both cards are entitled in these tests so we exercise the rendered states;
// the "locked → self-hide" path is the all-false default elsewhere.
vi.mock("../../features/features", () => ({
  useFeature: () => true,
  useFeatures: () => ({
    loaded: true,
    features: {},
    refresh: vi.fn(),
    canAccess: () => true,
  }),
}));

vi.mock("../../services/api", () => ({
  statisticsAPI: { getBudget: vi.fn() },
  loansAPI: { list: vi.fn() },
  insuranceAPI: { list: vi.fn() },
  serviceRecordsAPI: { listDue: vi.fn() },
}));

import BudgetCard from "../../components/dashboard/BudgetCard";
import AttentionExtraCard from "../../components/dashboard/AttentionExtraCard";
import {
  statisticsAPI,
  loansAPI,
  insuranceAPI,
  serviceRecordsAPI,
} from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";

const getBudget = statisticsAPI.getBudget as unknown as ReturnType<
  typeof vi.fn
>;
const loanList = loansAPI.list as unknown as ReturnType<typeof vi.fn>;
const policyList = insuranceAPI.list as unknown as ReturnType<typeof vi.fn>;
const dueList = serviceRecordsAPI.listDue as unknown as ReturnType<
  typeof vi.fn
>;

function wrap(ui: React.ReactNode) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString();

beforeEach(() => vi.clearAllMocks());

describe("<BudgetCard />", () => {
  it("self-hides when no budget is set", async () => {
    getBudget.mockResolvedValue({
      currency: "USD",
      monthlyBudget: null,
      monthlySpend: 0,
      annualBudget: null,
      annualSpend: 0,
    });
    const { container } = wrap(<BudgetCard />);
    // Give the mount effect a tick to resolve, then assert nothing rendered.
    await waitFor(() => expect(getBudget).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an over-budget warning when spend exceeds the budget", async () => {
    getBudget.mockResolvedValue({
      currency: "USD",
      monthlyBudget: 100,
      monthlySpend: 150,
      annualBudget: 5000,
      annualSpend: 1200,
    });
    wrap(<BudgetCard />);
    // The month row is over budget → the danger badge appears.
    expect(await screen.findByText("Over budget")).toBeInTheDocument();
    // Both period rows render.
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("This year")).toBeInTheDocument();
  });
});

describe("<AttentionExtraCard />", () => {
  it("self-hides when every feed is empty", async () => {
    loanList.mockResolvedValue([]);
    policyList.mockResolvedValue([]);
    dueList.mockResolvedValue([]);
    const { container } = wrap(<AttentionExtraCard />);
    await waitFor(() => expect(dueList).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders overdue loans, due renewals and due services — filtering the rest", async () => {
    loanList.mockResolvedValue([
      {
        loanId: 1,
        articleId: 11,
        borrowerName: "Sam",
        dueAt: iso(-2), // overdue → shown
        returnedAt: null,
        article: { articleId: 11, articleNom: "Overdue Drill" },
      },
      {
        loanId: 2,
        articleId: 12,
        borrowerName: "Pat",
        dueAt: iso(5), // not yet due → filtered out
        returnedAt: null,
        article: { articleId: 12, articleNom: "Future Saw" },
      },
    ]);
    policyList.mockResolvedValue([
      {
        policyId: 5,
        provider: "Acme Insure",
        renewalAt: iso(10), // within window → shown
        articles: [],
      },
      {
        policyId: 6,
        provider: "Far Insure",
        renewalAt: iso(400), // beyond window → filtered out
        articles: [],
      },
    ]);
    dueList.mockResolvedValue([
      {
        serviceId: 9,
        articleId: 13,
        nextDueAt: iso(3),
        article: { articleId: 13, articleNom: "Boiler" },
      },
    ]);

    wrap(<AttentionExtraCard />);

    expect(await screen.findByText("Overdue Drill")).toBeInTheDocument();
    expect(screen.getByText("Acme Insure")).toBeInTheDocument();
    expect(screen.getByText("Boiler")).toBeInTheDocument();

    // The non-overdue loan and the far-future policy are excluded by the
    // client-side filters.
    expect(screen.queryByText("Future Saw")).not.toBeInTheDocument();
    expect(screen.queryByText("Far Insure")).not.toBeInTheDocument();
  });
});
