import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TestObservationResponse } from "../test-observation-types";

import { TestDashboardHome } from "./test-dashboard-home";

const RESPONSE: TestObservationResponse = {
  items: [
    {
      received_at: "2026-09-30T18:30:11.171+09:00",
      node_id: "T1",
      seq: 247,
      hop: 0,
      sample_ms: 672755,
      ax_mg: -1,
      ay_mg: 0,
      az_mg: 96,
      soil_raw: null,
      battery_mv: null,
    },
  ],
  file_exists: true,
  invalid_row_count: 0,
  source: "device_test",
  refreshed_at: "2026-09-30T09:30:12.000Z",
};

describe("TestDashboardHome", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CSV APIの実測値をデモ値へ変換せず表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<TestDashboardHome />);

    expect(
      screen.getByRole("heading", { name: "実証実験ダッシュボード" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText("T1").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("-1 mg")).toBeInTheDocument();
    expect(screen.getAllByText("未計測")).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "3軸加速度の実証実験時系列グラフ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("実証実験 TEST")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test-observations", {
      cache: "no-store",
    });
  });

  it("土壌生値と電池電圧を別々のグラフで表示し、未計測センチネル値-1を除外する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...RESPONSE,
          items: [
            {
              received_at: "2026-09-30T18:30:10.000+09:00",
              node_id: "T2",
              seq: 1,
              hop: 0,
              sample_ms: 500,
              ax_mg: 0,
              ay_mg: 0,
              az_mg: 1000,
              soil_raw: 800,
              battery_mv: 3300,
            },
            {
              received_at: "2026-09-30T18:30:11.171+09:00",
              node_id: "T1",
              seq: 1,
              hop: 0,
              sample_ms: 1000,
              ax_mg: 10,
              ay_mg: 20,
              az_mg: 980,
              soil_raw: 1200,
              battery_mv: -1,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<TestDashboardHome />);

    expect(
      await screen.findByRole("img", {
        name: "土壌水分 生値の実証実験時系列グラフ",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,200 raw")).toBeInTheDocument();
    expect(screen.getByText("未計測")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "T2" })).toBeInTheDocument();
  });
  it("CSVが未作成なら受信待ちを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...RESPONSE,
          items: [],
          file_exists: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<TestDashboardHome />);

    expect(
      await screen.findByText("CSVの作成を待っています"),
    ).toBeInTheDocument();
  });
});
