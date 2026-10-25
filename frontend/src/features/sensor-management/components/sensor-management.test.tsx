import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SensorManagement } from "./sensor-management";

describe("SensorManagement", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("test環境では検証用DBのセンサーを読み込む", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/test-observations")) {
        return new Response(
          JSON.stringify({
            items: [],
            file_exists: false,
            invalid_row_count: 0,
            source: "device_test",
            refreshed_at: "2026-10-12T08:30:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "test-sensor-id",
              sensor_code: "T1",
              name: "北沢 上流",
              latitude: 35.0042,
              longitude: 137.0091,
              observation_severity: "unknown",
              communication_status: "unknown",
              device_fault_status: "unknown",
              low_battery: null,
              last_received_at: null,
              source: "device_test",
            },
          ],
          next_cursor: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    render(<SensorManagement dataMode="test" />);

    expect(screen.getByText("検証DB")).toBeInTheDocument();
    expect(screen.getByText("test環境")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("T1")).toBeInTheDocument());
    expect(screen.getByText("1件を表示")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "T1の状態を確認" }),
    ).toHaveAttribute("href", "/sensors/test-sensor-id?from=sensors");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/test-sensors?limit=200",
      { cache: "no-store" },
    );
  });

  it("デモセンサーをカード一覧で表示する", () => {
    render(<SensorManagement />);

    expect(
      screen.getByRole("heading", { name: "センサー管理" }),
    ).toBeInTheDocument();
    expect(screen.getByText("6件を表示")).toBeInTheDocument();
    expect(screen.getByText("変更は保存されません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CSV一括登録/ })).toBeDisabled();
    expect(
      within(screen.getByRole("list", { name: "センサー一覧" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(6);
    expect(
      screen.getByRole("link", { name: "DEMO-001の状態を確認" }),
    ).toHaveAttribute("href", "/sensors/demo-sensor-001?from=sensors");
  });

  it("センサーIDで一覧を絞り込む", () => {
    render(<SensorManagement />);
    const sensorList = screen.getByRole("list", { name: "センサー一覧" });

    fireEvent.change(
      screen.getByRole("searchbox", { name: "センサーを検索" }),
      { target: { value: "DEMO-002" } },
    );

    expect(screen.getByText("1件を表示")).toBeInTheDocument();
    expect(within(sensorList).getByText("DEMO-002")).toBeInTheDocument();
    expect(within(sensorList).queryByText("DEMO-003")).not.toBeInTheDocument();
  });

  it("未観測のデモセンサーを登録する", () => {
    render(<SensorManagement />);

    const createButton = screen.getByRole("button", { name: "センサーを登録" });
    fireEvent.click(createButton);
    const sensorCodeInput = screen.getByLabelText(/センサーID/);
    expect(sensorCodeInput).toHaveFocus();
    fireEvent.change(sensorCodeInput, {
      target: { value: "DEMO-007" },
    });
    fireEvent.change(screen.getByLabelText(/名称/), {
      target: { value: "北沢 下流" },
    });
    fireEvent.change(screen.getByLabelText(/緯度/), {
      target: { value: "35.0042" },
    });
    fireEvent.change(screen.getByLabelText(/経度/), {
      target: { value: "137.0091" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録する" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "DEMO-007をデモ上で登録しました",
    );
    expect(screen.getByText("7件を表示")).toBeInTheDocument();
    const newCard = screen.getByText("DEMO-007").closest("li");
    expect(newCard).not.toBeNull();
    expect(within(newCard!).getAllByText("未判定")).toHaveLength(2);
    expect(within(newCard!).getByText("未接続")).toBeInTheDocument();
    expect(within(newCard!).getByText("未受信")).toBeInTheDocument();
    expect(
      within(newCard!).getByRole("button", {
        name: "DEMO-007の状態は未取得",
      }),
    ).toBeDisabled();
    expect(
      within(newCard!).queryByRole("link", { name: /状態を確認/ }),
    ).not.toBeInTheDocument();
  });

  it("重複IDと座標範囲を検証する", () => {
    render(<SensorManagement />);

    fireEvent.click(screen.getByRole("button", { name: "センサーを登録" }));
    fireEvent.change(screen.getByLabelText(/センサーID/), {
      target: { value: "demo-001" },
    });
    fireEvent.change(screen.getByLabelText(/名称/), {
      target: { value: "重複テスト" },
    });
    fireEvent.change(screen.getByLabelText(/緯度/), {
      target: { value: "91" },
    });
    fireEvent.change(screen.getByLabelText(/経度/), {
      target: { value: "181" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録する" }));

    expect(
      screen.getByText("同じセンサーIDが登録されています"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("緯度は-90から90の範囲で入力してください"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("経度は-180から180の範囲で入力してください"),
    ).toBeInTheDocument();
  });

  it("登録済みセンサーの名称と座標を編集する", () => {
    render(<SensorManagement />);

    fireEvent.click(screen.getByRole("button", { name: "DEMO-001を編集" }));
    const sensorId = screen.getByLabelText(/センサーID/);
    expect(sensorId).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/名称/), {
      target: { value: "北沢 最上流" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "DEMO-001をデモ上で更新しました",
    );
    expect(screen.getByText("北沢 最上流")).toBeInTheDocument();
  });

  it("編集画面を閉じたら起点のボタンへフォーカスを戻す", () => {
    render(<SensorManagement />);
    const editButton = screen.getByRole("button", { name: "DEMO-001を編集" });

    fireEvent.click(editButton);
    expect(screen.getByLabelText(/名称/)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "編集画面を閉じる" }));

    expect(editButton).toHaveFocus();
  });

  it("編集画面のTab移動をダイアログ内で循環させる", () => {
    render(<SensorManagement />);
    fireEvent.click(screen.getByRole("button", { name: "DEMO-001を編集" }));
    const dialog = screen.getByRole("dialog");
    const closeButton = screen.getByRole("button", {
      name: "編集画面を閉じる",
    });
    const submitButton = screen.getByRole("button", { name: "変更を保存" });

    submitButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(submitButton).toHaveFocus();
  });

  it("「削除」ボタンをクリックすると確認後にセンサーが一覧から削除される", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SensorManagement dataMode="demo" />);

    expect(screen.getByText("DEMO-001")).toBeInTheDocument();
    const deleteBtn = screen.getByRole("button", { name: "DEMO-001を削除" });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText("DEMO-001")).not.toBeInTheDocument();
    expect(screen.getByText(/DEMO-001.*削除しました/)).toBeInTheDocument();
  });

  it("test環境で受信履歴クリアを行うと観測データと基準姿勢を両方リセットする", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/test-sensors")) {
          return new Response(
            JSON.stringify({ items: [], next_cursor: null }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url === "/api/test-observations") {
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });

    render(<SensorManagement dataMode="test" />);
    await waitFor(() =>
      expect(screen.getByText("0件を表示")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /受信履歴クリア/ }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "古い観測履歴をクリアしました。",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/test-observations", {
      method: "DELETE",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/test-baseline", {
      method: "DELETE",
    });
  });
});
