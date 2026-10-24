import { describe, expect, it } from "vitest";

import type { DemoObservation } from "../../monitoring/types";
import { splitObservationSegments } from "./sensor-telemetry-chart";

describe("splitObservationSegments", () => {
  it("欠測区間では線を分け、0は有効な観測値として残す", () => {
    const observations: DemoObservation[] = [
      {
        sensorId: "sensor-1",
        measuredAt: "2026-10-12T02:00:00.000Z",
        soilMoistureValue: 0.4,
        tiltValue: 0.2,
        source: "demo",
      },
      {
        sensorId: "sensor-1",
        measuredAt: "2026-10-12T01:00:00.000Z",
        soilMoistureValue: null,
        tiltValue: 0.1,
        source: "demo",
      },
      {
        sensorId: "sensor-1",
        measuredAt: "2026-10-12T00:00:00.000Z",
        soilMoistureValue: 0,
        tiltValue: 0,
        source: "demo",
      },
    ];

    expect(splitObservationSegments(observations, "soilMoistureValue")).toEqual(
      [
        [{ measuredAt: "2026-10-12T00:00:00.000Z", value: 0 }],
        [{ measuredAt: "2026-10-12T02:00:00.000Z", value: 0.4 }],
      ],
    );
  });
});
