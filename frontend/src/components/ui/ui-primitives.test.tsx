import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, HealthBadge, KpiTile, StatusBadge } from "./ui-primitives";

describe("UI primitives", () => {
  it.each([
    ["normal", "正常"],
    ["caution", "注意"],
    ["danger", "危険"],
    ["unknown", "未判定"],
  ] as const)("主状態 %s を文字付きで表示する", (status, label) => {
    render(<StatusBadge label={label} status={status} />);

    expect(screen.getByText(label)).toHaveAttribute("data-status", status);
  });

  it.each([
    ["online", "オンライン"],
    ["offline", "通信断"],
    ["ok", "故障なし"],
    ["lowBattery", "低電池"],
    ["fault", "故障"],
    ["unknown", "未接続"],
  ] as const)("ヘルス状態 %s を主状態と別に表示する", (status, label) => {
    render(<HealthBadge label={label} status={status} />);

    expect(screen.getByText(label)).toHaveAttribute("data-status", status);
  });

  it("KPIの未取得を0件と区別する", () => {
    const { rerender } = render(<KpiTile label="危険" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(<KpiTile label="危険" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("無効なボタンを操作不可にする", () => {
    render(<Button disabled>CSV一括登録</Button>);

    expect(screen.getByRole("button", { name: "CSV一括登録" })).toBeDisabled();
  });
});
