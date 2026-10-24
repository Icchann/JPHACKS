import type { DemoObservation, DemoSensor } from "../../monitoring/types";

import styles from "./dashboard-home.module.css";

type ValueKey = "soilMoistureValue" | "tiltValue";

type DashboardChartProps = {
  observations: DemoObservation[];
  sensors: DemoSensor[];
  title: string;
  valueKey: ValueKey;
};

const SERIES_COLORS = ["#2e8b57", "#d99a12", "#cf4b42", "#557a95"];
const WIDTH = 720;
const HEIGHT = 260;
const PADDING = { top: 20, right: 22, bottom: 34, left: 48 };

function formatChartTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
  }).format(new Date(value));
}

export function DashboardChart({
  observations,
  sensors,
  title,
  valueKey,
}: DashboardChartProps) {
  const values = observations
    .map((observation) => observation[valueKey])
    .filter((value): value is number => value !== null);

  if (values.length === 0 || sensors.length === 0) {
    return (
      <p className={styles.chartEmpty}>表示できるデモ観測値がありません</p>
    );
  }

  const timestamps = observations.map((observation) =>
    Date.parse(observation.measuredAt),
  );
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = Math.max((rawMax - rawMin) * 0.12, 0.05);
  const minValue = rawMin - valuePadding;
  const maxValue = rawMax + valuePadding;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // 選択期間と値域を固定viewBox上の座標へ正規化します。
  const toX = (time: number) =>
    PADDING.left +
    ((time - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth;
  const toY = (value: number) =>
    PADDING.top +
    (1 - (value - minValue) / Math.max(maxValue - minValue, 0.001)) *
      plotHeight;

  const series = sensors.map((sensor, index) => {
    const points = observations
      .filter(
        (observation) =>
          observation.sensorId === sensor.id && observation[valueKey] !== null,
      )
      .map((observation) => ({
        x: toX(Date.parse(observation.measuredAt)),
        y: toY(observation[valueKey] as number),
      }));

    return {
      sensor,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points,
      path: points
        .map(
          (point, pointIndex) =>
            `${pointIndex === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" "),
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
    <div className={styles.chartBody}>
      <svg
        aria-label={`${title}のデモ時系列グラフ`}
        className={styles.chartSvg}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title>{`${title}のデモ時系列グラフ`}</title>
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
              {tick.value.toFixed(2)}
            </text>
          </g>
        ))}
        {xTicks.map((tick, index) => (
          <text
            className={styles.axisLabel}
            key={tick}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            x={toX(tick)}
            y={HEIGHT - 8}
          >
            {formatChartTime(tick)}
          </text>
        ))}
        {series.map(({ sensor, color, path, points }) => {
          const latestPoint = points.at(-1);
          return (
            <g key={sensor.id}>
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
        {series.map(({ sensor, color }) => (
          <span key={sensor.id}>
            <i style={{ backgroundColor: color }} />
            {sensor.sensorCode}
          </span>
        ))}
      </div>
    </div>
  );
}
