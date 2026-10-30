/**
 * BLE機体接続・基準取得の抽象アダプターインターフェース (Issue #57, #64)
 *
 * 設計意図:
 * 1. Android Chrome（Web Bluetooth API）環境での実機接続と、
 *    iPhone Safari / 開発環境用のフォールバック/モックを同一インターフェースで隠蔽する。
 * 2. 将来の Capacitor / Flutter ネイティブアプリ化（Issue #64）において、
 *    UIコンポーネントを一切変更することなくアダプターを差し替え可能にする。
 */

import { CaptureData } from "../../sensor-management/installation-contract-types";

export const SANMOU_BLE_SERVICE_UUID = "7a261800-0001-4b19-9000-00805f9b34fb";
export const SANMOU_BLE_CMD_CHAR_UUID = "7a261801-0001-4b19-9000-00805f9b34fb";
export const SANMOU_BLE_STATUS_CHAR_UUID =
  "7a261802-0001-4b19-9000-00805f9b34fb";
export const SANMOU_AUTH_TOKEN = "sanmou-field-token-2026";

export type BleProgressCallback = (
  state: "connecting" | "wait_still" | "sampling" | "committed" | "error",
  message: string,
) => void;

export interface BleDeviceAdapter {
  /** 実行中ブラウザ/OSでBLEアクセスが可能か判定 */
  isSupported(): boolean;

  /** 対象機体のスキャン・接続・node_id照合 */
  connectAndVerifyNode(expectedNodeId: string): Promise<boolean>;

  /** 設置命令を送信し、静止サンプリング結果が確定するまで監視してCaptureDataを取得 */
  executeInstallation(
    requestId: string,
    installationId: string,
    onProgress?: BleProgressCallback,
  ): Promise<CaptureData>;

  /** 接続の切断 */
  disconnect(): Promise<void>;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * 開発・デモ用モックBLEアダプター (Web Bluetooth非対応環境やテスト用)
 */
export class MockBluetoothAdapter implements BleDeviceAdapter {
  isSupported(): boolean {
    return true;
  }
  async connectAndVerifyNode(expectedNodeId: string): Promise<boolean> {
    void expectedNodeId;
    await delay(20);
    return true;
  }

  async executeInstallation(
    _requestId: string,
    _installationId: string,
    onProgress?: BleProgressCallback,
  ): Promise<CaptureData> {
    onProgress?.("connecting", "機体とBluetooth接続中...");
    await delay(20);

    onProgress?.("wait_still", "静止判定中: 機体から手を離してください...");
    await delay(30);

    onProgress?.("sampling", "静止姿勢サンプリング中 (20サンプル)...");
    await delay(30);

    onProgress?.("committed", "機体NVSへ基準姿勢を永続化しました");
    await delay(20);

    return {
      capture_id: `cap_mock_${Date.now()}`,
      baseline_ax_mg: -120,
      baseline_ay_mg: -95,
      baseline_az_mg: 985,
      variance_mg2: 25,
      sample_count: 20,
      duration_ms: 2000,
      quality: "good",
      config_version: 1,
    };
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}

// Web Bluetooth APIの軽量型定義
interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
  readValue(): Promise<DataView>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: string,
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{ services?: string[] }>;
      optionalServices?: string[];
    }): Promise<BluetoothDevice>;
  };
}

/**
 * Web Bluetooth API を用いた実機接続アダプター (Issue #57)
 */
export class WebBluetoothAdapter implements BleDeviceAdapter {
  private device: BluetoothDevice | null = null;
  private cmdChar: BluetoothRemoteGATTCharacteristic | null = null;
  private statusChar: BluetoothRemoteGATTCharacteristic | null = null;

  isSupported(): boolean {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as NavigatorWithBluetooth;
    return typeof nav.bluetooth?.requestDevice === "function";
  }

