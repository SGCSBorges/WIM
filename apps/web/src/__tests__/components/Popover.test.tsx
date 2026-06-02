import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "../../components/ui/Popover";

function renderPopover(onOpen = vi.fn()) {
  render(
    <div>
      <Popover
        ariaLabel="Notifications"
        button={() => <span>bell</span>}
        onOpen={onOpen}
      >
        {(close) => (
          <div>
            <p>panel body</p>
            <button onClick={close}>close me</button>
          </div>
        )}
      </Popover>
      <button>outside</button>
    </div>
  );
}

describe("<Popover />", () => {
  it("is closed until the trigger is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderPopover(onOpen);

    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("panel body")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
  });

  it("exposes a close callback to the panel", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("button", { name: "close me" }));
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
  });
});
