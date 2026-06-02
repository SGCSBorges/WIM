import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useHotkeys } from "../../hooks/useHotkeys";

function Harness({
  bindings,
  enabled,
}: {
  bindings: Record<string, () => void>;
  enabled?: boolean;
}) {
  useHotkeys(bindings, { enabled });
  return <input aria-label="field" />;
}

describe("useHotkeys", () => {
  it("fires a single-key binding", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<Harness bindings={{ c: onCreate }} />);

    await user.keyboard("c");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("ignores plain keys while typing in a field", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { getByLabelText } = render(<Harness bindings={{ c: onCreate }} />);

    getByLabelText("field").focus();
    await user.keyboard("c");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("matches a two-key sequence", async () => {
    const user = userEvent.setup();
    const goArticles = vi.fn();
    render(<Harness bindings={{ "g a": goArticles }} />);

    await user.keyboard("ga");
    expect(goArticles).toHaveBeenCalledTimes(1);
  });

  it("fires mod+key even while typing in a field", async () => {
    const user = userEvent.setup();
    const openPalette = vi.fn();
    const { getByLabelText } = render(
      <Harness bindings={{ "mod+k": openPalette }} />
    );

    getByLabelText("field").focus();
    await user.keyboard("{Control>}k{/Control}");
    expect(openPalette).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<Harness bindings={{ c: onCreate }} enabled={false} />);

    await user.keyboard("c");
    expect(onCreate).not.toHaveBeenCalled();
  });
});
