/**
 * 確認候補優先度（Inspection Priority）算出ロジックの単体テスト (Issue #65)
 */

import { describe, expect, it } from "vitest";

import {
  evaluateInspectionCandidate,
  rankInspectionCandidates,
} from "./inspection-priority";
import type { DemoSensor } from "./types";

const BASE_SENSOR: DemoSensor = {
  id: "sensor-t1",
  sensorCode: "T1",
  name: "樹木ノードT1",
  latitude: 35.123,
  longitude: 137.987,
  observationSeverity: "normal",
  communicationStatus: "online",
  deviceFaultStatus: "ok",
  lowBattery: false,
  soilMoistureValue: 45,
  tiltValue: 0.8,
  batteryPercent: 90,
  lastReceivedAt: "2026-10-29T10:00:00.000Z",
  source: "device_test",
};

describe("evaluateInspectionCandidate", () => {
  const nowMs = Date.parse("2026-10-29T10:00:30.000Z"); // 30秒後

  it("傾き微小かつ通信正常な場合は routine（定常）となること", () => {
    const candidate = evaluateInspectionCandidate(BASE_SENSOR, nowMs);
    expect(candidate.priority).toBe("routine");
    expect(candidate.score).toBeLessThan(30);
    expect(candidate.primaryReason).toContain("定常");
  });

  it("傾きが18度検知された場合は recommended（確認推奨）となること", () => {
    const tiltedSensor: DemoSensor = {
      ...BASE_SENSOR,
      tiltValue: 18.5,
      observationSeverity: "caution",
    };
    const candidate = evaluateInspectionCandidate(tiltedSensor, nowMs);
    expect(candidate.priority).toBe("recommended");
    expect(candidate.score).toBeGreaterThanOrEqual(35);
    expect(candidate.primaryReason).toContain("注意傾斜");
  });

  it("傾き32度かつ通信途絶時は urgent（最優先確認）となること", () => {
    const urgentSensor: DemoSensor = {
      ...BASE_SENSOR,
      tiltValue: 32.0,
      observationSeverity: "danger",
      lastReceivedAt: "2026-10-28T08:00:00.000Z", // 26時間前
    };
    const candidate = evaluateInspectionCandidate(urgentSensor, nowMs);
    expect(candidate.priority).toBe("urgent");
    expect(candidate.score).toBeGreaterThanOrEqual(90);
    expect(candidate.primaryReason).toContain("大幅な傾斜");
    expect(candidate.primaryReason).toContain("24時間以上パケット未受信");
  });

  it("未受信センサーは unverified（未確認）として判定されること", () => {
    const unverifiedSensor: DemoSensor = {
      ...BASE_SENSOR,
      lastReceivedAt: null,
      observationSeverity: "unknown",
    };
    const candidate = evaluateInspectionCandidate(unverifiedSensor, nowMs);
    expect(candidate.priority).toBe("unverified");
    expect(candidate.score).toBe(0);
  });
});

describe("rankInspectionCandidates", () => {
  const nowMs = Date.parse("2026-10-29T10:00:30.000Z");

  it("優先度スコアが高い順にソートされること", () => {
    const s1: DemoSensor = {
      ...BASE_SENSOR,
      id: "1",
      sensorCode: "S1",
      tiltValue: 1.0,
    }; // routine
    const s2: DemoSensor = {
      ...BASE_SENSOR,
      id: "2",
      sensorCode: "S2",
      tiltValue: 22.0,
    }; // recommended
    const s3: DemoSensor = {
      ...BASE_SENSOR,
      id: "3",
      sensorCode: "S3",
      tiltValue: 35.0,
    }; // urgent

    const ranked = rankInspectionCandidates([s1, s2, s3], nowMs);
    expect(ranked[0].sensorCode).toBe("S3"); // urgent
    expect(ranked[1].sensorCode).toBe("S2"); // recommended
    expect(ranked[2].sensorCode).toBe("S1"); // routine
  });
});
