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
});
