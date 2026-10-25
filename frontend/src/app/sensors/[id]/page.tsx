import { notFound } from "next/navigation";

import type { TestObservationResponse } from "../../../features/dashboard/test-observation-types";
import { DEMO_SENSORS } from "../../../features/monitoring/demo-data";
import type { DemoObservation } from "../../../features/monitoring/types";
import {
  type DetailSensor,
  SensorDetail,
} from "../../../features/sensor-detail/components/sensor-detail";
import type { TestSensor } from "../../../features/sensor-management/sensor-api-types";

const ONLINE_THRESHOLD_MS = 60_000;
const SOIL_RAW_FULL_SCALE = 2000;
const BATTERY_MIN_MV = 2800;
const BATTERY_SPAN_MV = 800;

function convertTestObservationToDemo(
  sensorId: string,
  item: TestObservationResponse["items"][number],
): DemoObservation {
  const isZeroAcc = item.ax_mg === 0 && item.ay_mg === 0 && item.az_mg === 0;
  const soilMoistureValue =
    item.soil_raw === null || item.soil_raw === -1
      ? null
      : Math.min(Math.max(item.soil_raw / SOIL_RAW_FULL_SCALE, 0), 1.0);
  let tiltValue: number | null = null;
  if (!isZeroAcc) {
    const horizontalAcc = Math.sqrt(item.ax_mg ** 2 + item.ay_mg ** 2);
    tiltValue =
      Math.round(
        ((Math.atan2(horizontalAcc, Math.max(Math.abs(item.az_mg), 1)) * 180) /
          Math.PI) *
          10,
      ) / 10;
  }

  return {
    sensorId,
    measuredAt: item.received_at,
    soilMoistureValue,
    tiltValue,
    source: "demo",
  };
}

async function fetchTestSensorDetail(id: string): Promise<{
  sensor: DetailSensor;
  observations: DemoObservation[];
} | null> {
  const testToken = process.env.SANMOU_TEST_API_TOKEN;
  if (!testToken) {
    return null;
  }
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

  try {
    const sensorResponse = await fetch(
      `${backendUrl}/sensors/${encodeURIComponent(id)}`,
      {
        cache: "no-store",
        headers: { "X-Test-Token": testToken },
      },
    );
    if (!sensorResponse.ok) {
      return null;
    }
    const testSensor = (await sensorResponse.json()) as TestSensor;

    let observations: DemoObservation[] = [];
    let latestSoilMoisture: number | null = null;
    let latestTilt: number | null = null;
    let latestBatteryPercent: number | null = null;
    let latestReceivedAt = testSensor.last_received_at;
    let communicationStatus = testSensor.communication_status;
    let observationSeverity = testSensor.observation_severity;

    try {
      const obsResponse = await fetch(
        `${backendUrl}/test/observations?node_id=${encodeURIComponent(testSensor.sensor_code)}&limit=100`,
        {
          cache: "no-store",
          headers: { "X-Test-Token": testToken },
        },
      );
      if (obsResponse.ok) {
        const obsBody = (await obsResponse.json()) as TestObservationResponse;
        observations = obsBody.items.map((item) =>
          convertTestObservationToDemo(testSensor.id, item),
        );
        const latestItem = obsBody.items.at(-1);
        const latestConverted = observations.at(-1);
        if (latestItem && latestConverted) {
          latestSoilMoisture = latestConverted.soilMoistureValue;
          latestTilt = latestConverted.tiltValue;
          latestReceivedAt = latestItem.received_at;
          latestBatteryPercent =
            latestItem.battery_mv === null || latestItem.battery_mv === -1
              ? null
              : Math.min(
                  Math.max(
                    Math.round(
                      ((latestItem.battery_mv - BATTERY_MIN_MV) /
                        BATTERY_SPAN_MV) *
                        100,
                    ),
                    0,
                  ),
                  100,
                );
          const receivedEpoch = Date.parse(latestItem.received_at);
          const refreshedEpoch = Date.parse(obsBody.refreshed_at);
          const isFresh =
            Number.isFinite(receivedEpoch) &&
            Number.isFinite(refreshedEpoch) &&
            refreshedEpoch - receivedEpoch < ONLINE_THRESHOLD_MS;
          communicationStatus = isFresh ? "online" : "offline";
          if (observationSeverity === "unknown") {
            observationSeverity = "normal";
          }
        }
      }
    } catch {
      // 観測CSVが未作成・取得不能でも台帳情報だけで詳細画面を表示します。
    }

    const sensor: DetailSensor = {
      id: testSensor.id,
      sensorCode: testSensor.sensor_code,
      name: testSensor.name,
      latitude: testSensor.latitude,
      longitude: testSensor.longitude,
      observationSeverity,
      communicationStatus,
      deviceFaultStatus: testSensor.device_fault_status,
      lowBattery: testSensor.low_battery,
      soilMoistureValue: latestSoilMoisture,
      tiltValue: latestTilt,
      batteryPercent: latestBatteryPercent,
      lastReceivedAt: latestReceivedAt,
      source: "device_test",
    };

    return { sensor, observations };
  } catch {
    return null;
  }
}

export default async function SensorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  // 不正な戻り先を受け入れず、アプリ内の既知の画面だけを遷移先にします。
  const returnPath = from === "sensors" ? "/sensors" : "/map";

  if (process.env.SANMOU_APP_ENV === "test") {
    const testDetail = await fetchTestSensorDetail(id);
    if (testDetail) {
      return (
        <SensorDetail
          initialObservations={testDetail.observations}
          returnPath={returnPath}
          sensor={testDetail.sensor}
        />
      );
    }
  }

  const sensor = DEMO_SENSORS.find((item) => item.id === id);

  if (!sensor) {
    notFound();
  }

  return <SensorDetail returnPath={returnPath} sensor={sensor} />;
}
