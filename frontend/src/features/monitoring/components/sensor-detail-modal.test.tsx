import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEMO_SENSORS } from "../demo-data";
import { SensorDetailModal } from "./sensor-detail-modal";

describe("SensorDetailModal", () => {
  it("renders sensor detail when sensor is provided and closes on click", () => {
    const onClose = vi.fn();
    const sensor = DEMO_SENSORS[0]; // S1

    render(<SensorDetailModal onClose={onClose} sensor={sensor} />);

    // Verify dialog exists
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Verify sensor name and code
    expect(screen.getByText("DEMO-001")).toBeInTheDocument();
    expect(screen.getByText(sensor.name)).toBeInTheDocument();

    // Verify full link is present
    const fullLink = screen.getByRole("link", {
      name: /全画面・別タブで詳細を開く/,
    });
    expect(fullLink).toHaveAttribute(
      "href",
      `/sensors/${encodeURIComponent(sensor.id)}?from=map`,
    );

    // Click close button
    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<SensorDetailModal onClose={onClose} sensor={DEMO_SENSORS[0]} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders null when sensor is null", () => {
    const { container } = render(
      <SensorDetailModal onClose={vi.fn()} sensor={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
