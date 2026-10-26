"use client";

import Link from "next/link";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { AppSidebar } from "../../../components/ui/app-sidebar";
import { HealthBadge, StatusBadge } from "../../../components/ui/ui-primitives";
import {
  DEMO_DASHBOARD_OBSERVATIONS,
  DEMO_REFERENCE_TIME,
} from "../../dashboard/demo-dashboard-data";
import { Icon } from "../../monitoring/components/icon";
import { DEMO_ALERTS } from "../../monitoring/demo-data";
import {
  ALERT_LABELS,
  CATEGORY_LABELS,
  formatJapanDateTime,
  formatMeasuredValue,
  OBSERVATION_LABELS,
  sortAlerts,
} from "../../monitoring/monitoring-utils";
import type {
  CommunicationStatus,
  DemoObservation,
  DemoSensor,
  DeviceFaultStatus,
  ObservationSeverity,
} from "../../monitoring/types";
import { SensorTelemetryChart } from "./sensor-telemetry-chart";
import styles from "./sensor-detail.module.css";

type TabKey = "overview" | "charts" | "alerts" | "inspections";

const TABS: Array<{ key: TabKey; label: string; later?: boolean }> = [
  { key: "overview", label: "概要" },
  { key: "charts", label: "グラフ" },
  { key: "alerts", label: "異常履歴", later: true },
  { key: "inspections", label: "現地確認履歴", later: true },
];

type DetailSeverity = ObservationSeverity;
type DetailCommunicationStatus = CommunicationStatus;
type DetailDeviceFaultStatus = DeviceFaultStatus;

export type DetailSensor = Omit<
  DemoSensor,
  | "observationSeverity"
  | "communicationStatus"
  | "deviceFaultStatus"
  | "lowBattery"
> & {
  observationSeverity: DetailSeverity;
  communicationStatus: DetailCommunicationStatus;
  deviceFaultStatus: DetailDeviceFaultStatus;
  lowBattery: boolean | null;
};

const SEVERITY_LABELS: Record<DetailSeverity, string> = OBSERVATION_LABELS;
const COORDINATE_DECIMAL_PLACES = 6;

const COMMUNICATION_LABELS: Record<DetailCommunicationStatus, string> = {
  online: "オンライン",
  offline: "通信断",
  unknown: "未接続",
};

const DEVICE_STATUS_LABELS: Record<DetailDeviceFaultStatus, string> = {
  ok: "故障なし",
  fault: "故障",
  unknown: "未判定",
};

type SensorDetailProps = {
  returnPath: "/map" | "/sensors";
  sensor: DetailSensor;
  initialObservations?: DemoObservation[];
  isCalibrated?: boolean;
};

function ObservationValue({
  label,
  value,
  stale,
  detailNote,
}: {
  label: string;
  value: number | null;
  stale: boolean;
  detailNote?: string;
}) {
  const defaultNote = stale ? "最終受信時点・単位未設定" : "単位未設定";
  return (
    <article className={styles.observationCard} data-missing={value === null}>
      <span>{label}</span>
      <strong>{value === null ? "—" : value}</strong>
      <small>
        {value === null ? "観測値未取得" : (detailNote ?? defaultNote)}
      </small>
    </article>
  );
}

