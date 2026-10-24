import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEMO_DASHBOARD_OBSERVATIONS,
  DEMO_REFERENCE_TIME,
} from "../demo-dashboard-data";
import { DEMO_SENSORS } from "../../monitoring/demo-data";
import { DashboardHome } from "./dashboard-home";

describe("DashboardHome", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("M5先行のデモダッシュボードを描画する", () => {
    render(<DashboardHome />);

    expect(
      screen.getByRole("heading", { name: "ダッシュボード" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "アクティブ警告" }),
    ).toBeInTheDocument();
    expect(screen.getByText("架空データを表示中")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "土壌水分のデモ時系列グラフ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "傾斜のデモ時系列グラフ" }),
    ).toBeInTheDocument();
  });

  it("警告から対象センサー付きの地図へ移動できる", () => {
    render(<DashboardHome />);

    const mapLinks = screen.getAllByRole("link", { name: /地図で確認/ });
    expect(mapLinks[0]).toHaveAttribute("href", "/map?focus=demo-sensor-001");
  });

  it("センサー管理へ移動できる", () => {
    render(<DashboardHome />);

    expect(screen.getByRole("link", { name: "センサー管理" })).toHaveAttribute(
      "href",
      "/sensors",
    );
  });

  it("期間指定とセンサー比較の選択を切り替えられる", () => {
    render(<DashboardHome />);

    fireEvent.click(screen.getByRole("button", { name: "期間指定" }));
    expect(screen.getByLabelText("開始日")).toBeInTheDocument();
    expect(screen.getByLabelText("終了日")).toBeInTheDocument();

    const sensorCheckbox = screen.getByRole("checkbox", {
      name: /DEMO-001 北沢 上流/,
    });
    expect(sensorCheckbox).toBeChecked();
    fireEvent.click(sensorCheckbox);
    expect(sensorCheckbox).not.toBeChecked();
  });

  it("各センサーの最新履歴が地図用の現在値と一致する", () => {
    for (const sensor of DEMO_SENSORS) {
      const latest = DEMO_DASHBOARD_OBSERVATIONS.find(
        (observation) =>
          observation.sensorId === sensor.id &&
          observation.measuredAt === DEMO_REFERENCE_TIME,
      );

      expect(latest?.soilMoistureValue).toBe(sensor.soilMoistureValue);
      expect(latest?.tiltValue).toBe(sensor.tiltValue);
    }
  });
});
