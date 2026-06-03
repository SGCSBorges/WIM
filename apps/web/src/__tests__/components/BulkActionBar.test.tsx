import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BulkActionBar from "../../components/articles/BulkActionBar";
import { I18nProvider } from "../../i18n/i18n";

function renderBar(
  overrides: Partial<React.ComponentProps<typeof BulkActionBar>> = {}
) {
  const props: React.ComponentProps<typeof BulkActionBar> = {
    selectedCount: 3,
    canShare: true,
    busy: false,
    locations: [{ locationId: 1, name: "Home" }],
    tags: [{ tagId: 5, name: "tools" }],
    onClear: vi.fn(),
    onDelete: vi.fn(),
    onShare: vi.fn(),
    onUnshare: vi.fn(),
    onAssignLocation: vi.fn(),
    onAssignTag: vi.fn(),
    onEditFields: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(
      <I18nProvider>
        <BulkActionBar {...props} />
      </I18nProvider>
    ),
  };
}

describe("<BulkActionBar />", () => {
  it("renders nothing when the selection is empty", () => {
    const { container } = renderBar({ selectedCount: 0 });
    expect(container.firstChild).toBeNull();
  });

  it("wires the Delete, Share, Unshare, and Clear buttons to their handlers", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /share publicly/i }));
    fireEvent.click(screen.getByRole("button", { name: /unshare/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onShare).toHaveBeenCalledTimes(1);
    expect(props.onUnshare).toHaveBeenCalledTimes(1);
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("hides Share / Unshare when the caller can't share (USER role)", () => {
    renderBar({ canShare: false });
    expect(
      screen.queryByRole("button", { name: /share publicly/i })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /unshare/i })).toBeNull();
  });

  it("invokes onAssignLocation with the chosen id when the dropdown changes", () => {
    const { props } = renderBar();
    fireEvent.change(screen.getByLabelText(/add to location/i), {
      target: { value: "1" },
    });
    expect(props.onAssignLocation).toHaveBeenCalledWith(1);
  });

  it("disables every action while busy", () => {
    renderBar({ busy: true });
    for (const name of [
      /delete selected/i,
      /share publicly/i,
      /unshare/i,
      /clear selection/i,
    ]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});
