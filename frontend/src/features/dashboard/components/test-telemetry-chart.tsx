import type { TestObservation } from "../test-observation-types";

import styles from "./test-dashboard-home.module.css";

type NumericKey = "ax_mg" | "ay_mg" | "az_mg" | "soil_raw" | "battery_mv";

type ChartSeries = {
  key: NumericKey;
  label: string;
  color: string;
};

type TestTelemetryChartProps = {
  observations: TestObservation[];
  series: ChartSeries[];
  title: string;
};

const WIDTH = 720;
const HEIGHT = 260;
const PADDING = { top: 20, right: 22, bottom: 34, left: 58 };
const SINGLE_POINT_PADDING_MS = 30_000;

function isMissingTelemetryValue(
  key: NumericKey,
  value: number | null | undefined,
): value is null | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return true;
  }
  if ((key === "soil_raw" || key === "battery_mv") && value === -1) {
    return true;
  }
  return false;
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function TestTelemetryChart({
  observations,
  series,
  title,
}: TestTelemetryChartProps) {
  const validObservations = observations.filter((observation) =>
    Number.isFinite(Date.parse(observation.received_at)),
  );
  const values = validObservations.flatMap((observation) =>
    series
      .map(({ key }) => {
        const value = observation[key];
        return isMissingTelemetryValue(key, value) ? null : value;
      })
      .filter((value): value is number => value !== null),
  );

  if (values.length === 0) {
    return <p className={styles.chartEmpty}>計測済みの値がありません</p>;
  }

  const timestamps = validObservations.map(({ received_at }) =>
    Date.parse(received_at),
  );
  const rawMinTime = Math.min(...timestamps);
  const rawMaxTime = Math.max(...timestamps);
  // 単一点や同一時刻データのときにX軸の3つの時刻ラベルが左端に重ならないようパディングを設けます。
  const minTime =
    rawMinTime === rawMaxTime
      ? rawMinTime - SINGLE_POINT_PADDING_MS
      : rawMinTime;
  const maxTime =
    rawMinTime === rawMaxTime
      ? rawMaxTime + SINGLE_POINT_PADDING_MS
      : rawMaxTime;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = Math.max((rawMax - rawMin) * 0.12, 1);
  const minValue = rawMin - valuePadding;
  const maxValue = rawMax + valuePadding;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // 実際の受信時刻と生値を固定viewBox上の座標へ正規化します。
  const toX = (time: number) =>
    PADDING.left +
    ((time - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth;
  const toY = (value: number) =>
    PADDING.top +
    (1 - (value - minValue) / Math.max(maxValue - minValue, 1)) * plotHeight;

  const chartSeries = series.map((definition) => {
    const points: Array<{ x: number; y: number }> = [];
    const pathCommands: string[] = [];
    let needsMove = true;

    validObservations.forEach((observation) => {
      const value = observation[definition.key];
      if (isMissingTelemetryValue(definition.key, value)) {
        needsMove = true;
        return;
      }
      const point = {
        x: toX(Date.parse(observation.received_at)),
        y: toY(value),
      };
      points.push(point);
      pathCommands.push(
        `${needsMove ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      );
      needsMove = false;
    });

    return {
      ...definition,
      points,
      path: pathCommands.join(" "),
    };
  });

  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    return {
      value: maxValue - (maxValue - minValue) * ratio,
      y: PADDING.top + plotHeight * ratio,
    };
  });
  const xTicks = [minTime, minTime + (maxTime - minTime) / 2, maxTime];

  return (
    <div>
      <svg
        aria-label={`${title}の実証実験時系列グラフ`}
        className={styles.chartSvg}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title>{`${title}の実証実験時系列グラフ`}</title>
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              className={styles.gridLine}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
            />
            <text className={styles.axisLabel} x={8} y={tick.y + 4}>
              {Math.round(tick.value)}
            </text>
          </g>
        ))}
        {xTicks.map((tick, index) => (
          <text
            className={styles.axisLabel}
            key={`${tick}-${index}`}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            x={toX(tick)}
            y={HEIGHT - 8}
          >
            {formatTime(tick)}
          </text>
        ))}
        {chartSeries.map(({ color, key, path, points }) => {
          const latestPoint = points.at(-1);
          return (
            <g key={key}>
              <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
              {latestPoint ? (
                <circle
                  cx={latestPoint.x}
                  cy={latestPoint.y}
                  fill={color}
                  r="3.5"
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className={styles.chartLegend} aria-label={`${title}の凡例`}>
        {chartSeries.map(({ color, key, label }) => (
          <span key={key}>
            <i style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
