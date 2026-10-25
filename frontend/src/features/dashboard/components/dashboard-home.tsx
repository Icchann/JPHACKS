"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AppSidebar } from "../../../components/ui/app-sidebar";
import {
  DEMO_DASHBOARD_OBSERVATIONS,
  DEMO_REFERENCE_TIME,
} from "../demo-dashboard-data";
import { Icon } from "../../monitoring/components/icon";
import { DEMO_ALERTS, DEMO_SENSORS } from "../../monitoring/demo-data";
import {
  ALERT_LABELS,
  CATEGORY_LABELS,
  countSeverities,
  formatJapanDateTime,
  formatMeasuredValue,
  OBSERVATION_LABELS,
  sortAlerts,
} from "../../monitoring/monitoring-utils";
import type { ObservationSeverity } from "../../monitoring/types";

import { DashboardChart } from "./dashboard-chart";
import styles from "./dashboard-home.module.css";

type PeriodKey = "24h" | "7d" | "30d" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "24h", label: "24時間" },
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
  { key: "custom", label: "期間指定" },
];

const PERIOD_HOURS: Record<Exclude<PeriodKey, "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

const SUMMARY_ORDER: ObservationSeverity[] = ["normal", "caution", "danger"];
const INITIAL_SENSOR_IDS = DEMO_SENSORS.slice(0, 3).map((sensor) => sensor.id);