  async connectAndVerifyNode(expectedNodeId: string): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error(
        "この端末・ブラウザは Web Bluetooth API に対応していません (Android Chrome または対応環境をご利用ください)",
      );
    }

    const nav = navigator as NavigatorWithBluetooth;
    if (!nav.bluetooth) {
      throw new Error("Web Bluetooth APIが初期化されていません");
    }

    try {
      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SANMOU_BLE_SERVICE_UUID] }],
        optionalServices: [SANMOU_BLE_SERVICE_UUID],
      });

      if (!this.device.gatt) {
        throw new Error("GATTサーバーを取得できませんでした");
      }

      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(SANMOU_BLE_SERVICE_UUID);
      this.cmdChar = await service.getCharacteristic(SANMOU_BLE_CMD_CHAR_UUID);
      this.statusChar = await service.getCharacteristic(
        SANMOU_BLE_STATUS_CHAR_UUID,
      );

      // 機体IDの厳格な完全照合（部分一致を排除: Issue #71）
      const val = await this.statusChar.readValue();
      const decoder = new TextDecoder("utf-8");
      const jsonText = decoder.decode(val);
      const parsed = JSON.parse(jsonText) as { node_id?: string };
      if (
        !parsed.node_id ||
        parsed.node_id.toUpperCase() !== expectedNodeId.toUpperCase()
      ) {
        throw new Error(
          `選択された機体 (${parsed.node_id ?? "未識別"}) はNFCで指定された機体 (${expectedNodeId}) と一致しません`,
        );
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotFoundError") {
        throw new Error("機体の選択がキャンセルされました", { cause: err });
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`BLE接続に失敗しました: ${message}`, { cause: err });
    }
  }

  async executeInstallation(
    requestId: string,
    installationId: string,
    onProgress?: BleProgressCallback,
  ): Promise<CaptureData> {
    if (!this.cmdChar || !this.statusChar) {
      throw new Error("機体と未接続です。先に接続を実行してください");
    }

    onProgress?.("connecting", "機体へ設置命令を送信中...");

    // 1. 設置命令JSONの送信 (Write)
    const cmdPayload = JSON.stringify({
      cmd: "start_installation",
      request_id: requestId,
      installation_id: installationId,
      auth_token: SANMOU_AUTH_TOKEN,
      expected_version: 1,
    });
    const encoder = new TextEncoder();
    await this.cmdChar.writeValue(encoder.encode(cmdPayload));

    // 2. 状態のポーリング監視 (最大20秒)
    const startTime = Date.now();
    const TIMEOUT_MS = 20000;
    const decoder = new TextDecoder("utf-8");

    while (Date.now() - startTime < TIMEOUT_MS) {
      await delay(500);
      const val = await this.statusChar.readValue();
      const jsonText = decoder.decode(val);
      try {
        const res = JSON.parse(jsonText) as {
          status?: string;
          capture_id?: string;
          baseline_ax_mg?: number;
          baseline_ay_mg?: number;
          baseline_az_mg?: number;
          variance_mg2?: number;
          sample_count?: number;
          duration_ms?: number;
          quality?: "good" | "acceptable" | "rejected";
          config_version?: number;
        };

        if (res.status === "wait_still") {
          onProgress?.(
            "wait_still",
            "静止判定中: 手を離して静止させてください...",
          );
        } else if (res.status === "sampling") {
          onProgress?.("sampling", "静止区間をサンプリング中...");
        } else if (res.status === "committed") {
          onProgress?.("committed", "機体NVSへ基準姿勢の保存が完了しました");
          // 機体応答の必須項目検証（補完値・デフォルト値の偽装を完全排除: Issue #71）
          if (
            !res.capture_id ||
            typeof res.baseline_ax_mg !== "number" ||
            typeof res.baseline_ay_mg !== "number" ||
            typeof res.baseline_az_mg !== "number" ||
            typeof res.variance_mg2 !== "number" ||
            typeof res.sample_count !== "number" ||
            typeof res.duration_ms !== "number" ||
            !res.quality ||
            typeof res.config_version !== "number"
          ) {
            throw new Error(
              "機体からの基準姿勢応答に必要な項目が不足しています",
            );
          }
          if (
            res.baseline_ax_mg === 0 &&
            res.baseline_ay_mg === 0 &&
            res.baseline_az_mg === 0
          ) {
            throw new Error("機体から全軸ゼロの異常な基準姿勢が返却されました");
          }

          return {
            capture_id: res.capture_id,
            baseline_ax_mg: res.baseline_ax_mg,
            baseline_ay_mg: res.baseline_ay_mg,
            baseline_az_mg: res.baseline_az_mg,
            variance_mg2: res.variance_mg2,
            sample_count: res.sample_count,
            duration_ms: res.duration_ms,
            quality: res.quality,
            config_version: res.config_version,
          };
        } else if (res.status === "error_unstable") {
          throw new Error(
            "揺れが収まらず静止基準の取得に失敗しました。再試行してください",
          );
        } else if (res.status === "error_sensor") {
          throw new Error("機体センサーの異常（全軸ゼロ等）が検知されました");
        } else if (res.status === "error_auth") {
          throw new Error("機体操作の認証トークンが一致しません");
        }
      } catch (err: unknown) {
        // 明示的なエラー（認証失敗、センサー異常、揺れ過大、必須欠落等）は即座に伝播
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(String(err), { cause: err });
      }
    }

    throw new Error("基準姿勢サンプリングがタイムアウトしました");
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.cmdChar = null;
    this.statusChar = null;
  }
}
