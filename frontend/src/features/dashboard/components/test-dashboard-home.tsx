"use client";

import { useMemo, useState } from "react";

import { AppSidebar } from "../../../components/ui/app-sidebar";
import { Icon } from "../../monitoring/components/icon";
import { formatJapanDateTime } from "../../monitoring/monitoring-utils";
import { useTestObservations } from "../use-test-observations";

import dashboardStyles from "./dashboard-home.module.css";
import styles from "./test-dashboard-home.module.css";
import { TestTelemetryChart } from "./test-telemetry-chart";

function normalizeOptionalMetric(
  value: number | null | undefined,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === -1 ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  return value;
}

function formatValue(value: number | null, unit: string): string {
  return value === null || !Number.isFinite(value)
    ? "未計測"
    : `${value.toLocaleString("ja-JP")} ${unit}`;
}

export function TestDashboardHome() {
  const { data, error, isLoading, refresh } = useTestObservations();
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const nodeIds = useMemo(
    () =>
      [
        ...new Set([
          ...(selectedNodeId ? [selectedNodeId] : []),
          ...(data?.items.map(({ node_id }) => node_id) ?? []),
        ]),
      ].sort(),
    [data?.items, selectedNodeId],
  );
  const activeNodeId = nodeIds.includes(selectedNodeId)
    ? selectedNodeId
    : (nodeIds[0] ?? "");
  const selectedObservations = useMemo(
    () => data?.items.filter(({ node_id }) => node_id === activeNodeId) ?? [],
    [activeNodeId, data?.items],
  );
  const latestObservation = selectedObservations.at(-1) ?? null;
  const recentObservations = selectedObservations.slice(-10).reverse();
  return (
    <main className={dashboardStyles.appShell}>
      <AppSidebar
        activePath="/dashboard"
        demoDescription="受信CSVを3秒ごとに確認"
        environmentLabel="実証実験 TEST"
      />

      <section className={dashboardStyles.workspace}>
        <header className={dashboardStyles.topbar}>
          <div className={dashboardStyles.titleBlock}>
            <p>USB SERIAL / CSV MONITORING</p>
            <div>
              <h1>実証実験ダッシュボード</h1>
              <span className={styles.testBadge}>TEST</span>
            </div>
          </div>

          <div className={styles.headerStatus}>
            <span data-status={error ? "error" : "connected"} />
            <div>
              <strong>{error ? "取得エラー" : "自動更新中"}</strong>
              <small>
                {latestObservation
                  ? `最終受信 ${formatJapanDateTime(latestObservation.received_at)}`
                  : "受信待ち"}
              </small>
            </div>
            <button
              data-sanmou-button="secondary"
              type="button"
              onClick={() => void refresh()}
            >
              更新
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {error ? (
            <section className={styles.errorPanel} role="alert">
              <Icon name="alert" />
              <div>
                <strong>CSVデータを取得できません</strong>
                <span>{error}</span>
              </div>
            </section>
          ) : null}

          {!isLoading && data && !data.file_exists ? (
            <section className={styles.waitingPanel}>
              <Icon name="sensor" />
              <div>
                <strong>CSVの作成を待っています</strong>
                <span>
                  USB受信を開始すると、この画面へ自動的に反映されます。
                </span>
              </div>
            </section>
          ) : null}

          <section className={styles.summaryGrid} aria-label="受信状況の集計">
            <article>
              <span>読込レコード</span>
              <strong>
                {data?.items.length.toLocaleString("ja-JP") ?? "—"}
              </strong>
              <small>最新500件</small>
            </article>
            <article>
              <span>受信ノード</span>
              <strong>{data ? nodeIds.length : "—"}</strong>
              <small>CSV内の端末ID</small>
            </article>
            <article>
              <span>選択ノード</span>
              <strong>{activeNodeId || "—"}</strong>
              <small>
                {latestObservation
                  ? `seq ${latestObservation.seq}`
                  : "受信待ち"}
              </small>
            </article>
            <article
              data-warning={(data?.invalid_row_count ?? 0) > 0 || undefined}
            >
              <span>除外した行</span>
              <strong>{data?.invalid_row_count ?? "—"}</strong>
              <small>形式不一致</small>
            </article>
          </section>

          <section
            className={styles.telemetrySection}
            aria-labelledby="telemetry-heading"
          >
            <div className={styles.sectionHeader}>
              <div>
                <p>RAW TELEMETRY</p>
                <h2 id="telemetry-heading">受信データ</h2>
              </div>
              <label>
                表示ノード
                <select
                  disabled={nodeIds.length === 0}
                  onChange={(event) => setSelectedNodeId(event.target.value)}
                  value={activeNodeId}
                >
                  {nodeIds.length === 0 ? (
                    <option value="">受信待ち</option>
                  ) : null}
                  {nodeIds.map((nodeId) => (
                    <option key={nodeId} value={nodeId}>
                      {nodeId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.latestGrid}>
              <article>
                <span>X軸加速度</span>
                <strong>
                  {formatValue(latestObservation?.ax_mg ?? null, "mg")}
                </strong>
              </article>
              <article>
                <span>Y軸加速度</span>
                <strong>
                  {formatValue(latestObservation?.ay_mg ?? null, "mg")}
                </strong>
              </article>
              <article>
                <span>Z軸加速度</span>
                <strong>
                  {formatValue(latestObservation?.az_mg ?? null, "mg")}
                </strong>
              </article>
              <article>
                <span>土壌水分 生値</span>
                <strong>
                  {formatValue(
                    normalizeOptionalMetric(latestObservation?.soil_raw),
                    "raw",
                  )}
                </strong>
              </article>
              <article>
                <span>電池電圧</span>
                <strong>
                  {formatValue(
                    normalizeOptionalMetric(latestObservation?.battery_mv),
                    "mV",
                  )}
                </strong>
              </article>
            </div>

            <div className={styles.chartGrid}>
              <article className={styles.chartCard}>
                <header>
                  <div>
                    <p>ACCELERATION</p>
                    <h3>3軸加速度</h3>
                  </div>
                  <span>mg</span>
                </header>
                <TestTelemetryChart
                  observations={selectedObservations}
                  series={[
                    { key: "ax_mg", label: "X軸", color: "#247a58" },
                    { key: "ay_mg", label: "Y軸", color: "#d99a12" },
                    { key: "az_mg", label: "Z軸", color: "#557a95" },
                  ]}
                  title="3軸加速度"
                />
              </article>
              <article className={styles.chartCard}>
                <header>
                  <div>
                    <p>SOIL MOISTURE</p>
                    <h3>土壌水分 生値</h3>
                  </div>
                  <span>raw（未計測値は非表示）</span>
                </header>
                <TestTelemetryChart
                  observations={selectedObservations}
                  series={[
                    { key: "soil_raw", label: "土壌生値", color: "#247a58" },
                  ]}
                  title="土壌水分 生値"
                />
              </article>
              <article className={styles.chartCard}>
                <header>
                  <div>
                    <p>BATTERY VOLTAGE</p>
                    <h3>電池電圧</h3>
                  </div>
                  <span>mV（未計測値は非表示）</span>
                </header>
                <TestTelemetryChart
                  observations={selectedObservations}
                  series={[
                    { key: "battery_mv", label: "電池mV", color: "#2c6cbf" },
                  ]}
                  title="電池電圧"
                />
              </article>
            </div>
          </section>

          <section
            className={styles.tableSection}
            aria-labelledby="recent-heading"
          >
            <div className={styles.sectionHeader}>
              <div>
                <p>LATEST RECORDS</p>
                <h2 id="recent-heading">最新受信</h2>
              </div>
              <span>{activeNodeId || "ノード未選択"}</span>
            </div>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>受信日時</th>
                    <th>seq</th>
                    <th>sample_ms</th>
                    <th>ax</th>
                    <th>ay</th>
                    <th>az</th>
                    <th>soil_raw</th>
                    <th>battery_mv</th>
                  </tr>
                </thead>
                <tbody>
                  {recentObservations.map((observation, index) => (
                    <tr
                      key={`${observation.received_at}-${observation.node_id}-${observation.seq}-${observation.sample_ms}-${index}`}
                    >
                      <td>{formatJapanDateTime(observation.received_at)}</td>
                      <td>{observation.seq}</td>
                      <td>{observation.sample_ms}</td>
                      <td>{observation.ax_mg}</td>
                      <td>{observation.ay_mg}</td>
                      <td>{observation.az_mg}</td>
                      <td>
                        {normalizeOptionalMetric(observation.soil_raw) ?? "—"}
                      </td>
                      <td>
                        {normalizeOptionalMetric(observation.battery_mv) ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {recentObservations.length === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={8}>
                        受信データを待っています
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <footer className={styles.disclaimer}>
            <Icon name="sensor" />
            <p>
              表示値はCSVから読み込んだ実証実験用の生値です。校正・傾斜算出・危険度判定は行っていません。
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
