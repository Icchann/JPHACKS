import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_SENSORS } from "../../monitoring/demo-data";
import { SensorDetail } from "./sensor-detail";

function getDemoSensor(id: string) {
  const sensor = DEMO_SENSORS.find((candidate) => candidate.id === id);
  if (!sensor) {
    throw new Error(`テスト用センサーが見つかりません: ${id}`);
  }
  return sensor;
}

describe("SensorDetail", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("概要に観測重要度と機器状態を分けて表示する", () => {
    render(
      <SensorDetail
        returnPath="/map"
        sensor={getDemoSensor("demo-sensor-001")}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "北沢 上流" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("危険")).toHaveLength(2);
    expect(screen.getByText("オンライン")).toBeInTheDocument();
    expect(screen.getByText("故障なし")).toBeInTheDocument();
    expect(screen.getAllByText("傾斜").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /編集/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "地図へ戻る" })).toHaveAttribute(
      "href",
      "/map",
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "概要",
      "グラフ",
      "異常履歴未実装",
      "現地確認履歴未実装",
    ]);
  });

  it("土壌水分と傾斜を別グラフで表示し未確定項目を明示する", () => {
    render(
      <SensorDetail
        returnPath="/map"
        sensor={getDemoSensor("demo-sensor-001")}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "グラフ" }));

    expect(
      screen.getByRole("img", { name: "土壌水分のデモ時系列グラフ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "傾斜のデモ時系列グラフ" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("単位: 未設定")).toHaveLength(2);
    expect(screen.getAllByText("しきい値: 未設定")).toHaveLength(2);
  });

  it("欠測値を0に置き換えず未取得として表示する", () => {
    render(
      <SensorDetail
        returnPath="/map"
        sensor={getDemoSensor("demo-sensor-006")}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText("観測値未取得")).toHaveLength(2);
    expect(screen.getByText("故障")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "グラフ" }));
    expect(
      screen.getAllByText("観測データをまだ受信していません"),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("img", { name: /時系列グラフ/ }),
    ).not.toBeInTheDocument();
  });

  it("通信断では最終受信時点の値であることを明示する", () => {
    render(
      <SensorDetail
        returnPath="/map"
        sensor={getDemoSensor("demo-sensor-004")}
      />,
    );

    expect(screen.getAllByText("通信断")).toHaveLength(2);
    expect(
      screen.getByText("最終受信時点の値を表示しています。"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("最終受信時点・単位未設定")).toHaveLength(2);
  });

  it("矢印キーとEndキーでタブを切り替えられる", () => {
    render(
      <SensorDetail
        returnPath="/map"
        sensor={getDemoSensor("demo-sensor-001")}
      />,
    );

    const overviewTab = screen.getByRole("tab", { name: "概要" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

    const chartTab = screen.getByRole("tab", { name: "グラフ" });
    expect(chartTab).toHaveFocus();
    expect(chartTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(chartTab, { key: "End" });
    const inspectionTab = screen.getByRole("tab", {
      name: "現地確認履歴未実装",
    });
    expect(inspectionTab).toHaveFocus();
    expect(inspectionTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: "現地確認履歴は未実装です" }),
    ).toBeInTheDocument();
  });

  it("センサー管理から開いた場合は管理画面へ戻れる", () => {
    render(
      <SensorDetail
        returnPath="/sensors"
        sensor={getDemoSensor("demo-sensor-001")}
      />,
    );

    expect(
      screen.getByRole("link", { name: "センサー管理へ戻る" }),
    ).toHaveAttribute("href", "/sensors");
  });
});
