import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "../../components/common/Modal";

function renderModal(variant?: "center" | "side", onClose = vi.fn()) {
  render(
    <Modal open onClose={onClose} titleId="t" variant={variant}>
      <h2 id="t">Sheet title</h2>
      <button type="button">inside</button>
    </Modal>
  );
  return onClose;
}

describe("<Modal /> side variant", () => {
  it("is a labelled dialog pinned to the right edge, scrolling itself", () => {
    renderModal("side");
    const dialog = screen.getByRole("dialog", { name: "Sheet title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-variant", "side");
    // Full-height, own scroll — the list behind it must not move.
    expect(dialog.className).toContain("h-full");
    expect(dialog.className).toContain("overflow-y-auto");
    // The wrapper pushes the panel to the end of the row.
    expect(dialog.parentElement?.className).toContain("justify-end");
  });

  it("still closes on Escape", () => {
    const onClose = renderModal("side");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the centered geometry by default", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-variant", "center");
    expect(dialog.parentElement?.className).toContain("items-center");
  });
});
