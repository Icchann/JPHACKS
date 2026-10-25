import Link from "next/link";
import React, { useEffect, useId } from "react";

import { HealthBadge, StatusBadge } from "../../../components/ui/ui-primitives";
import type { DemoSensor } from "../types";
import { Icon } from "./icon";
import styles from "./sensor-detail-modal.module.css";

type SensorDetailModalProps = {
  sensor: DemoSensor | null;
  onClose: () => void;
  onResetBaseline?: (sensorCode: string) => void;
  onDeleteSensor?: (sensorId: string) => void;
  isCalibrated?: boolean;
};
// マーカークリック時に地図コンテキストを維持したまま、ダイジェスト推移と林業リスクを確認できるようにします。
export function SensorDetailModal({
  sensor,
  onClose,
  onResetBaseline,
  onDeleteSensor,
  isCalibrated = false,
}: SensorDetailModalProps) {
  const titleId = useId();

  // Escapeキーでモーダルを閉じる
  useEffect(() => {
    if (!sensor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sensor, onClose]);

  if (!sensor) {
    return null;
  }

  const isDanger = sensor.observationSeverity === "danger";
  const isCaution = sensor.observationSeverity === "caution";
  const isTree = sensor.nodeType === "tree";

  // 擬似24時間推移データ（最新値を終点としたSVG折れ線用の点列）
  const moisturePoints = [
    {
      time: "00:00",
      val: Math.max((sensor.soilMoistureValue ?? 0.5) - 0.25, 0.2),
    },
    {
      time: "06:00",
      val: Math.max((sensor.soilMoistureValue ?? 0.5) - 0.15, 0.3),
    },
    {
      time: "12:00",
      val: Math.max((sensor.soilMoistureValue ?? 0.5) - 0.05, 0.4),
    },
    { time: "18:00", val: sensor.soilMoistureValue ?? 0.5 },
  ];

  const tiltPoints = [
    { time: "00:00", val: 0.1 },
    { time: "06:00", val: 0.15 },
    { time: "12:00", val: (sensor.tiltValue ?? 0.5) * 0.6 },
    { time: "18:00", val: sensor.tiltValue ?? 0.5 },
  ];

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header className={styles.dialogHeader}>
          <div className={styles.headerTitleRow}>
            <span className={styles.nodeTypeIcon} aria-hidden="true">
              {isTree ? "🌲" : "⛰️"}
            </span>
            <div>
              <div className={styles.codeBadgeRow}>
                <span className={styles.sensorCode}>{sensor.sensorCode}</span>
                <StatusBadge
                  status={sensor.observationSeverity}
                  label={
                    isDanger
                      ? "危険（しきい値超過）"
                      : isCaution
                        ? "注意"
                        : "正常"
                  }
                />
                <HealthBadge
                  status={sensor.communicationStatus}
                  label={
                    sensor.communicationStatus === "online"
                      ? "通信中"
                      : "通信断"
                  }
                />
              </div>
              <h2 className={styles.sensorName} id={titleId}>
                {sensor.name}
              </h2>
            </div>
          </div>

          <button
            aria-label="詳細モーダルを閉じる"
            className={styles.closeBtn}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.dialogBody}>
          {/* 林業アクションアラート帯 */}
          {sensor.source === "device_test" ? (
            <div className={styles.infoBanner}>
              <strong>ℹ️ 実機観測モード（生データ表示中）</strong>
              <p>
                集約機から受信した最新観測値を表示しています。土壌水分・傾斜の危険判定および基準姿勢との差分評価は校正確定後に適用されます。
              </p>
            </div>
          ) : (
            isDanger && (
              <div className={styles.dangerAlertBanner}>
                <strong>⚠️ 緊急避難・安全警戒勧告</strong>
                <p>
                  {isTree
                    ? "急激な傾斜変位を検知しました。立木の根返り・風倒木および架線過負荷の危険があります。直ちに作業員を退避させてください。"
                    : "土壌水分飽和および傾斜変動を検知しました。斜面崩壊・土砂崩れの危険が高まっています。当該工区への立ち入りを直ちに禁止してください。"}
                </p>
              </div>
            )
          )}

          {/* メトリクスサマリー */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>土壌水分量</span>
              <strong className={styles.metricValue}>
                {sensor.soilMoistureValue !== null
                  ? `${(sensor.soilMoistureValue * 100).toFixed(1)}%`
                  : "未取得"}
              </strong>
              <span className={styles.metricSub}>
                {sensor.source === "device_test"
                  ? "未校正（生値ベース）"
                  : "しきい値: 75.0%"}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>傾斜角変位</span>
              <strong className={styles.metricValue}>
                {sensor.tiltValue !== null
                  ? `+${sensor.tiltValue.toFixed(2)}°`
                  : "未取得"}
              </strong>
              <span className={styles.metricSub}>
                {sensor.source === "device_test"
                  ? isCalibrated
                    ? "基準直立・監視中"
                    : "仮算出（基準未設定）"
                  : "しきい値: +2.00°"}
              </span>
              {sensor.source === "device_test" && onResetBaseline && (
                <button
                  type="button"
                  className={styles.resetAngleModalBtn}
                  onClick={() => onResetBaseline(sensor.sensorCode)}
                >
                  🎯 角度を0°にリセット
                </button>
              )}
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>電池残量</span>
              <strong className={styles.metricValue}>
                {sensor.batteryPercent !== null
                  ? `${sensor.batteryPercent}%`
                  : "未取得"}
              </strong>
              <span className={styles.metricSub}>
                {sensor.source === "device_test"
                  ? "実測電圧換算"
                  : "3.28V (リチウム電池)"}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>標高 / 設置環境</span>
              <strong className={styles.metricValue}>
                {sensor.elevationMeters ?? 450}m
              </strong>
              <span className={styles.metricSub}>
                {sensor.locationNote ?? "工区急傾斜地"}
              </span>
            </div>
          </div>

          {/* 観測推移チャート */}
          {sensor.source === "device_test" ? (
            <div className={styles.liveNoticeBlock}>
              <h4 className={styles.chartTitle}>実機観測履歴</h4>
              <p className={styles.liveNoticeText}>
                実機観測値は現在リアルタイムに受信・蓄積中です。架空の過去データは生成せず、CSVおよびSQLiteへの記録に基づき表示されます。
              </p>
            </div>
          ) : (
            <div className={styles.chartsSection}>
              <div className={styles.chartBlock}>
                <h4 className={styles.chartTitle}>土壌水分推移 (直近24時間)</h4>
                <svg className={styles.chartSvg} viewBox="0 0 300 120">
                  <line
                    stroke="#ef4444"
                    strokeDasharray="4 3"
                    strokeWidth="1.2"
                    x1="30"
                    x2="280"
                    y1="40"
                    y2="40"
                  />
                  <text fill="#ef4444" fontSize="9" x="240" y="36">
                    警戒 75%
                  </text>
                  <polyline
                    fill="none"
                    points={moisturePoints
                      .map((p, idx) => `${40 + idx * 75},${100 - p.val * 80}`)
                      .join(" ")}
                    stroke="#3b82f6"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  />
                  {moisturePoints.map((p, idx) => (
                    <circle
                      key={p.time}
                      cx={40 + idx * 75}
                      cy={100 - p.val * 80}
                      fill="#3b82f6"
                      r="3.5"
                    />
                  ))}
                  <text fill="var(--text-subtle)" fontSize="9" x="30" y="114">
                    00:00
                  </text>
                  <text fill="var(--text-subtle)" fontSize="9" x="180" y="114">
                    12:00
                  </text>
                  <text fill="var(--text-subtle)" fontSize="9" x="255" y="114">
                    現在
                  </text>
                </svg>
              </div>

              <div className={styles.chartBlock}>
                <h4 className={styles.chartTitle}>傾斜角度変位 (直近24時間)</h4>
                <svg className={styles.chartSvg} viewBox="0 0 300 120">
                  <line
                    stroke="#ef4444"
                    strokeDasharray="4 3"
                    strokeWidth="1.2"
                    x1="30"
                    x2="280"
                    y1="45"
                    y2="45"
                  />
                  <text fill="#ef4444" fontSize="9" x="240" y="41">
                    警戒 +2.0°
                  </text>
                  <polyline
                    fill="none"
                    points={tiltPoints
                      .map(
                        (p, idx) =>
                          `${40 + idx * 75},${100 - Math.min(p.val * 25, 80)}`,
                      )
                      .join(" ")}
                    stroke="#f59e0b"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  />
                  {tiltPoints.map((p, idx) => (
                    <circle
                      key={p.time}
                      cx={40 + idx * 75}
                      cy={100 - Math.min(p.val * 25, 80)}
                      fill="#f59e0b"
                      r="3.5"
                    />
                  ))}
                  <text fill="var(--text-subtle)" fontSize="9" x="30" y="114">
                    00:00
                  </text>
                  <text fill="var(--text-subtle)" fontSize="9" x="180" y="114">
                    12:00
                  </text>
                  <text fill="var(--text-subtle)" fontSize="9" x="255" y="114">
                    現在
                  </text>
                </svg>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.dialogFooter}>
          {sensor.source === "device_test" && onDeleteSensor && (
            <button
              className={styles.deleteSensorModalBtn}
              onClick={() => onDeleteSensor(sensor.id)}
              type="button"
            >
              🗑️ 台帳から削除
            </button>
          )}
          <Link
            className={styles.fullDetailLink}
            href={`/sensors/${encodeURIComponent(sensor.id)}?from=map`}
            target="_blank"
          >
            <span>全画面・別タブで詳細を開く</span>
            <span aria-hidden="true">↗</span>
          </Link>
          <button
            className={styles.closeActionBtn}
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
}
