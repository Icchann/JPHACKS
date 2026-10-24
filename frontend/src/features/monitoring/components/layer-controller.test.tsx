import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LAYER_STATES } from "../demo-data";
import { LayerController } from "./layer-controller";

describe("LayerController", () => {
  it("renders trigger button and toggles open/close", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <LayerController
        activePreset="disaster"
        isOpen={false}
        layerStates={DEFAULT_LAYER_STATES}
        onLayerChange={vi.fn()}
        onPresetChange={vi.fn()}
        onToggleOpen={onToggle}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "地図の表示レイヤーを切り替える",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByLabelText("地図レイヤー設定パネル"),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <LayerController
        activePreset="disaster"
        isOpen={true}
        layerStates={DEFAULT_LAYER_STATES}
        onLayerChange={vi.fn()}
        onPresetChange={vi.fn()}
        onToggleOpen={onToggle}
      />,
    );

    expect(screen.getByLabelText("地図レイヤー設定パネル")).toBeInTheDocument();
  });

  it("handles layer visibility changes and preset changes", () => {
    const onLayerChange = vi.fn();
    const onPresetChange = vi.fn();

    render(
      <LayerController
        activePreset="disaster"
        isOpen={true}
        layerStates={DEFAULT_LAYER_STATES}
        onLayerChange={onLayerChange}
        onPresetChange={onPresetChange}
        onToggleOpen={vi.fn()}
      />,
    );

    // Click preset
    const planningBtn = screen.getByRole("button", { name: /作業計画/ });
    fireEvent.click(planningBtn);
    expect(onPresetChange).toHaveBeenCalledWith("planning");

    // Click toggle on rest point layer
    const restPointGroup = screen.getByRole("group", {
      name: "休憩・詰所・水場の表示状態",
    });
    const fadeBtn = restPointGroup.querySelector('button[title*="30%透過"]');
    expect(fadeBtn).not.toBeNull();
    if (fadeBtn) {
      fireEvent.click(fadeBtn);
      expect(onLayerChange).toHaveBeenCalledWith("rest_point", "faded");
    }
  });
});
