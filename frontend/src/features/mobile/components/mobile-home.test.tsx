import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHome } from "./mobile-home";

// Mock useTestObservations
vi.mock("../../dashboard/use-test-observations", () => ({
  useTestObservations: () => ({
    data: {
      items: [
        {
          timestamp: "2026-10-25T10:00:00Z",
          packet_type: "S0",
          node_id: "T1",
          seq: 1,
          hop: 1,
          sample_ms: 100,
          ax_mg: 10,
          ay_mg: 20,
          az_mg: 980,
          soil_raw: 1420,
          battery_mv: 3280,
        },
      ],
    },
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

describe("MobileHome", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders normal monitoring tab and triggers emergency alarm on button click", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    expect(screen.getByText("山網 現場モバイル")).toBeInTheDocument();
    expect(screen.getByText("正常監視中")).toBeInTheDocument();
    expect(screen.getByText(/監視対象: T1/)).toBeInTheDocument();

    // Trigger test alarm
    const testTriggerBtn = screen.getByRole("button", {
      name: "⚠️ 警報アラートを実演テスト発火",
    });
    fireEvent.click(testTriggerBtn);

    // Screen should switch to alarm state
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("大きな姿勢変化を検知！")).toBeInTheDocument();

    // Dismiss alarm
    const dismissBtn = screen.getByRole("button", {
      name: /警報音を停止して確認/,
    });
    fireEvent.click(dismissBtn);

    // Should return to normal state
    expect(screen.getByText("正常監視中")).toBeInTheDocument();
  });

  it("allows switching to GPS registration tab, NFC identification, and immediate submission without disabled lock", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sensor-t1", sensor_code: "T1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const regTabBtn = screen.getByRole("tab", { name: "📍 機体GPS設置登録" });
    fireEvent.click(regTabBtn);
    expect(screen.getByText("機体の設置登録")).toBeInTheDocument();
    // Default venue coordinates are pre-populated so submit button is immediately touchable (not disabled)
    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByText("35.154210° N")).toBeInTheDocument();
    expect(screen.getByText("136.966420° E")).toBeInTheDocument();

    // Identify S1 via chip button
    const s1Chip = screen.getByRole("button", { name: "S1" });
    fireEvent.click(s1Chip);
    expect(screen.getByText(/手動選択:\s*S1/)).toBeInTheDocument();
    // Submit registration
    fireEvent.click(submitBtn);
    expect(
      await screen.findByText(/機体 S1 を現在地.*でPC台帳に登録しました/),
    ).toBeInTheDocument();
  });

  it("opens directly in registration tab when launched via NFC deep link", () => {
    render(
      <MobileHome
        dataMode="test"
        initialNodeId="T2"
        initialTab="register"
        isNfcLaunch={true}
      />,
    );

    expect(
      screen.getByText(/NFCタグから機体「T2」を自動識別しました/),
    ).toBeInTheDocument();
    expect(screen.getByText("NFC認識済: T2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("T2")).toBeInTheDocument();
  });

  it("allows setting baseline posture calibration and calculating relative angle", () => {
    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    // Baseline should now be confirmed
    expect(screen.getByText(/🎯 直立基準（0°）確定済み/)).toBeInTheDocument();
    expect(screen.getByText(/🟢 正常・直立/)).toBeInTheDocument();
  });

  it("未受信の実機テストモード（S1）では架空の 3280 mV / 1420 ADC を表示せず、基準確定も拒否する (Issue #27)", async () => {
    render(<MobileHome dataMode="test" initialNodeId="S1" />);

    expect(screen.queryByText(/3280 mV/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1420/)).not.toBeInTheDocument();

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    expect(
      await screen.findByText(
        /有効な実機観測データを受信していないため、基準姿勢を確定できません/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PCへ同期しました/)).not.toBeInTheDocument();
  });

  it("基準姿勢の POST /api/test-baseline が失敗したときは同期成功と偽装せず通信エラーを表示する (Issue #27)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "sync failed" }), { status: 500 }),
    );

    render(<MobileHome dataMode="test" initialNodeId="T1" />);

    const baselineBtn = screen.getByRole("button", {
      name: /タニ直立時の姿勢を「基準姿勢」に確定/,
    });
    fireEvent.click(baselineBtn);

    expect(
      await screen.findByText(/PCへの基準同期に失敗しました（通信エラー）/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PCへ同期しました/)).not.toBeInTheDocument();
  });

  it("圏外保存時に localStorage.setItem が例外を投げた場合は保存成功と表示せず警告を出す (Issue #30)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(
        /端末ストレージへの保存に失敗しました（容量不足またはブラウザ制限）/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/スマホ内に保存しました/),
    ).not.toBeInTheDocument();
  });

  it("Web NFC 非対応環境でスキャンボタンを押した際に成功偽装せず、正直な案内メッセージを表示する (Issue #42)", () => {
    // window.NDEFReader が未定義の環境（iOS Safari、HTTP接続等）
    delete window.NDEFReader;

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const scanBtn = screen.getByRole("button", {
      name: "📲 NFCタグをスキャンして機体を識別",
    });
    fireEvent.click(scanBtn);

    // 虚偽の「NFCタグ識別により機体を識別しました」が表示されないこと
    expect(
      screen.queryByText(/NFCタグ識別により機体.*を識別しました/),
    ).not.toBeInTheDocument();
    // 正直な非対応案内メッセージが表示されること
    expect(
      screen.getByText(
        /ご利用のブラウザ・環境はWeb NFC直接読取に対応していません/,
      ),
    ).toBeInTheDocument();
  });

  it("GPS未測位・会場プリセット時に ±5m 等の架空精度を表示せず、未測位と明示する (Issue #42)", () => {
    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    // 初期表示で架空の精度（±3m、±5m等）が表示されないこと
    expect(screen.queryByText(/±[0-9]+m/)).not.toBeInTheDocument();
    expect(
      screen.getByText("未測位（参考プリセット座標）"),
    ).toBeInTheDocument();

    // 会場プリセットボタンを押しても架空精度は付与されないこと
    const presetBtn = screen.getByRole("button", {
      name: "🏛️ 会場（名古屋）座標を即時セット",
    });
    fireEvent.click(presetBtn);

    expect(screen.queryByText(/±[0-9]+m/)).not.toBeInTheDocument();
    expect(
      screen.getByText("未測位（参考プリセット座標）"),
    ).toBeInTheDocument();
  });

  it("test環境とdemo環境で未同期キューが分離され、demoの同期でtestのキューが消去されない (Issue #49)", async () => {
    // test環境の未同期キューにT1を事前保存
    window.localStorage.setItem(
      "sanmou_pending_registrations_test",
      JSON.stringify([
        {
          sensor_code: "T1",
          name: "樹木ノード T1",
          latitude: 35.1,
          longitude: 137.0,
          capturedAt: "2026/10/27 10:00:00",
          sourceMethod: "gps",
        },
      ]),
    );

    // demoモードで画面を表示
    render(
      <MobileHome dataMode="demo" initialNodeId="T2" initialTab="register" />,
    );

    // demo環境のキューは空であること（testのT1がdemoに混入しない）
    expect(screen.queryByText(/未同期: 1件/)).not.toBeInTheDocument();

    // test環境のキューが消去されず維持されていること
    const testRaw = window.localStorage.getItem(
      "sanmou_pending_registrations_test",
    );
    expect(testRaw).toContain("T1");
  });

  it("APIが401 Unauthorizedを返した際に圏外保存と誤魔化さず、パスコード警告を表示する (Issue #50)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    // 401時は「現場操作パスコードが無効または未設定」の警告が出ること
    expect(
      await screen.findByText(
        /現場操作パスコードが無効または未設定のためPC台帳に登録できません/,
      ),
    ).toBeInTheDocument();

    // 圏外保存（スマホ内に保存しました）と誤認表示されないこと
    expect(
      screen.queryByText(/スマホ内に保存しました/),
    ).not.toBeInTheDocument();
  });

  it("パスコード設定時は X-Sanmou-Operator-Token ヘッダーを付けて送信する (Issue #50)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sensor-1", sensor_code: "T1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 事前にパスコードを設定
    window.localStorage.setItem("sanmou_operator_token", "my-secret-pin");

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    // パスコード設定中のバッジが出ていること
    expect(await screen.findByText("✓ 設定中")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    await screen.findByText(/PC台帳に登録しました/);

    // fetch 呼び出しに X-Sanmou-Operator-Token が含まれていること
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test-sensors",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Sanmou-Operator-Token": "my-secret-pin",
        }),
      }),
    );
  });

  it("409 Conflict時にnext_cursorを追跡して200件超の既存機体を特定・更新できる (Issue #48)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let pageCount = 0;

    fetchSpy.mockImplementation(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : "";
      if (url.includes("/api/test-baseline")) {
        return new Response(
          JSON.stringify({ baselines: {}, activeAlerts: {} }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (
        url.includes("/api/test-sensors") &&
        (!init || init.method === "POST")
      ) {
        return new Response(
          JSON.stringify({ detail: "sensor code already exists" }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.includes("/api/test-sensors") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ id: "target-sensor-t1", sensor_code: "T1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/test-sensors")) {
        pageCount += 1;
        if (pageCount === 1) {
          // 1ページ目 (200件) -> 該当なし、next_cursorあり
          return new Response(
            JSON.stringify({
              items: [{ id: "other-1", sensor_code: "OTHER1" }],
              next_cursor: "cursor-page-2",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        // 2ページ目 (201件目以降) -> T1発見！
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "target-sensor-t1",
                sensor_code: "T1",
                name: "カスタム名称元木01",
                latitude: 34.0,
                longitude: 136.0,
              },
            ],
            next_cursor: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    });

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    // 2ページ目を経由して再設置更新に成功すること
    expect(
      await screen.findByText(/再設置更新.*に更新しました/),
    ).toBeInTheDocument();

    // PATCH 呼び出しが 2ページ目で特定した ID target-sensor-t1 に対して行われ、カスタム名称を既定名で上書きしていないこと
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test-sensors/target-sensor-t1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.not.stringContaining("タニ装着ノード"),
      }),
    );
  });

  it("同一座標の再送時は不要なPATCHをスキップして冪等に成功する (Issue #48)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let patchCalled = false;

    fetchSpy.mockImplementation(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : "";
      if (url.includes("/api/test-baseline")) {
        return new Response(
          JSON.stringify({ baselines: {}, activeAlerts: {} }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (
        url.includes("/api/test-sensors") &&
        (!init || init.method === "POST")
      ) {
        return new Response(
          JSON.stringify({ detail: "sensor code already exists" }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.includes("/api/test-sensors") && init?.method === "PATCH") {
        patchCalled = true;
        return new Response(JSON.stringify({ id: "target-sensor-t1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/test-sensors")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "target-sensor-t1",
                sensor_code: "T1",
                name: "タニ装着ノード（木ノードT1）",
                latitude: 35.15421,
                longitude: 136.96642,
              },
            ],
            next_cursor: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    });

    render(
      <MobileHome dataMode="test" initialNodeId="T1" initialTab="register" />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    // 不要な PATCH を発行せず冪等に成功すること
    expect(
      await screen.findByText(/再設置更新.*に更新しました/),
    ).toBeInTheDocument();
    // PATCH が呼ばれていないこと（冪等性）
    expect(patchCalled).toBe(false);
  });

  it("設置登録時に installed_at, identity_method, position_method の設置メタデータを送信・保存する (Issue #47)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : "";
        if (url.includes("/api/test-baseline")) {
          return new Response(
            JSON.stringify({ baselines: {}, activeAlerts: {} }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.includes("/api/test-sensors")) {
          return new Response(
            JSON.stringify({ id: "sensor-created", sensor_code: "T1" }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("{}", { status: 200 });
      });

    render(
      <MobileHome
        dataMode="test"
        initialNodeId="T1"
        initialTab="register"
        isNfcLaunch={true}
      />,
    );

    const submitBtn = screen.getByRole("button", {
      name: "この位置・時刻で機体を固定登録",
    });
    fireEvent.click(submitBtn);

    await screen.findByText(/新規登録.*PC台帳に登録しました/);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test-sensors",
      expect.objectContaining({
        method: "POST",
        body: expect.stringMatching(/"identity_method":"url"/),
      }),
    );
  });
});
