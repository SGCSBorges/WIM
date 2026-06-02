import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CommandPalette,
  type CommandItem,
} from "../../components/ui/CommandPalette";

function buildCommands(perform = vi.fn()): CommandItem[] {
  return [
    { id: "go-articles", label: "Go to Articles", group: "Navigate", perform },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      group: "Navigate",
      perform,
    },
    { id: "new-article", label: "New article", group: "Actions", perform },
  ];
}

function renderPalette(
  props: Partial<Parameters<typeof CommandPalette>[0]> = {}
) {
  const onClose = vi.fn();
  render(
    <CommandPalette
      open
      onClose={onClose}
      commands={props.commands ?? buildCommands()}
      placeholder="Search…"
      emptyLabel="No results"
      {...props}
    />
  );
  return { onClose };
}

describe("<CommandPalette />", () => {
  it("lists grouped commands when open", () => {
    renderPalette();
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Go to Articles" })
    ).toBeInTheDocument();
  });

  it("filters by the typed query", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("combobox"), "dashboard");
    expect(
      screen.getByRole("option", { name: "Go to Dashboard" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "New article" })
    ).not.toBeInTheDocument();
  });

  it("shows the empty label when nothing matches", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("runs the active command on Enter and closes", async () => {
    const user = userEvent.setup();
    const perform = vi.fn();
    const { onClose } = renderPalette({ commands: buildCommands(perform) });

    // type() keeps focus on the input (Modal's deferred focus steals it to
    // the dialog in jsdom, where offsetParent is always null).
    await user.type(screen.getByRole("combobox"), "{ArrowDown}{Enter}");

    expect(perform).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("merges async search results", async () => {
    const user = userEvent.setup();
    const search = vi
      .fn()
      .mockResolvedValue([
        { id: "art-1", label: "Drill", group: "Articles", perform: vi.fn() },
      ]);
    renderPalette({ search });

    await user.type(screen.getByRole("combobox"), "dri");
    expect(
      await screen.findByRole("option", { name: "Drill" })
    ).toBeInTheDocument();
    expect(search).toHaveBeenCalled();
  });
});
