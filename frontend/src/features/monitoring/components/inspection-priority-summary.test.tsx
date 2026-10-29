/**
 * 巡回判断支援・確認候補サマリーUIの単体テスト (Issue #65)
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectionPrioritySummary } from "./inspection-priority-summary";
import type { DemoSensor } from "../types";

const MOCK_SENSORS: DemoSensor[] = [
  {
    id: "sensor-1",
    sensorCode: "T1",
    name: "樹木ノードT1",
    latitude: 35.1,
    longitude: 137.1,
    observationSeverity: "danger",
    communicationStatus: "online",
    deviceFaultStatus: "ok",
    lowBattery: false,
    soilMoistureValue: null,
    tiltValue: 35.2,
    batteryPercent: 88,
    lastReceivedAt: "2026-10-29T10:00:00.000Z",
    source: "device_test",
  },
  {
    id: "sensor-2",
    sensorCode: "T2",
    name: "樹木ノードT2",
    latitude: 35.2,
    longitude: 137.2,
    observationSeverity: "normal",
    communicationStatus: "online",
    deviceFaultStatus: "ok",
    lowBattery: false,
    soilMoistureValue: null,
    tiltValue: 1.0,
    batteryPercent: 95,
    lastReceivedAt: "2026-10-29T10:00:00.000Z",
    source: "device_test",
  },
];

describe("InspectionPrioritySummary", () => {
  const nowMs = Date.parse("2026-10-29T10:00:30.000Z");

  it("確認候補地点と優先度バッジが正しく表示されること", () => {
    render(
      <InspectionPrioritySummary
        sensors={MOCK_SENSORS}
        currentTimeMs={nowMs}
      />,
    );

    expect(
      screen.getByText("🌲 今日の確認推奨地点（巡回判断支援）"),
    ).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("最優先確認")).toBeInTheDocument();
    expect(screen.getByText("T2")).toBeInTheDocument();
    expect(screen.getByText("定常巡回")).toBeInTheDocument();
  });

  it("カードクリック時に onFocusSensor が発火すること", () => {
    const handleFocus = vi.fn();

    render(
      <InspectionPrioritySummary
        sensors={MOCK_SENSORS}
        currentTimeMs={nowMs}
        onFocusSensor={handleFocus}
      />,
    );

    const t1Btn = screen.getByRole("button", { name: /T1/i });
    fireEvent.click(t1Btn);

    expect(handleFocus).toHaveBeenCalledWith("sensor-1");
  });

  it("README免責注記が表示されていること", () => {
    render(
      <InspectionPrioritySummary
        sensors={MOCK_SENSORS}
        currentTimeMs={nowMs}
      />,
    );

    expect(
      screen.getByText(
        /山網が提供するのは現地確認を省く結論ではなく、次に確認する場所を考える材料です/,
      ),
    ).toBeInTheDocument();
  });
});
