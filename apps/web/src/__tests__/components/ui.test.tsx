import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  Button,
  Field,
  Input,
  Tabs,
  ConfirmDialog,
  Pagination,
  Segmented,
  Badge,
  PageHeader,
} from "../../components/ui";

describe("Button", () => {
  it("renders children and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("loading disables the button and marks it busy", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("Field + Input", () => {
  it("associates the label with the control and exposes the error", () => {
    render(
      <Field label="Email" error="Required">
        <Input type="email" />
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ];
  it("marks the active tab selected and uses the id prefix", () => {
    render(
      <Tabs
        tabs={tabs}
        value="a"
        onChange={() => {}}
        idPrefix="x"
        aria-label="t"
      />
    );
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha).toHaveAttribute("aria-selected", "true");
    expect(alpha).toHaveAttribute("id", "x-a");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("arrow keys move selection", async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={tabs}
        value="a"
        onChange={onChange}
        idPrefix="x"
        aria-label="t"
      />
    );
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("ConfirmDialog", () => {
  it("shows content and routes confirm/cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete?");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("Pagination", () => {
  it("hides when everything fits on one page", () => {
    const { container } = render(
      <Pagination
        page={1}
        limit={50}
        total={20}
        onPage={() => {}}
        prevLabel="Prev"
        nextLabel="Next"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("disables prev on the first page and pages forward", async () => {
    const onPage = vi.fn();
    render(
      <Pagination
        page={1}
        limit={10}
        total={25}
        onPage={onPage}
        prevLabel="Prev"
        nextLabel="Next"
      />
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe("Segmented", () => {
  it("is a radiogroup that reports the selected value", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Filter"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "Open" },
        ]}
      />
    );
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await userEvent.click(screen.getByRole("radio", { name: "Open" }));
    expect(onChange).toHaveBeenCalledWith("open");
  });
});

describe("Badge + PageHeader", () => {
  it("renders a badge with its label", () => {
    render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("PageHeader renders title, subtitle and breadcrumbs", () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Articles"
          subtitle="Your inventory"
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Articles" }]}
        />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "Articles" })
    ).toBeInTheDocument();
    expect(screen.getByText("Your inventory")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });
});
