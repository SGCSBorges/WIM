import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  adminAPI: { getJobs: vi.fn() },
}));

import JobsTab from "../../components/admin/JobsTab";
import { adminAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";

const getJobs = adminAPI.getJobs as unknown as ReturnType<typeof vi.fn>;

const snap = (failed: number) => ({
  alerts: { waiting: 1, active: 0, delayed: 2, completed: 10, failed },
  maintenance: { waiting: 0, active: 0, delayed: 0, completed: 5, failed: 0 },
  auditPruneNextRun: Date.now() + 60_000,
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderTab() {
  return render(
    <I18nProvider>
      <JobsTab />
    </I18nProvider>
  );
}

describe("<JobsTab />", () => {
  it("renders the queue counts returned by getJobs on mount", async () => {
    getJobs.mockResolvedValueOnce(snap(0));
    renderTab();
    // Maintenance row has completed=5 — distinctive enough to assert against.
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(getJobs).toHaveBeenCalled();
  });

  it("highlights the failed cell with alert styling when failed > 0", async () => {
    getJobs.mockResolvedValueOnce(snap(3));
    renderTab();
    const failedCell = (await screen.findByText("3")).parentElement;
    expect(failedCell?.className).toMatch(/ui-alert-error/);
  });

  it("toggles the pause/resume button label when clicked", async () => {
    getJobs.mockResolvedValue(snap(0));
    const user = userEvent.setup();
    renderTab();
    // Default state is running, so the action button reads "Pause".
    const pauseBtn = await screen.findByRole("button", { name: /pause/i });
    await user.click(pauseBtn);
    // After clicking, the same button now reads "Resume refresh".
    expect(
      await screen.findByRole("button", { name: /resume/i })
    ).toBeInTheDocument();
  });
});
