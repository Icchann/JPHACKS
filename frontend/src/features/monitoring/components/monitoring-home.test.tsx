import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitoringHome } from "./monitoring-home";

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push }),
}));

describe("MonitoringHome", () => {
  afterEach(() => {
    window.localStorage.clear();
    routerMocks.push.mockClear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("M1の監視情報とオフライン山林マップ・パンくずを描画する", () => {
    render(<MonitoringHome />);

    expect(
      screen.getByRole("heading", { name: "センサー監視" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("デモ")).not.toHaveLength(0);
    expect(
      screen.getByRole("complementary", { name: "警告パネル" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "パンくずリスト" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "地図の表示レイヤーを切り替える" }),
    ).toBeInTheDocument();
    expect(screen.getByText("6台を表示")).toBeInTheDocument();
  });

  it("オフラインマップ上のセンサーピンをクリックすると詳細モーダルが開く", () => {
    render(<MonitoringHome initialMapEngine="offline_svg" />);

    const sensorMarker = screen.getByText("DEMO-001").closest("g");
    expect(sensorMarker).not.toBeNull();
    if (sensorMarker) {
      fireEvent.click(sensorMarker);
    }

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("北沢 上流")).toBeInTheDocument();
  });

  it("センサーIDでフォールバック一覧を絞り込む", () => {
    render(<MonitoringHome initialMapEngine="satellite_google" />);
    const mapFallback = screen.getByRole("region", {
      name: "衛星地図フォールバック",
    });

    fireEvent.change(
      screen.getByRole("searchbox", { name: "センサーを検索" }),
      {
        target: { value: "DEMO-002" },
      },
    );

    expect(screen.getByText("1台を表示")).toBeInTheDocument();
    expect(within(mapFallback).getByText("DEMO-002")).toBeInTheDocument();
    expect(within(mapFallback).queryByText("DEMO-003")).not.toBeInTheDocument();
  });

  it("センサー選択時に同一タブ内で詳細へ遷移する", () => {
    render(<MonitoringHome initialMapEngine="satellite_google" />);
    const mapFallback = screen.getByRole("region", {
      name: "衛星地図フォールバック",
    });

    fireEvent.click(
      within(mapFallback).getByRole("button", { name: /DEMO-001/ }),
    );

    expect(routerMocks.push).toHaveBeenCalledWith(
      "/sensors/demo-sensor-001?from=map",
    );
  });

  it("警告一覧と地図フォールバックの選択状態を同期する", () => {
    render(<MonitoringHome initialMapEngine="satellite_google" />);
    const warningPanel = screen.getByRole("complementary", {
      name: "警告パネル",
    });
    const mapFallback = screen.getByRole("region", {
      name: "衛星地図フォールバック",
    });
    const dangerAlert = within(warningPanel).getByRole("button", {
      name: /傾斜.*DEMO-001/,
    });
    const searchBox = screen.getByRole("searchbox", {
      name: "センサーを検索",
    });

    fireEvent.change(searchBox, { target: { value: "DEMO-002" } });
    fireEvent.click(dangerAlert);
    const dangerSensor = within(mapFallback).getByRole("button", {
      name: /DEMO-001/,
    });
    expect(searchBox).toHaveValue("");
    expect(dangerAlert).toHaveAttribute("aria-pressed", "true");
    expect(dangerSensor).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      within(mapFallback).getByRole("button", { name: /DEMO-002/ }),
    );
    expect(dangerAlert).toHaveAttribute("aria-pressed", "false");
    expect(
      within(warningPanel).getByRole("button", {
        name: /土壌水分.*DEMO-002/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(routerMocks.push).toHaveBeenCalledWith(
      "/sensors/demo-sensor-002?from=map",
    );
  });

  it("1分更新後も選択中の警告を維持する", () => {
    vi.useFakeTimers();
    render(<MonitoringHome />);
    const warningPanel = screen.getByRole("complementary", {
      name: "警告パネル",
    });
    const dangerAlert = within(warningPanel).getByRole("button", {
      name: /傾斜.*DEMO-001/,
    });

    fireEvent.click(dangerAlert);
    fireEvent.click(screen.getByRole("button", { name: "全域表示" }));
    act(() => vi.advanceTimersByTime(60_000));

    expect(dangerAlert).toHaveAttribute("aria-pressed", "true");
  });

  it("実装済み画面へ移動でき、未定義画面は表示しない", () => {
    render(<MonitoringHome />);

    expect(
      screen.getByRole("link", { name: "ダッシュボード" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "センサー管理" })).toHaveAttribute(
      "href",
      "/sensors",
    );
    expect(screen.queryByText("異常履歴")).not.toBeInTheDocument();
    expect(screen.queryByText("設定")).not.toBeInTheDocument();
  });

  it("実機モード時は台帳APIから登録センサーを取得し、デモセンサーを表示しない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/test-sensors")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "reg-1",
                sensor_code: "T1",
                name: "実機 登録木ノードT1",
                latitude: 35.1234,
                longitude: 137.5678,
                observation_severity: "normal",
                communication_status: "online",
                device_fault_status: "ok",
                low_battery: false,
                last_received_at: "2026-10-25T09:00:00Z",
                source: "device_test",
              },
            ],
            next_cursor: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    });

    render(<MonitoringHome dataMode="test" />);

    expect(await screen.findByText("T1")).toBeInTheDocument();
    expect(screen.queryByText("DEMO-001")).not.toBeInTheDocument();
    expect(screen.queryByText("DEMO-005")).not.toBeInTheDocument();
  });

  it("「📱 スマホで開く（QR）」ボタンを押すとQRコード＆NFCモーダルが開く", () => {
    render(<MonitoringHome dataMode="demo" />);

    const openBtn = screen.getByRole("button", {
      name: "📱 スマホで開く（QR）",
    });
    fireEvent.click(openBtn);

    expect(
      screen.getByRole("dialog", {
        name: "📱 現場スマホで開く（QRコード & NFC）",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/NFCタグで開く場合/)).toBeInTheDocument();
  });
});
