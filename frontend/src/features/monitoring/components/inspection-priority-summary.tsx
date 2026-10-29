/**
 * 現場巡回判断支援・確認候補サマリーおよび工数可視化コンポーネント (Issue #65)
 *
 * 設計意図:
 * 1. 荒天翌朝に現場管理担当者が車載PCを開いた際、「どこから見に行くか」を即座に判断できるよう
 *    姿勢変化や通信途絶が検知された優先地点を一覧提示する。
 * 2. 従来型の全地点巡回と比較した推定移動工数の削減効果を提示し、導入価値を具体化する。
 * 3. 「山網は現地確認を省く結論ではなく、次に確認する場所を考える材料です」という
 *    READMEの免責・思想を明示し、倒木・安全の過剰保証を排除する。
 */

import React, { useMemo } from "react";

import {
  InspectionCandidate,
  InspectionPriorityLevel,
  rankInspectionCandidates,
} from "../inspection-priority";
import type { DemoSensor } from "../types";
import styles from "./inspection-priority-summary.module.css";

type InspectionPrioritySummaryProps = {
  sensors: DemoSensor[];
  currentTimeMs: number;
  onFocusSensor?: (sensorId: string) => void;
};

const PRIORITY_BADGE_CLASS: Record<InspectionPriorityLevel, string> = {
  urgent: styles.priorityBadgeUrgent,
  recommended: styles.priorityBadgeRecommended,
  routine: styles.priorityBadgeRoutine,
  unverified: styles.priorityBadgeUnverified,
};

const PRIORITY_LABEL: Record<InspectionPriorityLevel, string> = {
  urgent: "最優先確認",
  recommended: "本日確認推奨",
  routine: "定常巡回",
  unverified: "未確認・待機",
};

export function InspectionPrioritySummary({
  sensors,
  currentTimeMs,
  onFocusSensor,
}: InspectionPrioritySummaryProps) {
  const rankedCandidates = useMemo(
    () => rankInspectionCandidates(sensors, currentTimeMs),
    [sensors, currentTimeMs],
  );

  const urgentCount = rankedCandidates.filter(
    (c) => c.priority === "urgent",
  ).length;
  const recommendedCount = rankedCandidates.filter(
    (c) => c.priority === "recommended",
  ).length;
  const targetCandidatesCount = urgentCount + recommendedCount;

  // 巡回工数シミュレーション比較（README §利用場面 の想定工数試算）
  // 1地点あたり確認所要時間: 10分、移動時間: 5分と仮定
  const totalSensors = sensors.length;
  const conventionalHours = ((totalSensors * 15) / 60).toFixed(1);
  const prioritizedHours = (
    (Math.max(1, targetCandidatesCount) * 15) /
    60
  ).toFixed(1);

  return (
    <section
      className={styles.container}
      aria-label="巡回判断支援・確認候補地点"
    >
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h3>🌲 今日の確認推奨地点（巡回判断支援）</h3>
          <p>
            荒天後の姿勢変化・通信鮮度に基づき、優先して見に行く場所を提示します
          </p>
        </div>
      </header>

      {/* 確認候補地点一覧 */}
      <div className={styles.candidateList}>
        {rankedCandidates.length === 0 ? (
          <p>登録されている機体が存在しません</p>
        ) : (
          rankedCandidates.map((candidate: InspectionCandidate) => (
            <button
              key={candidate.sensorId}
              type="button"
              className={styles.candidateCard}
              onClick={() => onFocusSensor?.(candidate.sensorId)}
              title={`${candidate.sensorCode}へフォーカス`}
            >
              <div className={styles.candidateMain}>
                <div className={styles.candidateTitleRow}>
                  <span className={styles.sensorCode}>
                    {candidate.sensorCode}
                  </span>
                  <span className={styles.sensorName}>
                    {candidate.sensorName}
                  </span>
                  <span className={PRIORITY_BADGE_CLASS[candidate.priority]}>
                    {PRIORITY_LABEL[candidate.priority]}
                  </span>
                </div>
                <div className={styles.candidateReason}>
                  {candidate.primaryReason}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* 巡回効率・判断工数シミュレーション */}
      <div className={styles.efficiencySection}>
        <div className={styles.efficiencyTitle}>
          📊 巡回計画の効率化シミュレーション（目安）
        </div>
        <div className={styles.efficiencyGrid}>
          <div className={styles.efficiencyCard}>
            <div className={styles.efficiencyLabel}>従来型（全地点確認）</div>
            <div className={styles.efficiencyValue}>
              約{conventionalHours}時間
            </div>
            <div className={styles.efficiencySubtext}>
              全{totalSensors}箇所を均一に巡回
            </div>
          </div>
          <div className={styles.efficiencyCard}>
            <div className={styles.efficiencyLabel}>
              山網支援（変化地点先行）
            </div>
            <div className={styles.efficiencyValue}>
              約{prioritizedHours}時間
            </div>
            <div className={styles.efficiencySubtext}>
              優先{targetCandidatesCount}箇所に初動集中
            </div>
          </div>
        </div>
        <p className={styles.disclaimerText}>
          ※
          山網が提供するのは現地確認を省く結論ではなく、次に確認する場所を考える材料です。天候や現場作業手順と合わせて総合的に巡回順序をご判断ください。
        </p>
      </div>
    </section>
  );
}
