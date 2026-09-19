/**
 * Error boundary for the routed content area.
 *
 * The root boundary (main.tsx) wraps the entire tree, so a render-time throw
 * inside one route replaced the whole application — sidebar and top bar
 * included — leaving the user on a dead screen with no way to navigate out.
 * This boundary sits INSIDE AppShell, so the shell survives and the fallback
 * occupies only the content pane. The error clears by itself when the user
 * navigates elsewhere, and "Try again" re-renders the same route in place.
 *
 * Chunk-load errors are re-thrown on purpose: they mean a deploy invalidated
 * a hashed filename, and the root boundary's reload is the right response.
 * Catching them here would swallow that recovery.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { isChunkLoadError } from "../../utils/chunkError";
import { Button } from "../ui";

interface InnerProps {
  children: ReactNode;
  /** Current path — a change clears a caught error (the user navigated away). */
  pathname: string;
  labels: {
    title: string;
    body: string;
    retry: string;
    home: string;
  };
  onHome: () => void;
}

interface InnerState {
  error: Error | null;
}

class RouteErrorBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { error: null };

  static getDerivedStateFromError(error: Error): InnerState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: InnerProps) {
    // Navigating away from a broken route heals it. Compare the path rather
    // than keying the boundary on it, which would remount the route on every
    // navigation (and drop component state on a param-only change).
    if (this.state.error && prev.pathname !== this.props.pathname) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Let the root boundary handle a stale-deploy chunk failure.
    if (isChunkLoadError(error)) throw error;

    const { labels, onHome } = this.props;
    return (
      <div
        role="alert"
        className="ui-card mx-auto max-w-lg p-8 text-center animate-scale-in"
      >
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-danger/15 text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mb-2 text-xl font-bold ui-title">{labels.title}</h1>
        <p className="mb-2 text-sm ui-text-muted">{labels.body}</p>
        <p className="mb-5 font-mono text-xs ui-text-muted">{error.message}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            onClick={() => this.setState({ error: null })}
            leftIcon={<RotateCw className="h-4 w-4" />}
          >
            {labels.retry}
          </Button>
          <Button variant="ghost" onClick={onHome}>
            {labels.home}
          </Button>
        </div>
      </div>
    );
  }
}

export default function RouteErrorBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <RouteErrorBoundaryInner
      pathname={pathname}
      onHome={() => navigate("/")}
      labels={{
        title: t("error.route.title"),
        body: t("error.route.body"),
        retry: t("error.route.retry"),
        home: t("error.route.home"),
      }}
    >
      {children}
    </RouteErrorBoundaryInner>
  );
}
