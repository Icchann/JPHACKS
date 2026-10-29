/**
 * 設置・BLE基準取得・冪等同期に関する共通データ契約型定義 (Issue #53)
 *
 * スマホ現場PWAとPCバックエンド間で共通の設置・基準・同期データ構造を定義する。
 * 各ID（requestId, installationId, captureId）の独立管理と、
 * 軸・単位・校正版（configVersion）の整合性を保証する。
 */

export type CaptureQuality = "good" | "acceptable" | "rejected";

export type CaptureData = {
  capture_id: string;
  baseline_ax_mg: number;
  baseline_ay_mg: number;
  baseline_az_mg: number;
  variance_mg2: number;
  sample_count: number;
  duration_ms: number;
  quality: CaptureQuality;
  config_version: number;
};

export type InstallationConfirmRequest = {
  request_id: string;
  node_id: string;
  installation_id: string;
  installed_at: string;
  latitude: number;
  longitude: number;
  position_accuracy_m: number | null;
  identity_method: "web_nfc" | "url" | "manual";
  position_method: "gps" | "manual" | "demo_preset";
  capture: CaptureData;
  expected_version: number;
};

export type InstallationConfirmResponse = {
  status: "confirmed" | "already_confirmed" | "conflict";
  request_id: string;
  node_id: string;
  installation_id: string;
  capture_id: string;
  confirmed_at: string;
  message: string;
};

export type InstallationSyncStatus =
  | "prepared"
  | "device_saved"
  | "local_saved"
  | "syncing"
  | "synced"
  | "conflict"
  | "failed";

export type PendingInstallationRecord = {
  requestId: string;
  nodeId: string;
  installationId: string;
  installedAt: string;
  latitude: number;
  longitude: number;
  positionAccuracyM: number | null;
  identityMethod: "web_nfc" | "url" | "manual";
  positionMethod: "gps" | "manual" | "demo_preset";
  capture: CaptureData;
  syncStatus: InstallationSyncStatus;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
};
