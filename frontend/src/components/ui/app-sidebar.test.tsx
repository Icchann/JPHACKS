import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  it("現在画面をaria-currentで示す", () => {
    render(
      <AppSidebar activePath="/sensors" demoDescription="架空データを表示中" />,
    );

    expect(screen.getByRole("link", { name: "センサー管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "地図" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("未定義・後続の画面は表示しない", () => {
    render(
      <AppSidebar activePath="/map" demoDescription="架空データを表示中" />,
    );

    expect(screen.queryByText("異常履歴")).not.toBeInTheDocument();
    expect(screen.queryByText("設定")).not.toBeInTheDocument();
  });

  it("実証実験環境の表示へ差し替えられる", () => {
    render(
      <AppSidebar
        activePath="/dashboard"
        demoDescription="受信CSVを確認中"
        environmentLabel="実証実験 TEST"
      />,
    );

    expect(screen.getByText("実証実験 TEST")).toBeInTheDocument();
    expect(screen.queryByText("デモモード")).not.toBeInTheDocument();
  });

  it("トグルボタンで開閉コールバックが呼ばれる", () => {
    let toggleCalled = false;
    render(
      <AppSidebar
        activePath="/map"
        demoDescription="架空データ"
        isOpen={true}
        onToggle={() => {
          toggleCalled = true;
        }}
      />,
    );

    const toggleBtn = screen.getByRole("button", {
      name: "ナビゲーションを折りたたむ",
    });
    toggleBtn.click();
    expect(toggleCalled).toBe(true);
  });
});
