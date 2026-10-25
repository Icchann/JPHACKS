import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { generateQrMatrix, QrCode } from "./qr-code";

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

  it("preserves Dark Module at (21, 8) and places format & data modules properly", () => {
    const matrix = generateQrMatrix(
      "http://192.168.1.10:3000/mobile?mode=test",
    );
    expect(matrix).toHaveLength(29);
    expect(matrix[0]).toHaveLength(29);

    // Dark Module (21, 8) must always be dark (true)
    expect(matrix[21]?.[8]).toBe(true);

    // Top-right format bit at (8, 21) corresponds to formatBits[7] = 0 (false)
    expect(matrix[8]?.[21]).toBe(false);
    // Bottom-left format bit at (28, 8) corresponds to formatBits[0] = 1 (true)
    expect(matrix[28]?.[8]).toBe(true);
  });
});
