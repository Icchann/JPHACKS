/**
 * 現場管理担当者向け確認候補優先度（Inspection Priority）算出ロジック (Issue #65)
 *
 * 設計意図:
 * 1. README §「利用場面」の思想に基づき、倒木や災害を断定予測するのではなく、
 *    荒天翌朝に「今日、どこから見に行くか」の巡回順序を検討する判断材料を提供する。
 * 2. 姿勢変化（傾斜角）と通信状態（途絶時間）を多面的にスコアリングし、
 *    重大変化地点や情報断絶地点を確認候補として高優先度にランク付けする。
 * 3. 未観測・基準未設定を正常と偽装せず、未確認候補として区別する。
 */

import type { DemoSensor } from "./types";

export type InspectionPriorityLevel =
  | "urgent" // 最優先確認（重大傾斜または長時間通信途絶）
  | "recommended" // 確認推奨（注意傾斜または通信途絶）
  | "routine" // 定常巡回時確認（現時点変化なし）
  | "unverified"; // 未確認・観測待機（基準未設定または未受信）

export type InspectionCandidate = {
  sensorId: string;
  sensorCode: string;
  sensorName: string;
  priority: InspectionPriorityLevel;
  score: number; // 0〜100
  primaryReason: string;
  tiltDeg: number | null;
  isStale: boolean;
  lastReceivedAt: string | null;
  latitude: number;
  longitude: number;
};

// スコア計算用定数
const SCORE_MAX = 100;
const SCORE_TILT_DANGER = 50; // 30°以上の危険傾斜
const SCORE_TILT_CAUTION = 35; // 15°以上の注意傾斜
const SCORE_TILT_MINOR = 15; // 5°以上の軽微傾斜
const SCORE_STALE_LONG = 40; // 24時間以上の通信途絶
const SCORE_STALE_SHORT = 20; // 1分以上の通信途絶
const SCORE_THRESHOLD_URGENT = 50;
const SCORE_THRESHOLD_RECOMMENDED = 30;

const ONE_MINUTE_MS = 60_000;
const ONE_DAY_MS = 86_400_000;

/**
 * センサーの現在状態から巡回確認優先度を評価する
 */
export function evaluateInspectionCandidate(
  sensor: DemoSensor,
  currentTimeMs: number,
): InspectionCandidate {
  // 観測未受信または初期状態の場合
  if (!sensor.lastReceivedAt || sensor.observationSeverity === "unknown") {
    return {
      sensorId: sensor.id,
      sensorCode: sensor.sensorCode,
      sensorName: sensor.name,
      priority: "unverified",
      score: 0,
      primaryReason: "観測データ未受信（現地での機体稼働・設置確認が必要）",
      tiltDeg: sensor.tiltValue,
      isStale: true,
      lastReceivedAt: sensor.lastReceivedAt,
      latitude: sensor.latitude,
      longitude: sensor.longitude,
    };
  }

  const receivedMs = Date.parse(sensor.lastReceivedAt);
  const elapsedMs = Number.isFinite(receivedMs)
    ? Math.max(0, currentTimeMs - receivedMs)
    : Number.POSITIVE_INFINITY;
  const isStale = elapsedMs > ONE_MINUTE_MS;
  const isLongStale = elapsedMs > ONE_DAY_MS;

  let score = 0;
  const reasons: string[] = [];

  // 1. 傾斜変化の評価
  const tilt = sensor.tiltValue;
  if (tilt !== null && Number.isFinite(tilt)) {
    if (tilt >= 30.0) {
      score += SCORE_TILT_DANGER;
      reasons.push(`基準姿勢から大幅な傾斜変化 (+${tilt.toFixed(1)}°)`);
    } else if (tilt >= 15.0) {
      score += SCORE_TILT_CAUTION;
      reasons.push(`基準姿勢から注意傾斜を検知 (+${tilt.toFixed(1)}°)`);
    } else if (tilt >= 5.0) {
      score += SCORE_TILT_MINOR;
      reasons.push(`軽微な傾斜傾向 (+${tilt.toFixed(1)}°)`);
    }
  }

  // 2. 通信途絶の評価
  if (isLongStale) {
    score += SCORE_STALE_LONG;
    reasons.push("24時間以上パケット未受信（機体脱落・破損疑い）");
  } else if (isStale) {
    score += SCORE_STALE_SHORT;
    reasons.push("電波途絶中（最終受信から1分以上経過）");
  }

  // 3. 機器異常・低電池の補正
  if (sensor.deviceFaultStatus === "fault") {
    score += 15;
    reasons.push("機器センサー障害を検知");
  }
  if (sensor.lowBattery) {
    score += 10;
    reasons.push("機体バッテリー残量低下");
  }

  const finalScore = Math.min(SCORE_MAX, score);
  let priority: InspectionPriorityLevel = "routine";
  if (finalScore >= SCORE_THRESHOLD_URGENT) {
    priority = "urgent";
  } else if (finalScore >= SCORE_THRESHOLD_RECOMMENDED) {
    priority = "recommended";
  }

  const primaryReason =
    reasons.length > 0
      ? reasons.join(" / ")
      : "基準姿勢を維持・通信良好（定常）";

  return {
    sensorId: sensor.id,
    sensorCode: sensor.sensorCode,
    sensorName: sensor.name,
    priority,
    score: finalScore,
    primaryReason,
    tiltDeg: tilt,
    isStale,
    lastReceivedAt: sensor.lastReceivedAt,
    latitude: sensor.latitude,
    longitude: sensor.longitude,
  };
}

/**
 * 複数センサーの巡回確認優先度をソートして返却する
 * ソート順: urgent (高スコア順) -> recommended -> unverified -> routine
 */
export function rankInspectionCandidates(
  sensors: DemoSensor[],
  currentTimeMs: number,
): InspectionCandidate[] {
  const evaluated = sensors.map((sensor) =>
    evaluateInspectionCandidate(sensor, currentTimeMs),
  );

  return evaluated.sort((a, b) => {
    // スコア降順
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 未確認は定常より優先
    if (a.priority === "unverified" && b.priority === "routine") return -1;
    if (b.priority === "unverified" && a.priority === "routine") return 1;
    return a.sensorCode.localeCompare(b.sensorCode);
  });
}
