import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHealthStatus } from "./api-health-status";

describe("ApiHealthStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("APIが正常なとき接続済みと表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", service: "sanmou-api" }),
      }),
    );

    render(<ApiHealthStatus />);

    expect(await screen.findByText("API 接続済み")).toBeInTheDocument();
  });

  it("APIへ接続できないときエラーを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("接続失敗")));

    render(<ApiHealthStatus />);

    expect(await screen.findByText("API に接続できません")).toBeInTheDocument();
  });
});
