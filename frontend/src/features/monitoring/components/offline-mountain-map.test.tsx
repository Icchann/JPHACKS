import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LAYER_STATES,
  DEMO_OVERLAY_PATHS,
  DEMO_OVERLAY_POINTS,
  DEMO_SENSORS,
} from "../demo-data";
import { OfflineMountainMap } from "./offline-mountain-map";

describe("OfflineMountainMap", () => {
  it("renders sensors on the map and handles click", () => {
    const onSelectSensor = vi.fn();
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        mountainName="白神山地 第3工区"
        onSelectSensor={onSelectSensor}
        overlayPaths={DEMO_OVERLAY_PATHS}
        overlayPoints={DEMO_OVERLAY_POINTS}
        sensors={DEMO_SENSORS}
      />,
    );

    // Verify SVG is rendered with aria-label
    const svgMap = screen.getByLabelText("白神山地 第3工区の山林観測地図");
    expect(svgMap).toBeInTheDocument();

    // Verify sensor code badges are rendered
    expect(screen.getByText("DEMO-001")).toBeInTheDocument();
    expect(screen.getByText("DEMO-003")).toBeInTheDocument();

    // Click on a sensor marker
    const s1Marker = screen.getByText("DEMO-001").closest("g");
    expect(s1Marker).not.toBeNull();
    if (s1Marker) {
      fireEvent.click(s1Marker);
      expect(onSelectSensor).toHaveBeenCalledWith(
        expect.objectContaining({ sensorCode: "DEMO-001" }),
      );
    }
  });

  it("PC操作に不慣れな方向けに拡大・縮小・リセットボタンが表示され、クリックでズーム倍率が更新される", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const svgMap = screen.getByLabelText(/山林観測地図/);
    expect(svgMap).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(svgMap.style.transform).toBe("translate(0px, 0px) scale(1)");

    const zoomInBtn = screen.getByRole("button", { name: "拡大" });
    fireEvent.click(zoomInBtn);
    expect(svgMap.style.transform).toContain("scale(1.2)");

    const resetBtn = screen.getByRole("button", { name: "位置リセット" });
    fireEvent.click(resetBtn);
    expect(svgMap.style.transform).toBe("translate(0px, 0px) scale(1)");

    const zoomOutBtn = screen.getByRole("button", { name: "縮小" });
    fireEvent.click(zoomOutBtn);
    expect(svgMap.style.transform).toContain("scale(0.8)");
  });
  it("「全体表示」を押すと画面いっぱいに広がり、「地図の拡大表示を閉じる」で戻る (Issue #12)", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const expandBtn = screen.getByRole("button", { name: "全体表示" });
    fireEvent.click(expandBtn);

    // 閉じるボタンが出現すること
    const closeBtn = screen.getByRole("button", {
      name: "地図の拡大表示を閉じる",
    });
    expect(closeBtn).toBeInTheDocument();

    // 閉じるボタンをクリックすると通常表示に戻ること
    fireEvent.click(closeBtn);
    expect(
      screen.getByRole("button", { name: "全体表示" }),
    ).toBeInTheDocument();
  });

  it("センサーの絞り込みや遠方座標の機体追加を行っても、工区内センサーの描画座標が変化しない (Issue #33)", () => {
    const firstSensor = DEMO_SENSORS[0];
    expect(firstSensor).toBeDefined();
    if (!firstSensor) return;

    const { rerender } = render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const initialMarkerGroup = screen.getByText("DEMO-001").closest("g");
    const initialTransform = initialMarkerGroup?.getAttribute("transform");
    expect(initialTransform).toBeTruthy();

    // 1件のみにフィルタリングしても座標がズレないこと
    rerender(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={[firstSensor]}
      />,
    );
    const filteredMarkerGroup = screen.getByText("DEMO-001").closest("g");
    expect(filteredMarkerGroup?.getAttribute("transform")).toBe(
      initialTransform,
    );

    // 名古屋会場など遠方（工区外）のセンサーを追加しても工区内ピンの座標がズレず、仮設スロットに表示されること
    const offSiteSensor = {
      ...firstSensor,
      id: "offsite-nagoya-01",
      sensorCode: "ESP32-NAGOYA",
      name: "名古屋会場 仮設機",
      latitude: 35.15421,
      longitude: 136.96642,
    };
    rerender(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={[...DEMO_SENSORS, offSiteSensor]}
      />,
    );

    const afterOffSiteMarkerGroup = screen.getByText("DEMO-001").closest("g");
    expect(afterOffSiteMarkerGroup?.getAttribute("transform")).toBe(
      initialTransform,
    );
    expect(
      screen.getByText("📍 工区外・現地仮設スロット（参考配置）"),
    ).toBeInTheDocument();
    expect(screen.getByText("ESP32-NAGOYA")).toBeInTheDocument();
  });

  it("凡例がSVGの外（aria-label='森林基本図の凡例'）に表示され、全体表示の案内がある", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const svgMap = screen.getByLabelText(/山林観測地図/);
    const externalLegend = screen.getByLabelText("森林基本図の凡例");

    expect(externalLegend).toBeInTheDocument();
    expect(svgMap.contains(externalLegend)).toBe(false);
    expect(externalLegend).toHaveTextContent("計曲線 (50m)");
    expect(externalLegend).toHaveTextContent("主曲線 (10m)");
    expect(externalLegend).toHaveTextContent("沢・水系");
    expect(externalLegend).toHaveTextContent("林道・作業道");
    expect(externalLegend).toHaveTextContent("🌲 樹木 / ⛰️ 斜面");
    expect(externalLegend).toHaveTextContent(
      "拡大・縮小ボタン / マウスドラッグで地図を自由に移動できます",
    );
  });
  it("多数の工区外センサーが存在してもスロット枠内に収まりSVG外にはみ出さない", () => {
    // 12台の工区外（遠方）センサーを生成
    const manyOffSiteSensors = Array.from({ length: 12 }, (_, index) => ({
      ...DEMO_SENSORS[0]!,
      id: `offsite-many-${index}`,
      sensorCode: `EXT-${index + 1}`,
      name: `遠方センサー ${index + 1}`,
      latitude: 35.5 + index * 0.01,
      longitude: 138.0 + index * 0.01,
    }));

    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={manyOffSiteSensors}
      />,
    );

    expect(
      screen.getByText("📍 工区外・現地仮設スロット（参考配置）"),
    ).toBeInTheDocument();
    expect(screen.getByText(/12台/)).toBeInTheDocument();

    // 全工区外センサーのX座標が枠内（24〜976）に収まり、SVG幅1000を超えないことを検証
    manyOffSiteSensors.forEach((sensor) => {
      const markerGroup = screen.getByText(sensor.sensorCode).closest("g");
      expect(markerGroup).toBeInTheDocument();
      const transform = markerGroup?.getAttribute("transform") ?? "";
      const match = /translate\(([\d.]+),\s*([\d.]+)\)/.exec(transform);
      expect(match).not.toBeNull();
      const x = Number(match![1]);
      expect(x).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThanOrEqual(976);
    });
  });

  it("工区外のオーバーレイは描画されず、工区内のオーバーレイはlayerStatesに連動する", () => {
    const inBoundPoint = {
      id: "pt-in",
      name: "工区内 湧水",
      layerId: "rest_point" as const,
      subType: "water" as const,
      latitude: 35.001,
      longitude: 137.005,
      description: "工区内の水場",
    };
    const outBoundPoint = {
      id: "pt-out",
      name: "遠方 湧水",
      layerId: "rest_point" as const,
      subType: "water" as const,
      latitude: 36.0,
      longitude: 139.0,
      description: "遠方の水場",
    };

    const { rerender } = render(
      <OfflineMountainMap
        layerStates={{ ...DEFAULT_LAYER_STATES, rest_point: "visible" }}
        onSelectSensor={vi.fn()}
        overlayPoints={[inBoundPoint, outBoundPoint]}
        sensors={DEMO_SENSORS}
      />,
    );

    // 工区内は表示され、工区外は除外されること
    expect(screen.getByText("工区内 湧水")).toBeInTheDocument();
    expect(screen.queryByText("遠方 湧水")).not.toBeInTheDocument();

    // hidden に変更すると非表示になること
    rerender(
      <OfflineMountainMap
        layerStates={{ ...DEFAULT_LAYER_STATES, rest_point: "hidden" }}
        onSelectSensor={vi.fn()}
        overlayPoints={[inBoundPoint, outBoundPoint]}
        sensors={DEMO_SENSORS}
      />,
    );
    expect(screen.queryByText("工区内 湧水")).not.toBeInTheDocument();
  });
});
