import type {
  AlertCategory,
  AlertSeverity,
  DemoAlert,
  DemoSensor,
  ObservationSeverity,
} from "./types";

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  danger: 0,
  caution: 1,
  status: 2,
};

export const OBSERVATION_LABELS: Record<ObservationSeverity, string> = {
  normal: "正常",
  caution: "注意",
  danger: "危険",
};

export const ALERT_LABELS: Record<AlertSeverity, string> = {
  danger: "危険",
  caution: "注意",
  status: "機器",
};

export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  moisture: "土壌水分",
  tilt: "傾斜",
  battery: "電池残量",
};

export function filterSensors(
  sensors: DemoSensor[],
  query: string,
): DemoSensor[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  if (!normalizedQuery) {
    return sensors;
  }

  return sensors.filter((sensor) =>
    `${sensor.sensorCode} ${sensor.name}`
      .toLocaleLowerCase("ja-JP")
      .includes(normalizedQuery),
  );
}

export function countSeverities(
  sensors: DemoSensor[],
): Record<ObservationSeverity, number> {
  return sensors.reduce<Record<ObservationSeverity, number>>(
    (counts, sensor) => {
      counts[sensor.observationSeverity] += 1;
      return counts;
    },
    { normal: 0, caution: 0, danger: 0 },
  );
}

export function sortAlerts(alerts: DemoAlert[]): DemoAlert[] {
  return [...alerts].sort((left, right) => {
    const severityDifference =
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }
    return Date.parse(right.startedAt) - Date.parse(left.startedAt);
  });
}

export function findNewAlerts(
  previous: DemoAlert[],
  next: DemoAlert[],
): DemoAlert[] {
  const previousIds = new Set(previous.map((alert) => alert.id));
  return next.filter((alert) => !previousIds.has(alert.id));
}

export function formatJapanDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMeasuredValue(
  value: number | null,
  unit: string | null,
): string {
  if (value === null) {
    return "欠測";
  }
  return unit ? `${value}${unit}` : `${value}（単位未設定）`;
}
