import { describe, expect, it } from "vitest";

import type { TestObservation } from "../dashboard/test-observation-types";
import { evaluateLiveSensorState } from "./evaluate-live-sensor-state";
import type { DemoSensor } from "./types";

const BASE_UNOBSERVED_SENSOR: DemoSensor = {
  id: "reg-t1",
  sensorCode: "T1",
  name: "実機 樹木ノード T1",
  latitude: 35.012,
  longitude: 136.432,
  observationSeverity: "unknown",
  communicationStatus: "unknown",
  deviceFaultStatus: "unknown",
  lowBattery: false,
  soilMoistureValue: null,
  tiltValue: null,
  batteryPercent: null,
  lastReceivedAt: null,
  source: "device_test",
};

const SAMPLE_OBSERVATION: TestObservation = {
  received_at: "2026-10-26T10:00:00.000Z",
  node_id: "T1",
  seq: 12,
  hop: 0,
  sample_ms: 12000,
  ax_mg: 0,
  ay_mg: 0,
  az_mg: 1000,
  soil_raw: 1000,
  battery_mv: 3200,
};

describe("evaluateLiveSensorState", () => {
  it("未受信（latestObservation === null）のとき台帳の初期状態 unknown をそのまま保持し normal や ok に偽装しない (Issue #28)", () => {
    const nowMs = Date.parse("2026-10-26T10:00:10.000Z");
    const evaluated = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      null,
      null,
      nowMs,
      false,
    );

    expect(evaluated.observationSeverity).toBe("unknown");
    expect(evaluated.communicationStatus).toBe("unknown");
    expect(evaluated.deviceFaultStatus).toBe("unknown");
    expect(evaluated.tiltValue).toBeNull();
    expect(evaluated.soilMoistureValue).toBeNull();
    expect(evaluated.batteryPercent).toBeNull();
  });

  it("基準未設定時は仮角度を算出しつつも、重要度は normal にせず unknown（未判定）とする (Issue #28)", () => {
    const nowMs = Date.parse("2026-10-26T10:00:10.000Z");
    const evaluated = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      {
        ...SAMPLE_OBSERVATION,
        ax_mg: 176,
        ay_mg: 0,
        az_mg: 984,
      },
      null,
      nowMs,
      false,
    );

    expect(evaluated.communicationStatus).toBe("online");
    expect(evaluated.tiltValue).toBe(10.1);
    expect(evaluated.observationSeverity).toBe("unknown");
    expect(evaluated.deviceFaultStatus).toBe("unknown");
  });

  it("基準設定済みかつオンライン時は相対角度差に応じて normal / caution / danger を一貫判定する", () => {
    const nowMs = Date.parse("2026-10-26T10:00:10.000Z");
    const uprightBaseline = {
      ax: 0,
      ay: 0,
      az: 1000,
      setAt: "19:00:00",
    };

    const normalState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      SAMPLE_OBSERVATION,
      uprightBaseline,
      nowMs,
      false,
    );
    expect(normalState.tiltValue).toBe(0);
    expect(normalState.observationSeverity).toBe("normal");
    expect(normalState.communicationStatus).toBe("online");

    // 約10度傾斜（注意: 5.0°以上15.0°未満）
    const cautionState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      { ...SAMPLE_OBSERVATION, ax_mg: 174, ay_mg: 0, az_mg: 985 },
      uprightBaseline,
      nowMs,
      false,
    );
    expect(cautionState.tiltValue).toBe(10);
    expect(cautionState.observationSeverity).toBe("caution");

    // 約20度傾斜（危険: 15.0°以上）
    const dangerState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      { ...SAMPLE_OBSERVATION, ax_mg: 342, ay_mg: 0, az_mg: 940 },
      uprightBaseline,
      nowMs,
      false,
    );
    expect(dangerState.tiltValue).toBe(20);
    expect(dangerState.observationSeverity).toBe("danger");
  });

  it("最終受信から60秒を超過したとき、またはAPIエラー発生時は offline に遷移し、古い値から normal と断定しない (Issue #31)", () => {
    const uprightBaseline = {
      ax: 0,
      ay: 0,
      az: 1000,
      setAt: "19:00:00",
    };

    // 61秒経過後
    const staleNowMs = Date.parse("2026-10-26T10:01:01.000Z");
    const staleState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      SAMPLE_OBSERVATION,
      uprightBaseline,
      staleNowMs,
      false,
    );
    expect(staleState.communicationStatus).toBe("offline");
    expect(staleState.observationSeverity).toBe("unknown");

    // 10秒経過でもAPIエラーが発生している場合
    const freshTimeWithApiError = Date.parse("2026-10-26T10:00:10.000Z");
    const errorState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      SAMPLE_OBSERVATION,
      uprightBaseline,
      freshTimeWithApiError,
      true,
    );
    expect(errorState.communicationStatus).toBe("offline");
    expect(errorState.observationSeverity).toBe("unknown");
  });

  it("全軸ゼロ（seq=0 初期化レコード）のときは角度を null、重要度を unknown とする", () => {
    const nowMs = Date.parse("2026-10-26T10:00:05.000Z");
    const zeroState = evaluateLiveSensorState(
      BASE_UNOBSERVED_SENSOR,
      { ...SAMPLE_OBSERVATION, ax_mg: 0, ay_mg: 0, az_mg: 0 },
      { ax: 0, ay: 0, az: 1000 },
      nowMs,
      false,
    );

    expect(zeroState.tiltValue).toBeNull();
    expect(zeroState.observationSeverity).toBe("unknown");
    expect(zeroState.communicationStatus).toBe("online");
  });
});
