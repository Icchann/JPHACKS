/**
 * 現場未同期キューおよびBLEアダプターの単体テスト (Issue #57, #60)
 */

import { describe, expect, it, vi } from "vitest";

import {
  listPendingInstallations,
  savePendingInstallation,
  syncPendingInstallationsToPc,
  updateInstallationSyncStatus,
} from "./installation-queue-storage";
import { MockBluetoothAdapter } from "./ble-device-adapter";
import { PendingInstallationRecord } from "../../sensor-management/installation-contract-types";

describe("MockBluetoothAdapter", () => {
  it("基準姿勢サンプリングが正常に完了しCaptureDataを返すこと", async () => {
    const adapter = new MockBluetoothAdapter();
    expect(adapter.isSupported()).toBe(true);

    const verified = await adapter.connectAndVerifyNode("T1");
    expect(verified).toBe(true);

    const states: string[] = [];
    const capture = await adapter.executeInstallation(
      "req-001",
      "inst-001",
      (state) => states.push(state),
    );

    expect(states).toContain("connecting");
    expect(states).toContain("wait_still");
    expect(states).toContain("sampling");
    expect(states).toContain("committed");

    expect(capture.sample_count).toBe(20);
    expect(capture.quality).toBe("good");
    expect(capture.baseline_az_mg).toBe(985);
  });
});

describe("installation-queue-storage", () => {
  it("未同期レコードを保存・一覧取得・状態更新できること", async () => {
    const record: PendingInstallationRecord = {
      requestId: "test-req-1234",
      nodeId: "T1",
      installationId: "inst_T1_test",
      installedAt: "2026-10-29T10:00:00Z",
      latitude: 35.123,
      longitude: 137.987,
      positionAccuracyM: 4.2,
      identityMethod: "web_nfc",
      positionMethod: "gps",
      capture: {
        capture_id: "cap-001",
        baseline_ax_mg: 0,
        baseline_ay_mg: 0,
        baseline_az_mg: 1000,
        variance_mg2: 20,
        sample_count: 20,
        duration_ms: 2000,
        quality: "good",
        config_version: 1,
      },
      syncStatus: "local_saved",
      createdAt: new Date().toISOString(),
    };

    await savePendingInstallation(record);
    const list = await listPendingInstallations();
    const found = list.find((item) => item.requestId === "test-req-1234");
    expect(found).toBeDefined();
    expect(found?.nodeId).toBe("T1");

    await updateInstallationSyncStatus("test-req-1234", "synced");
    const updatedList = await listPendingInstallations();
    const updated = updatedList.find(
      (item) => item.requestId === "test-req-1234",
    );
    expect(updated?.syncStatus).toBe("synced");
  });

  it("PC同期呼び出しが成功した場合にsyncedステータスへ更新されること", async () => {
    const record: PendingInstallationRecord = {
      requestId: "sync-test-req-999",
      nodeId: "T1",
      installationId: "inst_T1_sync",
      installedAt: "2026-10-29T10:00:00Z",
      latitude: 35.123,
      longitude: 137.987,
      positionAccuracyM: 3.0,
      identityMethod: "web_nfc",
      positionMethod: "gps",
      capture: {
        capture_id: "cap-999",
        baseline_ax_mg: 0,
        baseline_ay_mg: 0,
        baseline_az_mg: 1000,
        variance_mg2: 15,
        sample_count: 20,
        duration_ms: 2000,
        quality: "good",
        config_version: 1,
      },
      syncStatus: "local_saved",
      createdAt: new Date().toISOString(),
    };
    await savePendingInstallation(record);

    // fetch をモック
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "confirmed",
        request_id: "sync-test-req-999",
        node_id: "T1",
        installation_id: "inst_T1_sync",
        capture_id: "cap-999",
        confirmed_at: "2026-10-29T10:05:00Z",
        message: "正常に確定しました",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const summary = await syncPendingInstallationsToPc(
      "http://127.0.0.1:8000",
      "test-token",
    );
    expect(summary.synced).toBeGreaterThanOrEqual(1);
    expect(mockFetch).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
