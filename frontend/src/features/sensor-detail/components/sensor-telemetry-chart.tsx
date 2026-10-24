import type { DemoObservation } from "../../monitoring/types";

import styles from "./sensor-detail.module.css";

type ValueKey = "soilMoistureValue" | "tiltValue";

type SensorTelemetryChartProps = {
  observations: DemoObservation[];
  title: string;
  valueKey: ValueKey;
};

type MeasuredPoint = {
  measuredAt: string;
  value: number;
};

const WIDTH = 760;
const HEIGHT = 236;
const PADDING = { top: 18, right: 20, bottom: 34, left: 52 };

export function splitObservationSegments(
  observations: DemoObservation[],
  valueKey: ValueKey,
): MeasuredPoint[][] {
  const segments: MeasuredPoint[][] = [];
  let currentSegment: MeasuredPoint[] = [];

  [...observations]
    .sort(
      (left, right) =>
        Date.parse(left.measuredAt) - Date.parse(right.measuredAt),
    )
    .forEach((observation) => {
      const value = observation[valueKey];
      if (value === null) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
        return;
      }
      currentSegment.push({ measuredAt: observation.measuredAt, value });
    });

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  return segments;
}

function formatAxisTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

export function SensorTelemetryChart({
  observations,
  title,
  valueKey,
}: SensorTelemetryChartProps) {
  const segments = splitObservationSegments(observations, valueKey);
  const points = segments.flat();

  if (points.length === 0) {
    return (
      <div className={styles.chartEmpty} role="status">
        <strong>観測データをまだ受信していません</strong>
        <span>欠測値を0として表示していません</span>
      </div>
    );
  }

  const timestamps = observations.map((observation) =>
    Date.parse(observation.measuredAt),
  );
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = Math.max((rawMax - rawMin) * 0.12, 0.05);
  const minValue = rawMin - valuePadding;
  const maxValue = rawMax + valuePadding;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // 実測時刻と値域だけを座標化し、欠測をまたぐ線分は生成しません。
  const toX = (time: number) =>
    PADDING.left +
    ((time - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth;
  const toY = (value: number) =>
    PADDING.top +
    (1 - (value - minValue) / Math.max(maxValue - minValue, 0.001)) *
      plotHeight;
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
        <title>{`${title}のデモ時系列グラフ。欠測区間は接続していません。`}</title>
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
            key={`${tick}-${index}`}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            x={toX(tick)}
            y={HEIGHT - 8}
          >
            {formatAxisTime(tick)}
          </text>
        ))}
        {segments.map((segment, index) => {
          const path = segment
            .map((point, pointIndex) => {
              const x = toX(Date.parse(point.measuredAt));
              const y = toY(point.value);
              return `${pointIndex === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <g key={`${segment[0].measuredAt}-${index}`}>
              <path className={styles.chartLine} d={path} fill="none" />
              {segment.length === 1 ? (
                <circle
                  className={styles.chartPoint}
                  cx={toX(Date.parse(segment[0].measuredAt))}
                  cy={toY(segment[0].value)}
                  r="3"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className={styles.chartLegend} aria-label={`${title}の凡例`}>
        <span>
          <i aria-hidden="true" />
          実測値
        </span>
        <span>欠測区間は線を接続しません</span>
      </div>
    </div>
  );
}
