import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  featuresAPI: {
    getAccessMap: vi.fn(),
  },
}));

import { featuresAPI } from "../../services/api";
import {
  FeatureProvider,
  useFeature,
  useFeatures,
} from "../../features/features";

const getAccessMap = featuresAPI.getAccessMap as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
});

/** Probe component that surfaces a single flag, the loaded flag + a refresh. */
function Probe() {
  const canShare = useFeature("sharing");
  const { loaded, refresh } = useFeatures();
  return (
    <div>
      <span data-testid="sharing">{canShare ? "yes" : "no"}</span>
      <span data-testid="loaded">{loaded ? "yes" : "no"}</span>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  );
}

describe("FeatureProvider / useFeature", () => {
  it("starts all-false + not-loaded, then reflects the fetched map", async () => {
    getAccessMap.mockResolvedValue({ sharing: true });
    render(
      <FeatureProvider>
        <Probe />
      </FeatureProvider>
    );
    // First paint is the all-false default + loaded=false, before the fetch.
    expect(screen.getByTestId("sharing").textContent).toBe("no");
    expect(screen.getByTestId("loaded").textContent).toBe("no");
    await waitFor(() =>
      expect(screen.getByTestId("sharing").textContent).toBe("yes")
    );
    expect(screen.getByTestId("loaded").textContent).toBe("yes");
  });

  it("marks loaded even when the fetch rejects (logged out)", async () => {
    getAccessMap.mockRejectedValue(new Error("401"));
    render(
      <FeatureProvider>
        <Probe />
      </FeatureProvider>
    );
    // loaded must flip true on the error path too, or route guards hang.
    await waitFor(() =>
      expect(screen.getByTestId("loaded").textContent).toBe("yes")
    );
    expect(screen.getByTestId("sharing").textContent).toBe("no");
  });

  it("refresh() re-fetches and updates the map (e.g. after login)", async () => {
    // Mount logged-out: fetch rejects → all-false.
    getAccessMap.mockRejectedValueOnce(new Error("401"));
    render(
      <FeatureProvider>
        <Probe />
      </FeatureProvider>
    );
    await waitFor(() => expect(getAccessMap).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("sharing").textContent).toBe("no");

    // Simulate a successful login: the next fetch resolves with access.
    getAccessMap.mockResolvedValueOnce({ sharing: true });
    await userEvent.click(screen.getByText("refresh"));
    await waitFor(() =>
      expect(screen.getByTestId("sharing").textContent).toBe("yes")
    );
  });

  it("clears a previously-granted flag when a later fetch denies it", async () => {
    getAccessMap.mockResolvedValueOnce({ sharing: true });
    render(
      <FeatureProvider>
        <Probe />
      </FeatureProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("sharing").textContent).toBe("yes")
    );
    // A logout (or downgrade) → fetch rejects → flag drops back to false.
    getAccessMap.mockRejectedValueOnce(new Error("401"));
    await userEvent.click(screen.getByText("refresh"));
    await waitFor(() =>
      expect(screen.getByTestId("sharing").textContent).toBe("no")
    );
  });
});
