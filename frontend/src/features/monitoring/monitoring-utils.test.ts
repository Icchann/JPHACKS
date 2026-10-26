import { describe, expect, it } from "vitest";

import { DEMO_ALERTS, DEMO_SENSORS } from "./demo-data";
import {
  countSeverities,
  filterSensors,
  findNewAlerts,
  formatMeasuredValue,
  sortAlerts,
} from "./monitoring-utils";

describe("monitoring-utils", () => {
  it("IDまたは名称でセンサーを検索する", () => {
    expect(filterSensors(DEMO_SENSORS, "demo-002")).toHaveLength(1);
    expect(filterSensors(DEMO_SENSORS, "東尾根")[0]?.sensorCode).toBe(
      "DEMO-003",
    );
  });

  it("観測重要度別に件数を集計し、未判定センサーも安全に数える", () => {
    expect(countSeverities(DEMO_SENSORS)).toEqual({
      normal: 3,
      caution: 2,
      danger: 1,
      unknown: 0,
    });
    expect(
      countSeverities([
        ...DEMO_SENSORS,
        { ...DEMO_SENSORS[0], id: "unknown-1", observationSeverity: "unknown" },
      ]),
    ).toEqual({
      normal: 3,
      caution: 2,
      danger: 1,
      unknown: 1,
    });
  });

  it("危険、注意、機器状態の仮順序で警告を並べる", () => {
    expect(
      sortAlerts([...DEMO_ALERTS].reverse()).map((alert) => alert.severity),
    ).toEqual(["danger", "caution", "status"]);
  });

  it("初回表示済み警告を新規警告として扱わない", () => {
    expect(findNewAlerts(DEMO_ALERTS, DEMO_ALERTS)).toEqual([]);
    expect(
      findNewAlerts(DEMO_ALERTS, [
        ...DEMO_ALERTS,
        { ...DEMO_ALERTS[0], id: "demo-alert-new" },
      ]),
    ).toHaveLength(1);
  });

  it("未決定の観測単位を補完しない", () => {
    expect(formatMeasuredValue(0.82, null)).toBe("0.82（単位未設定）");
    expect(formatMeasuredValue(null, null)).toBe("欠測");
  });
});
