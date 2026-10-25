import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QrCode } from "./qr-code";

describe("QrCode", () => {
  it("renders SVG QR code with proper aria-label and rect modules", () => {
    const testUrl = "http://172.20.10.2:3000/mobile";
    render(<QrCode value={testUrl} size={180} />);

    const svg = screen.getByLabelText(`QRコード: ${testUrl}`);
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");

    // Finder patterns and data modules should be present as rects
    const rects = svg.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(50);
  });
});
