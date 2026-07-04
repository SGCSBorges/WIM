import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  articlesAPI: {
    bulkUpdate: vi.fn(),
  },
}));

import BulkEditDialog from "../../components/articles/BulkEditDialog";
import { articlesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const bulkUpdate = articlesAPI.bulkUpdate as unknown as ReturnType<
  typeof vi.fn
>;

function renderDialog(onApplied = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <BulkEditDialog
          open
          ids={[1, 2, 3]}
          onClose={onClose}
          onApplied={onApplied}
        />
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<BulkEditDialog />", () => {
  it("rejects a blank 'Set to…' field instead of silently writing 0", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Choose "Set to…" for purchase price but leave the value blank.
    await user.selectOptions(
      screen.getByLabelText("Purchase price operation"),
      "set"
    );
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    // Footgun guard: Number("") === 0 would have zeroed every selected
    // article's price. Instead the user gets an error and no write happens.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(bulkUpdate).not.toHaveBeenCalled();
  });

  it("errors when no field is changed (all Skip)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(bulkUpdate).not.toHaveBeenCalled();
  });

  it("applies a numeric set and reports the count", async () => {
    bulkUpdate.mockResolvedValueOnce({ count: 3 });
    const onApplied = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(onApplied, onClose);

    await user.selectOptions(
      screen.getByLabelText("Purchase price operation"),
      "set"
    );
    await user.type(
      screen.getByLabelText(/purchase price/i, {
        selector: "input",
      }),
      "199.99"
    );
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    await waitFor(() => {
      expect(bulkUpdate).toHaveBeenCalledWith([1, 2, 3], {
        purchasePrice: 199.99,
      });
      expect(onApplied).toHaveBeenCalledWith(3);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("sends null for a field set to Clear", async () => {
    bulkUpdate.mockResolvedValueOnce({ count: 2 });
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByLabelText("Brand operation"), "clear");
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    await waitFor(() => {
      expect(bulkUpdate).toHaveBeenCalledWith([1, 2, 3], { brand: null });
    });
  });

  it("offers no Clear option for quantity (the column is NOT NULL)", () => {
    renderDialog();
    const qtyOp = screen.getByLabelText("Quantity operation");
    const options = Array.from(qtyOp.querySelectorAll("option")).map((o) =>
      o.getAttribute("value")
    );
    expect(options).toEqual(expect.arrayContaining(["skip", "set"]));
    expect(options).not.toContain("clear");
  });

  it("forwards a set quantity to bulkUpdate", async () => {
    bulkUpdate.mockResolvedValueOnce({ count: 3 });
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(
      screen.getByLabelText("Quantity operation"),
      "set"
    );
    await user.type(
      screen.getByLabelText("Quantity", { selector: "input" }),
      "4"
    );
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    await waitFor(() => {
      expect(bulkUpdate).toHaveBeenCalledWith([1, 2, 3], { quantity: 4 });
    });
  });

  it("rejects a fractional quantity before hitting the API", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(
      screen.getByLabelText("Quantity operation"),
      "set"
    );
    await user.type(
      screen.getByLabelText("Quantity", { selector: "input" }),
      "2.5"
    );
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(bulkUpdate).not.toHaveBeenCalled();
  });
});
