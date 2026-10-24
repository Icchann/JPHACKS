import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MONITORING_REFRESH_INTERVAL_MS,
  useDemoMonitoring,
} from "./use-demo-monitoring";

function MonitoringProbe() {
  const { snapshot } = useDemoMonitoring();
  return <output data-testid="refreshed-at">{snapshot.refreshedAt}</output>;
}

describe("useDemoMonitoring", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1分ごとにデモ監視データの更新時刻を進める", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T01:00:00.000Z"));
    render(<MonitoringProbe />);

    expect(screen.getByTestId("refreshed-at")).toHaveTextContent(
      "2026-10-12T01:00:00.000Z",
    );

    act(() => {
      vi.advanceTimersByTime(MONITORING_REFRESH_INTERVAL_MS);
    });

    expect(screen.getByTestId("refreshed-at")).toHaveTextContent(
      "2026-10-12T01:01:00.000Z",
    );
  });
});