export function SensorDetail({
  returnPath,
  sensor,
  initialObservations,
  isCalibrated = false,
}: SensorDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isDeviceTest = sensor.source === "device_test";
  const isStale = sensor.communicationStatus === "offline";

  // 実機テスト時は基準設定状態（基準差か仮算出か）および仮設定である旨を明示し、確定仕様と誤認させない（Issue #28）
  const moistureDetailNote = isDeviceTest
    ? isStale
      ? "最終受信時点・仮設定（生値正規化・未校正）"
      : "仮設定（生値正規化・未校正）"
    : undefined;
  const tiltDetailNote = isDeviceTest
    ? isCalibrated
      ? isStale
        ? "最終受信時点・基準差（deg・仮設定）"
        : "基準差（deg・仮設定）"
      : isStale
        ? "最終受信時点・基準未設定（仮算出）"
        : "基準未設定・仮算出（deg）"
    : undefined;
  const observations = useMemo(() => {
    if (initialObservations) {
      return initialObservations;
    }
    if (isDeviceTest) {
      return [];
    }
    return DEMO_DASHBOARD_OBSERVATIONS.filter(
      (observation) => observation.sensorId === sensor.id,
    );
  }, [initialObservations, isDeviceTest, sensor.id]);
  // 履歴APIは未実装のため、デモ環境では現在のデモ警告だけを表示します。
  const activeAlerts = useMemo(
    () =>
      isDeviceTest
        ? []
        : sortAlerts(
            DEMO_ALERTS.filter((alert) => alert.sensorId === sensor.id),
          ),
    [isDeviceTest, sensor.id],
  );

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    // WAI-ARIAのタブ操作に合わせ、矢印・Home・Endで選択とフォーカスを同期します。
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveTab(TABS[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <main className={styles.appShell}>
      <AppSidebar
        activePath="/sensors"
        demoDescription={
          isDeviceTest ? "検証用DB・受信CSVを参照中" : "架空データを表示中"
        }
        environmentLabel={isDeviceTest ? "test環境" : "デモモード"}
      />

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <p>センサー / {sensor.sensorCode}</p>
            <div>
              <h1>{sensor.name}</h1>
              <span className={styles.demoBadge}>
                {isDeviceTest ? "実機テスト" : "デモ"}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <p className={styles.referenceTime}>
              <span>
                {isDeviceTest ? "最終受信時刻" : "デモデータ基準時刻"}
              </span>
              {isDeviceTest ? (
                sensor.lastReceivedAt ? (
                  <time dateTime={sensor.lastReceivedAt}>
                    {formatJapanDateTime(sensor.lastReceivedAt)}
                  </time>
                ) : (
                  <span>未受信</span>
                )
              ) : (
                <time dateTime={DEMO_REFERENCE_TIME}>
                  {formatJapanDateTime(DEMO_REFERENCE_TIME)}
                </time>
              )}
            </p>
            <Link
              data-sanmou-button="secondary"
              className={styles.backLink}
              href={returnPath}
            >
              <span aria-hidden="true">←</span>
              {returnPath === "/sensors" ? "センサー管理へ戻る" : "地図へ戻る"}
            </Link>
          </div>
        </header>

        <div className={styles.content}>
          {isStale ? (
            <div className={styles.staleNotice} role="status">
              <HealthBadge label="通信断" status="offline" />
              <p>最終受信時点の値を表示しています。</p>
            </div>
          ) : null}

          <section className={styles.sensorHeader} aria-label="センサー状態">
            <div>
              <span>観測重要度</span>
              <StatusBadge
                label={SEVERITY_LABELS[sensor.observationSeverity]}
                status={sensor.observationSeverity}
              />
            </div>
            <div>
              <span>通信</span>
              <HealthBadge
                label={COMMUNICATION_LABELS[sensor.communicationStatus]}
                status={sensor.communicationStatus}
              />
            </div>
            <div>
              <span>機器</span>
              <HealthBadge
                label={DEVICE_STATUS_LABELS[sensor.deviceFaultStatus]}
                status={sensor.deviceFaultStatus}
              />
            </div>
            {sensor.lowBattery === true ? (
              <div>
                <span>電池</span>
                <HealthBadge label="低電池" status="lowBattery" />
              </div>
            ) : null}
          </section>

          <div className={styles.tabs} role="tablist" aria-label="センサー詳細">
            {TABS.map((tab, index) => (
              <button
                data-sanmou-button="secondary"
                aria-controls={"sensor-panel-" + tab.key}
                aria-selected={activeTab === tab.key}
                id={"sensor-tab-" + tab.key}
                key={tab.key}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={activeTab === tab.key ? 0 : -1}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                {tab.label}
                {tab.later ? <small>未実装</small> : null}
              </button>
            ))}
          </div>

          <section
            aria-labelledby="sensor-tab-overview"
            className={styles.tabPanel}
            hidden={activeTab !== "overview"}
            id="sensor-panel-overview"
            role="tabpanel"
          >
            <div className={styles.observationGrid}>
              <ObservationValue
                detailNote={moistureDetailNote}
                label="土壌水分"
                stale={isStale}
                value={sensor.soilMoistureValue}
              />
              <ObservationValue
                detailNote={tiltDetailNote}
                label="傾斜"
                stale={isStale}
                value={sensor.tiltValue}
              />
            </div>

            <div className={styles.overviewGrid}>
              <article className={styles.detailPanel}>
                <header>
                  <p>SENSOR PROFILE</p>
                  <h2>基本情報</h2>
                </header>
                <dl>
                  <div>
                    <dt>センサーID</dt>
                    <dd>{sensor.sensorCode}</dd>
                  </div>
                  <div>
                    <dt>名称</dt>
                    <dd>{sensor.name}</dd>
                  </div>
                  <div>
                    <dt>設置位置</dt>
                    <dd>
                      {sensor.latitude.toFixed(COORDINATE_DECIMAL_PLACES)},{" "}
                      {sensor.longitude.toFixed(COORDINATE_DECIMAL_PLACES)}
                    </dd>
                  </div>
                  <div>
                    <dt>最終受信</dt>
                    <dd>
                      {sensor.lastReceivedAt ? (
                        <time dateTime={sensor.lastReceivedAt}>
                          {formatJapanDateTime(sensor.lastReceivedAt)}
                        </time>
                      ) : (
                        "未受信"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>電池残量</dt>
                    <dd>
                      {sensor.batteryPercent === null
                        ? "—（未取得）"
                        : String(sensor.batteryPercent) + "%"}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className={styles.detailPanel}>
                <header>
                  <p>ACTIVE ALERTS</p>
                  <h2>最新異常情報</h2>
                </header>
                {activeAlerts.length > 0 ? (
                  <div className={styles.alertList}>
                    {activeAlerts.map((alert) => (
                      <div className={styles.alertRow} key={alert.id}>
                        <div>
                          {alert.severity === "status" ? (
                            <HealthBadge label="機器" status="lowBattery" />
                          ) : (
                            <StatusBadge
                              label={ALERT_LABELS[alert.severity]}
                              status={alert.severity}
                            />
                          )}
                          <time dateTime={alert.startedAt}>
                            {formatJapanDateTime(alert.startedAt)}
                          </time>
                        </div>
                        <strong>{CATEGORY_LABELS[alert.category]}</strong>
                        <span>
                          実測値{" "}
                          {formatMeasuredValue(alert.measuredValue, alert.unit)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyState}>
                    現在、表示対象の警告はありません
                  </p>
                )}
              </article>
            </div>
          </section>

          <section
            aria-labelledby="sensor-tab-charts"
            className={styles.tabPanel}
            hidden={activeTab !== "charts"}
            id="sensor-panel-charts"
            role="tabpanel"
          >
            <div className={styles.chartIntro}>
              <div>
                <p>OBSERVATIONS</p>
                <h2>観測推移</h2>
              </div>
              <span>
                {isDeviceTest ? "実機受信データ" : "デモ30日・12時間間隔"}
              </span>
            </div>
            <div className={styles.chartGrid}>
              {(
                [
                  ["土壌水分", "soilMoistureValue"],
                  ["傾斜", "tiltValue"],
                ] as const
              ).map(([title, valueKey]) => (
                <article className={styles.chartPanel} key={valueKey}>
                  <header>
                    <div>
                      <h3>{title}</h3>
                      <span>
                        {isDeviceTest
                          ? valueKey === "tiltValue"
                            ? isCalibrated
                              ? "単位: deg（基準差・仮設定）"
                              : "単位: deg（基準未設定・仮算出）"
                            : "単位: 比率（仮設定・未校正）"
                          : "単位: 未設定"}
                      </span>
                    </div>
                    <span>
                      {isDeviceTest
                        ? valueKey === "tiltValue"
                          ? isCalibrated
                            ? "しきい値: +5.0°注意 / +15.0°危険（仮設定）"
                            : "しきい値: 基準未設定（仮算出）"
                          : "しきい値: 仮設定（未校正）"
                        : "しきい値: 未設定"}
                    </span>
                  </header>
                  <SensorTelemetryChart
                    observations={observations}
                    title={title}
                    valueKey={valueKey}
                  />
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="sensor-tab-alerts"
            className={styles.tabPanel}
            hidden={activeTab !== "alerts"}
            id="sensor-panel-alerts"
            role="tabpanel"
          >
            <div className={styles.unimplementedState}>
              <Icon name="history" />
              <h2>異常履歴は未実装です</h2>
              <p>現在のアクティブ警告は概要タブで確認できます。</p>
            </div>
          </section>

          <section
            aria-labelledby="sensor-tab-inspections"
            className={styles.tabPanel}
            hidden={activeTab !== "inspections"}
            id="sensor-panel-inspections"
            role="tabpanel"
          >
            <div className={styles.unimplementedState}>
              <Icon name="sensor" />
              <h2>現地確認履歴は未実装です</h2>
              <p>QR・GPS・オフライン報告は後続フェーズの対象です。</p>
            </div>
          </section>

          <footer className={styles.disclaimer}>
            <Icon name="alert" />
            <p>
              {isDeviceTest
                ? "表示値は実証実験の受信データです。警報は参考情報であり、現地の安全を保証するものではありません。"
                : "表示値は架空のデモデータです。警報は参考情報であり、現地の安全を保証するものではありません。"}
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
