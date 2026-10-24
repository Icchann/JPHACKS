import { DEMO_SENSORS } from "../monitoring/demo-data";
import type { DemoObservation } from "../monitoring/types";

export const DEMO_REFERENCE_TIME = "2026-10-12T08:30:00.000Z";

const INTERVAL_HOURS = 12;
const POINT_COUNT = 61;

// 最新値との整合を保ちつつ、比較表示に使える30日分の架空履歴を生成します。
export const DEMO_DASHBOARD_OBSERVATIONS: DemoObservation[] =
  DEMO_SENSORS.flatMap((sensor, sensorIndex) =>
    Array.from({ length: POINT_COUNT }, (_, pointIndex) => {
      const offset = pointIndex - (POINT_COUNT - 1);
      const measuredAt = new Date(
        Date.parse(DEMO_REFERENCE_TIME) +
          offset * INTERVAL_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const moisturePhase = sensorIndex * 0.7;
      const tiltPhase = sensorIndex * 0.9;
      const moistureWave =
        (Math.sin(offset * 0.42 + moisturePhase) - Math.sin(moisturePhase)) *
        0.045;
      const tiltWave =
        (Math.sin(offset * 0.31 + tiltPhase) - Math.sin(tiltPhase)) * 0.16;

      return {
        sensorId: sensor.id,
        measuredAt,
        soilMoistureValue:
          sensor.soilMoistureValue === null
            ? null
            : Number((sensor.soilMoistureValue + moistureWave).toFixed(3)),
        tiltValue:
          sensor.tiltValue === null
            ? null
            : Number((sensor.tiltValue + tiltWave).toFixed(3)),
        source: "demo" as const,
      };
    }),
  );
