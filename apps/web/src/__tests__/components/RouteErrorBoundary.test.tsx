/**
 * The root boundary in main.tsx wraps the whole tree, so before this existed
 * any render-time throw in a route replaced the entire app — nav included —
 * and the user could not navigate away from the broken screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Component, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router";
import RouteErrorBoundary from "../../components/layout/RouteErrorBoundary";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

let thrown: Error | null = null;
function Boom(): React.ReactElement {
  if (thrown) throw thrown;
  return <p>route content</p>;
}

/** Stands in for main.tsx's root boundary, to prove what escapes this one. */
class OuterBoundary extends Component<
  { children: ReactNode },
  { hit: boolean }
> {
  state = { hit: false };
  static getDerivedStateFromError() {
    return { hit: true };
  }
  render() {
    return this.state.hit ? (
      <p>root boundary caught it</p>
    ) : (
      this.props.children
    );
  }
}

function Shell() {
  const navigate = useNavigate();
  return (
    <>
      <nav aria-label="Primary navigation">
        <button onClick={() => navigate("/elsewhere")}>Go elsewhere</button>
      </nav>
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>
    </>
  );
}

function renderShell() {
  return render(
    <OuterBoundary>
      <MemoryRouter initialEntries={["/articles"]}>
        <I18nProvider>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </I18nProvider>
      </MemoryRouter>
    </OuterBoundary>
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  thrown = null;
  // React logs every caught render error; the boundary logs its own too.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("<RouteErrorBoundary />", () => {
  it("contains a route error and leaves the surrounding nav usable", () => {
    thrown = new Error("kaboom");
    renderShell();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This page hit an error"
    );
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    // The whole point: the shell is still mounted and operable.
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go elsewhere" })).toBeEnabled();
    // And it did NOT escape to the root boundary.
    expect(
      screen.queryByText("root boundary caught it")
    ).not.toBeInTheDocument();
  });

  it("re-renders the route in place when Try again is clicked", async () => {
    thrown = new Error("kaboom");
    renderShell();
    await screen.findByRole("alert");

    thrown = null;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("route content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when the user navigates away", async () => {
    thrown = new Error("kaboom");
    renderShell();
    await screen.findByRole("alert");

    thrown = null;
    await userEvent.click(screen.getByRole("button", { name: "Go elsewhere" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("route content")).toBeInTheDocument();
  });

  it("re-throws a stale-deploy chunk error so the root boundary can reload", () => {
    // Catching this here would swallow the reload that recovers from a
    // deploy having invalidated the hashed chunk filename.
    const chunkError = new Error("Failed to fetch dynamically imported module");
    chunkError.name = "ChunkLoadError";
    thrown = chunkError;
    renderShell();

    expect(screen.getByText("root boundary caught it")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
