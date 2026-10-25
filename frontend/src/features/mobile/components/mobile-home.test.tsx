import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileHome } from "./mobile-home";

// Mock useTestObservations
vi.mock("../../dashboard/use-test-observations", () => ({
  useTestObservations: () => ({
    data: {
      items: [
        {
          timestamp: "2026-10-25T10:00:00Z",
          packet_type: "S0",
          node_id: "T1",
          seq: 1,
          hop: 1,
          sample_ms: 100,
          ax_mg: 10,
          ay_mg: 20,
          az_mg: 980,
          soil_raw: 1420,
          battery_mv: 3280,
        },
      ],
    },
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

describe("MobileHome", () => {
  it("renders normal monitoring tab and triggers emergency alarm on button click", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    expect(screen.getByText("山網 現場モバイル")).toBeInTheDocument();
    expect(screen.getByText("正常監視中")).toBeInTheDocument();
    expect(screen.getByText(/監視対象: T1/)).toBeInTheDocument();

    // Trigger test alarm
    const testTriggerBtn = screen.getByRole("button", {
      name: "⚠️ 警報アラートを実演テスト発火",
    });
    fireEvent.click(testTriggerBtn);

    // Screen should switch to alarm state
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("大きな姿勢変化を検知！")).toBeInTheDocument();

    // Dismiss alarm
    const dismissBtn = screen.getByRole("button", {
      name: "警報を確認して停止",
    });
    fireEvent.click(dismissBtn);

    // Should return to normal state
    expect(screen.getByText("正常監視中")).toBeInTheDocument();
  });

  it("allows switching to GPS registration tab and setting venue preset", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const regTabBtn = screen.getByRole("tab", { name: "📍 機体GPS設置登録" });
    fireEvent.click(regTabBtn);

    expect(screen.getByText("機体GPS・時刻固定登録")).toBeInTheDocument();

    // Apply venue preset
    const presetBtn = screen.getByRole("button", {
      name: "🏛️ 会場（名古屋）座標を即時セット",
    });
    fireEvent.click(presetBtn);

    expect(screen.getByText("35.154210° N")).toBeInTheDocument();
    expect(screen.getByText("136.966420° E")).toBeInTheDocument();
  });

  it("allows setting baseline posture calibration and calculating relative angle", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const baselineBtn = screen.getByRole("button", {
      name: "🎯 タニ直立時の姿勢を「基準姿勢」に確定",
    });
    fireEvent.click(baselineBtn);

    // Baseline should now be confirmed
    expect(screen.getByText(/🎯 基準姿勢確定済み/)).toBeInTheDocument();
    expect(screen.getByText(/ax=10, ay=20, az=980 mg/)).toBeInTheDocument();
    expect(screen.getByText(/\(基準差\)/)).toBeInTheDocument();
  });
});
