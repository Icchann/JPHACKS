import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { notFound } from "next/navigation";

import type { TestObservationResponse } from "../../../features/dashboard/test-observation-types";
import { DEMO_SENSORS } from "../../../features/monitoring/demo-data";
import { evaluateLiveSensorState } from "../../../features/monitoring/evaluate-live-sensor-state";
import type { DemoObservation } from "../../../features/monitoring/types";
import {
  type DetailSensor,
  SensorDetail,
} from "../../../features/sensor-detail/components/sensor-detail";
import type { TestSensor } from "../../../features/sensor-management/sensor-api-types";
import type { BaselineData } from "../../api/test-baseline/route";

const DEFAULT_BASELINE_STATE_FILENAME = "sanmou-test-baseline-state.json";
const OBSERVATION_HISTORY_LIMIT = 100;

function readBaselineForNode(sensorCode: string): BaselineData | null {
  const globalState = globalThis as unknown as {
    __sanmouBaselines?: Record<string, BaselineData>;
  };
  const configuredPath = process.env.SANMOU_BASELINE_STATE_PATH?.trim();
  const fileName = configuredPath
    ? path.basename(configuredPath)
    : DEFAULT_BASELINE_STATE_FILENAME;
  const stateFilePath = path.join(os.tmpdir(), fileName);
  if (fs.existsSync(stateFilePath)) {
    try {
      const rawText = fs.readFileSync(stateFilePath, "utf-8");
      const parsed = JSON.parse(rawText) as {
        baselines?: Record<string, BaselineData>;
      };
      if (parsed.baselines && typeof parsed.baselines === "object") {
        globalState.__sanmouBaselines = parsed.baselines;
        return parsed.baselines[sensorCode] ?? null;
      }
    } catch {
      // ファイル読取失敗時はメモリ上のキャッシュへフォールバックする
    }
  }

  return globalState.__sanmouBaselines?.[sensorCode] ?? null;
}

function convertTestObservationToDemo(
  baseSensor: DetailSensor,
  item: TestObservationResponse["items"][number],
  baseline: BaselineData | null,
): DemoObservation {
  const receivedTimestampMs = Date.parse(item.received_at);
  const evaluated = evaluateLiveSensorState(
    baseSensor,
    item,
    baseline,
    Number.isFinite(receivedTimestampMs) ? receivedTimestampMs : Date.now(),
    false,
  );

  return {
    sensorId: baseSensor.id,
    measuredAt: item.received_at,
    soilMoistureValue: evaluated.soilMoistureValue,
    tiltValue: evaluated.tiltValue,
    source: "device_test",
  };
}

async function fetchTestSensorDetail(id: string): Promise<{
  sensor: DetailSensor;
  observations: DemoObservation[];
  isCalibrated: boolean;
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
    const baseline = readBaselineForNode(testSensor.sensor_code);

    const baseSensor: DetailSensor = {
      id: testSensor.id,
      sensorCode: testSensor.sensor_code,
      name: testSensor.name,
      latitude: testSensor.latitude,
      longitude: testSensor.longitude,
      observationSeverity: testSensor.observation_severity,
      communicationStatus: testSensor.communication_status,
      deviceFaultStatus: testSensor.device_fault_status,
      lowBattery: testSensor.low_battery,
      soilMoistureValue: null,
      tiltValue: null,
      batteryPercent: null,
      lastReceivedAt: testSensor.last_received_at,
      source: "device_test",
    };

    let observations: DemoObservation[] = [];
    let evaluatedSensor: DetailSensor = baseSensor;

    try {
      const obsResponse = await fetch(
        `${backendUrl}/test/observations?node_id=${encodeURIComponent(testSensor.sensor_code)}&limit=${OBSERVATION_HISTORY_LIMIT}`,
        {
          cache: "no-store",
          headers: { "X-Test-Token": testToken },
        },
      );
      if (obsResponse.ok) {
        const obsBody = (await obsResponse.json()) as TestObservationResponse;
        observations = obsBody.items.map((item) =>
          convertTestObservationToDemo(baseSensor, item, baseline),
        );
        const latestItem = obsBody.items.at(-1) ?? null;
        const refreshedEpoch = Date.parse(obsBody.refreshed_at);
        const currentTimestampMs = Number.isFinite(refreshedEpoch)
          ? refreshedEpoch
          : Date.now();
        // 地図・台帳画面と同一の判定関数を用い、基準未設定や未観測の unknown を normal に書き換えない（Issue #28）
        evaluatedSensor = evaluateLiveSensorState(
          baseSensor,
          latestItem,
          baseline,
          currentTimestampMs,
          false,
        );
      }
    } catch {
      // 観測CSVが未作成・取得不能でも台帳情報だけで詳細画面を表示します。
    }

    return {
      sensor: evaluatedSensor,
      observations,
      isCalibrated: Boolean(baseline),
    };
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
          isCalibrated={testDetail.isCalibrated}
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
