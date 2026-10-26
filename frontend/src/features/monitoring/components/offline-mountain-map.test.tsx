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

  it("ズームコントロールで拡大縮小ができる", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const zoomInBtn = screen.getByRole("button", { name: "拡大" });
    fireEvent.click(zoomInBtn);
    expect(zoomInBtn).toBeInTheDocument();
  });

  it("ドラッグ操作および全体表示リセットができる", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const canvas = screen.getByLabelText(/山林観測地図/).parentElement;
    expect(canvas).not.toBeNull();
    if (canvas) {
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 180 });
      fireEvent.mouseUp(canvas);
    }

    const resetBtn = screen.getByRole("button", { name: "位置リセット" });
    fireEvent.click(resetBtn);
    expect(resetBtn).toBeInTheDocument();
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

  it("通常表示時のホイール操作（ctrlKey: false）では地図のtransformが変化せず、ctrlKey: trueでのみズームされる", () => {
    render(
      <OfflineMountainMap
        layerStates={DEFAULT_LAYER_STATES}
        onSelectSensor={vi.fn()}
        sensors={DEMO_SENSORS}
      />,
    );

    const svgMap = screen.getByLabelText(/山林観測地図/);
    const canvasContainer = svgMap.parentElement;
    expect(canvasContainer).not.toBeNull();
    if (!canvasContainer) return;

    const initialStyleTransform = svgMap.style.transform;
    expect(initialStyleTransform).toBe("translate(0px, 0px) scale(1)");

    // 通常のホイールスクロール（ctrlKey: false）では地図が動かないこと
    fireEvent.wheel(canvasContainer, {
      deltaX: 30,
      deltaY: 120,
      ctrlKey: false,
    });
    expect(svgMap.style.transform).toBe(initialStyleTransform);

    // Ctrl + ホイール操作（ctrlKey: true）ではズーム倍率が更新されること
    fireEvent.wheel(canvasContainer, {
      deltaY: -100,
      ctrlKey: true,
    });
    expect(svgMap.style.transform).not.toBe(initialStyleTransform);
    expect(svgMap.style.transform).toContain("scale(1.1)");
  });

  it("凡例がSVGの外（aria-label='森林基本図の凡例'）に表示されている", () => {
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
      "ドラッグで移動 / Ctrl(⌘)+ホイールで拡大縮小",
    );
  });
});
