import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "../../components/common/Toast";

function Trigger({
  message,
  ttl,
  withAction,
}: {
  message: string;
  ttl?: number | null;
  withAction?: boolean;
}) {
  const toast = useToast();
  return (
    <button
      onClick={() =>
        toast.show(message, {
          kind: "info",
          ttl,
          action: withAction
            ? { label: "Undo", onClick: vi.fn() }
            : undefined,
        })
      }
    >
      fire
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast auto-dismiss + hover pause", () => {
  it("auto-dismisses after the default ttl when no action is present", () => {
    render(
      <ToastProvider>
        <Trigger message="hello" />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("fire"));
    });
    expect(screen.getByText("hello")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByText("hello")).toBeNull();
  });

  it("uses a longer ttl when an Undo action is attached", () => {
    render(
      <ToastProvider>
        <Trigger message="deleted" withAction />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("fire"));
    });
    // The 5-second mark would have cleared a no-action toast; with an action
    // the 8s default keeps it alive.
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByText("deleted")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("deleted")).toBeNull();
  });

  it("pauses the timer while the pointer is over the toast", () => {
    render(
      <ToastProvider>
        <Trigger message="pause-me" />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("fire"));
    });
    const toastEl = screen.getByText("pause-me").parentElement!;
    act(() => {
      fireEvent.mouseEnter(toastEl);
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("pause-me")).toBeInTheDocument();
    act(() => {
      fireEvent.mouseLeave(toastEl);
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByText("pause-me")).toBeNull();
  });
});