function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export function DashboardHome() {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [customStart, setCustomStart] = useState("2026-10-05");
  const [customEnd, setCustomEnd] = useState(
    toDateInputValue(DEMO_REFERENCE_TIME),
  );
  const [selectedSensorIds, setSelectedSensorIds] =
    useState(INITIAL_SENSOR_IDS);

  const counts = useMemo(() => countSeverities(DEMO_SENSORS), []);
  const sortedAlerts = useMemo(() => sortAlerts(DEMO_ALERTS), []);
  const deviceCounts = useMemo(
    () => ({
      online: DEMO_SENSORS.filter(
        (sensor) => sensor.communicationStatus === "online",
      ).length,
      offline: DEMO_SENSORS.filter(
        (sensor) => sensor.communicationStatus === "offline",
      ).length,
      lowBattery: DEMO_SENSORS.filter((sensor) => sensor.lowBattery).length,
      fault: DEMO_SENSORS.filter(
        (sensor) => sensor.deviceFaultStatus === "fault",
      ).length,
    }),
    [],
  );

  const selectedSensors = useMemo(
    () =>
      DEMO_SENSORS.filter((sensor) => selectedSensorIds.includes(sensor.id)),
    [selectedSensorIds],
  );

  // デモ履歴の基準時刻からプリセット期間、または任意日付範囲を算出します。
  const range = useMemo(() => {
    if (period === "custom") {
      return {
        start: Date.parse(`${customStart}T00:00:00.000Z`),
        end: Date.parse(`${customEnd}T23:59:59.999Z`),
      };
    }

    const end = Date.parse(DEMO_REFERENCE_TIME);
    return {
      start: end - PERIOD_HOURS[period] * 60 * 60 * 1000,
      end,
    };
  }, [customEnd, customStart, period]);

  const visibleObservations = useMemo(
    () =>
      DEMO_DASHBOARD_OBSERVATIONS.filter((observation) => {
        const measuredAt = Date.parse(observation.measuredAt);
        return (
          selectedSensorIds.includes(observation.sensorId) &&
          measuredAt >= range.start &&
          measuredAt <= range.end
        );
      }),
    [range.end, range.start, selectedSensorIds],
  );

  const toggleSensor = (sensorId: string) => {
    setSelectedSensorIds((current) =>
      current.includes(sensorId)
        ? current.filter((id) => id !== sensorId)
        : [...current, sensorId],
    );
  };

  return (
    <main className={styles.appShell}>
      <AppSidebar
        activePath="/dashboard"
        demoDescription="架空データを表示中"
      />

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <p>監視エリア / 単一森林</p>
            <div>
              <h1>ダッシュボード</h1>
              <span className={styles.demoBadge}>デモ</span>
            </div>
          </div>

          <div className={styles.headerMeta}>
            <p>
              <span>デモデータ基準時刻</span>
              <time dateTime={DEMO_REFERENCE_TIME}>
                {formatJapanDateTime(DEMO_REFERENCE_TIME)}
              </time>
            </p>
          </div>
        </header>

        <div className={styles.dashboardContent}>
          <section
            className={styles.alertSection}
            aria-labelledby="active-alerts"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p>ACTIVE ALERTS</p>
                <h2 id="active-alerts">アクティブ警告</h2>
              </div>
              <span>{sortedAlerts.length}件</span>
            </div>

            <div className={styles.alertGrid}>
              {sortedAlerts.map((alert) => (
                <Link
                  className={styles.alertCard}
                  data-severity={alert.severity}
                  href={`/map?focus=${encodeURIComponent(alert.sensorId)}`}
                  key={alert.id}
                >
                  <span className={styles.alertTopline}>
                    <strong>{ALERT_LABELS[alert.severity]}</strong>
                    <time dateTime={alert.startedAt}>
                      {formatJapanDateTime(alert.startedAt)}
                    </time>
                  </span>
                  <span className={styles.alertCategory}>
                    {CATEGORY_LABELS[alert.category]}
                  </span>
                  <span>
                    {alert.sensorCode} · {alert.sensorName}
                  </span>
                  <span>
                    実測値{" "}
                    {formatMeasuredValue(alert.measuredValue, alert.unit)}
                  </span>
                  <b>
                    地図で確認 <Icon name="chevron" />
                  </b>
                </Link>
              ))}
            </div>
          </section>

          <section
            className={styles.summarySection}
            aria-label="監視状態の集計"
          >
            <div className={styles.severityGrid}>
              {SUMMARY_ORDER.map((severity) => (
                <article
                  className={styles.metricCard}
                  data-severity={severity}
                  key={severity}
                >
                  <span className={styles.metricDot} aria-hidden="true" />
                  <div>
                    <span>{OBSERVATION_LABELS[severity]}</span>
                    <strong>{counts[severity]}</strong>
                  </div>
                  <small>センサー</small>
                </article>
              ))}
            </div>

            <article className={styles.deviceCard}>
              <div className={styles.deviceHeading}>
                <Icon name="sensor" />
                <div>
                  <span>通信状態</span>
                  <strong>
                    {deviceCounts.online}/{DEMO_SENSORS.length} オンライン
                  </strong>
                </div>
              </div>
              <div className={styles.deviceRows}>
                <span>
                  <i data-status="online" />
                  オンライン <strong>{deviceCounts.online}</strong>
                </span>
                <span>
                  <i data-status="offline" />
                  通信断 <strong>{deviceCounts.offline}</strong>
                </span>
              </div>
            </article>

            <article className={styles.deviceCard}>
              <div className={styles.deviceHeading}>
                <Icon name="alert" />
                <div>
                  <span>機器状態</span>
                  <strong>
                    要確認 {deviceCounts.lowBattery + deviceCounts.fault}件
                  </strong>
                </div>
              </div>
              <div className={styles.deviceRows}>
                <span>
                  <i data-status="battery" />
                  低電池 <strong>{deviceCounts.lowBattery}</strong>
                </span>
                <span>
                  <i data-status="fault" />
                  故障 <strong>{deviceCounts.fault}</strong>
                </span>
              </div>
            </article>
          </section>

          <section
            className={styles.analysisSection}
            aria-labelledby="observation-analysis"
          >
            <div className={styles.analysisHeader}>
              <div className={styles.sectionHeading}>
                <div>
                  <p>OBSERVATIONS</p>
                  <h2 id="observation-analysis">観測推移</h2>
                </div>
              </div>

              <div className={styles.periodControls} aria-label="表示期間">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    data-sanmou-button="secondary"
                    aria-pressed={period === option.key}
                    key={option.key}
                    type="button"
                    onClick={() => setPeriod(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {period === "custom" ? (
              <div className={styles.dateRange}>
                <label>
                  開始日
                  <input
                    aria-label="開始日"
                    max={customEnd}
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                  />
                </label>
                <span>—</span>
                <label>
                  終了日
                  <input
                    aria-label="終了日"
                    min={customStart}
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <fieldset className={styles.sensorPicker}>
              <legend>比較するセンサー</legend>
              <div>
                {DEMO_SENSORS.map((sensor) => (
                  <label key={sensor.id}>
                    <input
                      aria-label={`${sensor.sensorCode} ${sensor.name}`}
                      checked={selectedSensorIds.includes(sensor.id)}
                      type="checkbox"
                      onChange={() => toggleSensor(sensor.id)}
                    />
                    <span>{sensor.sensorCode}</span>
                    <small>{sensor.name}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.chartGrid}>
              <article className={styles.chartCard}>
                <header>
                  <div>
                    <p>SOIL MOISTURE</p>
                    <h3>土壌水分</h3>
                  </div>
                  <span>単位未設定</span>
                </header>
                <DashboardChart
                  observations={visibleObservations}
                  sensors={selectedSensors}
                  title="土壌水分"
                  valueKey="soilMoistureValue"
                />
              </article>

              <article className={styles.chartCard}>
                <header>
                  <div>
                    <p>TILT</p>
                    <h3>傾斜</h3>
                  </div>
                  <span>単位未設定</span>
                </header>
                <DashboardChart
                  observations={visibleObservations}
                  sensors={selectedSensors}
                  title="傾斜"
                  valueKey="tiltValue"
                />
              </article>
            </div>
          </section>

          <footer className={styles.disclaimer}>
            <Icon name="alert" />
            <p>
              表示値はすべて架空のデモデータです。警報は参考情報であり、現地の安全を保証するものではありません。
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
