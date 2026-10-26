import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "./route";

describe("/api/test-baseline route (Issue #29)", () => {
  let tempStatePath = "";

  beforeEach(() => {
    tempStatePath = path.join(
      os.tmpdir(),
      `sanmou-baseline-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.SANMOU_BASELINE_STATE_PATH = tempStatePath;
    DELETE(new Request("http://localhost:3000/api/test-baseline"));
  });

  afterEach(() => {
    try {
      if (tempStatePath && fs.existsSync(tempStatePath)) {
        fs.unlinkSync(tempStatePath);
      }
    } catch {
      // 一時ファイル削除失敗時は無視
    }
    delete process.env.SANMOU_BASELINE_STATE_PATH;
  });

  it("空オブジェクト {} や全軸ゼロ（ax=0, ay=0, az=0）の基準登録リクエストを HTTP 400 で拒否する", async () => {
    const emptyResponse = await POST(
      new Request("http://localhost:3000/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyResponse.status).toBe(400);

    const zeroVectorResponse = await POST(
      new Request("http://localhost:3000/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: "T1",
          ax: 0,
          ay: 0,
          az: 0,
        }),
      }),
    );
    expect(zeroVectorResponse.status).toBe(400);
    const errorPayload = (await zeroVectorResponse.json()) as {
      error?: string;
    };
    expect(errorPayload.error).toContain("全軸ゼロ");
  });

  it("機体 T1 の警告中に別機体 S1 の基準姿勢を保存・削除しても、T1 の警告は消えない", async () => {
    // 1. T1 の緊急警報を発火
    const alertResponse = await POST(
      new Request("http://localhost:3000/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeAlert: {
            sensorCode: "T1",
            sensorName: "樹木ノード T1",
            tiltDeg: 22.4,
            reason: "大きな姿勢変化",
            triggeredAt: "2026-10-26T10:00:00.000Z",
          },
        }),
      }),
    );
    expect(alertResponse.status).toBe(200);

    // 2. 別機体 S1 の基準姿勢を保存
    const saveS1Response = await POST(
      new Request("http://localhost:3000/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: "S1",
          ax: -10,
          ay: 15,
          az: 990,
          setAt: "19:00:00",
        }),
      }),
    );
    expect(saveS1Response.status).toBe(200);
    const saveS1Data = (await saveS1Response.json()) as {
      activeAlerts: Record<string, { sensorCode: string; tiltDeg: number }>;
      activeAlert: { sensorCode: string } | null;
      baselines: Record<string, { ax: number; ay: number; az: number }>;
    };

    // S1 の基準が保存されつつ、T1 の警告がそのまま残っていることを検証
    expect(saveS1Data.baselines.S1).toBeDefined();
    expect(saveS1Data.activeAlerts.T1?.sensorCode).toBe("T1");
    expect(saveS1Data.activeAlert?.sensorCode).toBe("T1");

    // 3. S1 の基準を削除しても T1 の警告は残る
    const deleteS1Response = DELETE(
      new Request("http://localhost:3000/api/test-baseline?node_id=S1", {
        method: "DELETE",
      }),
    );
    const deleteS1Data = (await deleteS1Response.json()) as {
      activeAlerts: Record<string, { sensorCode: string }>;
      baselines: Record<string, unknown>;
    };
    expect(deleteS1Data.baselines.S1).toBeUndefined();
    expect(deleteS1Data.activeAlerts.T1?.sensorCode).toBe("T1");

    // 4. T1 の基準姿勢を保存したときは T1 の警報が解除される
    const saveT1Response = await POST(
      new Request("http://localhost:3000/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: "T1",
          ax: 5,
          ay: 10,
          az: 995,
          setAt: "19:01:00",
        }),
      }),
    );
    const saveT1Data = (await saveT1Response.json()) as {
      activeAlerts: Record<string, unknown>;
      activeAlert: unknown;
    };
    expect(saveT1Data.activeAlerts.T1).toBeUndefined();
    expect(saveT1Data.activeAlert).toBeNull();

    // 5. GET でも永続化された状態を取得できる
    const getResponse = GET(
      new Request("http://localhost:3000/api/test-baseline?node_id=T1"),
    );
    const getData = (await getResponse.json()) as {
      baseline: { ax: number; ay: number; az: number } | null;
      activeAlerts: Record<string, unknown>;
    };
    expect(getData.baseline?.az).toBe(995);
    expect(getData.activeAlerts).toEqual({});
  });
});
