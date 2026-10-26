import type { TestObservation } from "../dashboard/test-observation-types";
import type {
  CommunicationStatus,
  DeviceFaultStatus,
  ObservationSeverity,
} from "./types";

// 集約機からのパケットが1分以上途絶えた場合、現場の安全上オンラインと誤認させないための閾値
const OFFLINE_STALE_THRESHOLD_MS = 60_000;

// 立木の根返り・斜面変位の危険および注意を判定する基準姿勢からの相対角度閾値（度）
const DANGER_TILT_THRESHOLD_DEG = 15.0;
const CAUTION_TILT_THRESHOLD_DEG = 5.0;

// 加速度ベクトルから角度（小数第1位）への変換定数
const RADIANS_TO_DEGREES = 180 / Math.PI;
const TILT_ROUNDING_FACTOR = 10;
const MIN_VERTICAL_ACCEL_MG = 1;
const COSINE_MIN_CLAMP = -1.0;
const COSINE_MAX_CLAMP = 1.0;

// マイコン側の未接続センチネル値（-1）およびADC・電池電圧の正規化定数
const UNCONNECTED_RAW_SENTINEL = -1;
const SOIL_RAW_FULL_SCALE = 2000;
const SOIL_MOISTURE_MIN_RATIO = 0;
const SOIL_MOISTURE_MAX_RATIO = 1.0;
const BATTERY_MIN_MV = 2800;
const BATTERY_SPAN_MV = 800;
const BATTERY_PERCENT_MIN = 0;
const BATTERY_PERCENT_MAX = 100;

type BaselineVector = {
  ax: number;
  ay: number;
  az: number;
  setAt?: string;
};

type EvaluableSensorState = {
  observationSeverity: ObservationSeverity;
  communicationStatus: CommunicationStatus;
  deviceFaultStatus: DeviceFaultStatus;
  soilMoistureValue: number | null;
  tiltValue: number | null;
  batteryPercent: number | null;
  lastReceivedAt: string | null;
};

/**
 * 地図・管理台帳・詳細画面・モバイル画面で実機センサーの状態判定が食い違わないよう、
 * 受信レコード・基準姿勢・経過時間・APIエラー有無から単一の規則でセンサー状態を算出する。
 */
export function evaluateLiveSensorState<TSensor extends EvaluableSensorState>(
  baseSensor: TSensor,
  latestObservation: TestObservation | null | undefined,
  baseline: BaselineVector | null | undefined,
  currentTimestampMs: number,
  hasApiError = false,
): TSensor {
  // 観測レコードが1件も届いていない場合は、台帳の初期状態（unknown等）をそのまま維持し、
  // 未観測の機体を「正常」や「故障なし」と偽装しない（Issue #28）
  if (!latestObservation) {
    return { ...baseSensor };
  }

  // API取得エラー発生時、または最終受信から60秒を超過した場合は即座に通信断（offline）と判定し、
  // バックエンド停止後にオンライン表示が凍結し続ける問題を防ぐ（Issue #31）
  const receivedTimestampMs = Date.parse(latestObservation.received_at);
  const elapsedMs = currentTimestampMs - receivedTimestampMs;
  const isFresh =
    !hasApiError &&
    Number.isFinite(elapsedMs) &&
    elapsedMs <= OFFLINE_STALE_THRESHOLD_MS;
  const communicationStatus: CommunicationStatus = isFresh
    ? "online"
    : "offline";

  const soilMoistureValue =
    latestObservation.soil_raw === null ||
    latestObservation.soil_raw === UNCONNECTED_RAW_SENTINEL
      ? null
      : Math.min(
          Math.max(
            latestObservation.soil_raw / SOIL_RAW_FULL_SCALE,
            SOIL_MOISTURE_MIN_RATIO,
          ),
          SOIL_MOISTURE_MAX_RATIO,
        );

  const batteryPercent =
    latestObservation.battery_mv === null ||
    latestObservation.battery_mv === UNCONNECTED_RAW_SENTINEL
      ? null
      : Math.min(
          Math.max(
            Math.round(
              ((latestObservation.battery_mv - BATTERY_MIN_MV) /
                BATTERY_SPAN_MV) *
                BATTERY_PERCENT_MAX,
            ),
            BATTERY_PERCENT_MIN,
          ),
          BATTERY_PERCENT_MAX,
        );

  const isZeroAcceleration =
    latestObservation.ax_mg === 0 &&
    latestObservation.ay_mg === 0 &&
    latestObservation.az_mg === 0;

  let tiltValue: number | null = null;
  let observationSeverity: ObservationSeverity = "unknown";

  if (isZeroAcceleration) {
    // マイコン起動直後の seq=0（全軸ゼロ）は物理的な姿勢を表さないため未判定として除外する
    tiltValue = null;
    observationSeverity = "unknown";
  } else if (baseline) {
    // 基準姿勢が確定している場合は、内積（コサイン類似度）から相対角度差 Δθ を算出する
    const dotProduct =
      latestObservation.ax_mg * baseline.ax +
      latestObservation.ay_mg * baseline.ay +
      latestObservation.az_mg * baseline.az;
    const currentMagnitude = Math.sqrt(
      latestObservation.ax_mg ** 2 +
        latestObservation.ay_mg ** 2 +
        latestObservation.az_mg ** 2,
    );
    const baselineMagnitude = Math.sqrt(
      baseline.ax ** 2 + baseline.ay ** 2 + baseline.az ** 2,
    );

    if (currentMagnitude > 0 && baselineMagnitude > 0) {
      const clampedCosine = Math.max(
        COSINE_MIN_CLAMP,
        Math.min(
          COSINE_MAX_CLAMP,
          dotProduct / (currentMagnitude * baselineMagnitude),
        ),
      );
      tiltValue =
        Math.round(
          Math.acos(clampedCosine) * RADIANS_TO_DEGREES * TILT_ROUNDING_FACTOR,
        ) / TILT_ROUNDING_FACTOR;

      if (tiltValue >= DANGER_TILT_THRESHOLD_DEG) {
        observationSeverity = "danger";
      } else if (tiltValue >= CAUTION_TILT_THRESHOLD_DEG) {
        observationSeverity = "caution";
      } else {
        // 通信断（offline）の場合は古い観測値から現在も正常であると断定できないため unknown に落とす
        observationSeverity =
          communicationStatus === "online" ? "normal" : "unknown";
      }
    }
  } else {
    // 基準未設定時は水平面に対する仮角度のみを参考値として算出し、重要度は未判定（unknown）を維持する
    const horizontalAccelerationMg = Math.sqrt(
      latestObservation.ax_mg ** 2 + latestObservation.ay_mg ** 2,
    );
    const verticalAccelerationMg = Math.max(
      Math.abs(latestObservation.az_mg),
      MIN_VERTICAL_ACCEL_MG,
    );
    tiltValue =
      Math.round(
        Math.atan2(horizontalAccelerationMg, verticalAccelerationMg) *
          RADIANS_TO_DEGREES *
          TILT_ROUNDING_FACTOR,
      ) / TILT_ROUNDING_FACTOR;
    observationSeverity = "unknown";
  }

  return {
    ...baseSensor,
    observationSeverity,
    communicationStatus,
    // 台帳の機器故障状態（unknown 含む）を勝手に ok へ書き換えずそのまま保持する
    deviceFaultStatus: baseSensor.deviceFaultStatus,
    soilMoistureValue,
    tiltValue,
    batteryPercent,
    lastReceivedAt: latestObservation.received_at,
  };
}
