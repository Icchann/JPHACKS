import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

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
      name: /警報音を停止して確認/,
    });
    fireEvent.click(dismissBtn);

    // Should return to normal state
    expect(screen.getByText("正常監視中")).toBeInTheDocument();
  });

  it("allows switching to GPS registration tab, NFC identification, and immediate submission without disabled lock", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sensor-t1", sensor_code: "T1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const regTabBtn = screen.getByRole("tab", { name: "📍 機体GPS設置登録" });
    fireEvent.click(regTabBtn);

    expect(screen.getByText("機体GPS・時刻固定登録")).toBeInTheDocument();

    // Default venue coordinates are pre-populated so submit button is immediately touchable (not disabled)
    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByText("35.154210° N")).toBeInTheDocument();
    expect(screen.getByText("136.966420° E")).toBeInTheDocument();

    // Identify S1 via NFC tag button
    const s1Chip = screen.getByRole("button", { name: "S1" });
    fireEvent.click(s1Chip);
    expect(screen.getByText("NFC認識済: S1")).toBeInTheDocument();

    // Submit registration
    fireEvent.click(submitBtn);
    expect(
      await screen.findByText(/機体 S1 を現在地.*でPC台帳に登録しました/),
    ).toBeInTheDocument();
  });

  it("opens directly in registration tab when launched via NFC deep link", () => {
    render(
      <MobileHome
        dataMode="test"
        initialNodeId="T2"
        initialTab="register"
        isNfcLaunch={true}
      />,
    );

    expect(
      screen.getByText(/NFCタグから機体「T2」を自動識別しました/),
    ).toBeInTheDocument();
    expect(screen.getByText("NFC認識済: T2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("T2")).toBeInTheDocument();
  });

  it("allows setting baseline posture calibration and calculating relative angle", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    // Baseline should now be confirmed
    expect(screen.getByText(/🎯 基準姿勢確定済み/)).toBeInTheDocument();
    expect(screen.getByText(/ax=10, ay=20, az=980 mg/)).toBeInTheDocument();
    expect(screen.getByText(/\(基準差\)/)).toBeInTheDocument();
  });

  it("未受信の実機テストモード（S1）では架空の 3280 mV / 1420 ADC を表示せず、基準確定も拒否する (Issue #27)", async () => {
    render(<MobileHome dataMode="test" initialNodeId="S1" />);

    expect(screen.queryByText(/3280 mV/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1420 ADC/)).not.toBeInTheDocument();
    expect(screen.getAllByText("待機中")).toHaveLength(3);

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    expect(
      await screen.findByText(
        /有効な実機観測データを受信していないため、基準姿勢を確定できません/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PCへ同期しました/)).not.toBeInTheDocument();
  });

  it("基準姿勢の POST /api/test-baseline が失敗したときは同期成功と偽装せず通信エラーを表示する (Issue #27)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "sync failed" }), { status: 500 }),
    );

    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    expect(
      await screen.findByText(/PCへの基準同期に失敗しました（通信エラー）/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PCへ同期しました/)).not.toBeInTheDocument();
  });

  it("圏外保存時に localStorage.setItem が例外を投げた場合は保存成功と表示せず警告を出す (Issue #30)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(
        /端末ストレージへの保存に失敗しました（容量不足またはブラウザ制限）/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/スマホ内に保存しました/),
    ).not.toBeInTheDocument();
  });
});
