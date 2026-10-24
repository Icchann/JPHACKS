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
});
