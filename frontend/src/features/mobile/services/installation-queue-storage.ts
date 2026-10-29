/**
 * 現場未同期キューの永続化および帰社後PC同期サービス (Issue #60)
 *
 * 設計意図:
 * 1. 現場（携帯圏外）で取得した設置記録およびBLE基準姿勢データを、
 *    IndexedDB（利用不可時はlocalStorageフォールバック）に原子的・永続的に保存する。
 * 2. 帰社後、許可済みPCへ接続できた際に冪等API (/api/v1/installations/confirm) へ手動/自動同期する。
 * 3. 二重送信、応答消失、競合（Conflict）を識別し、同期完了前にデータを勝手に破棄しない。
 */

import {
  InstallationConfirmRequest,
  InstallationConfirmResponse,
  PendingInstallationRecord,
} from "../../sensor-management/installation-contract-types";

const DB_NAME = "sanmou_mobile_db";
const STORE_NAME = "pending_installations";
const DB_VERSION = 1;
const LOCAL_STORAGE_BACKUP_KEY = "sanmou_pending_installations_backup";

function openDb(): Promise<IDBDatabase | null> {
  const { promise, resolve } = Promise.withResolvers<IDBDatabase | null>();

  if (typeof window === "undefined" || !window.indexedDB) {
    resolve(null);
    return promise;
  }

  const req = window.indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "requestId" });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => resolve(null);

  return promise;
}

/**
 * 未同期設置レコードを端末内へ永続保存する
 */
export async function savePendingInstallation(
  record: PendingInstallationRecord,
): Promise<void> {
  const db = await openDb();
  if (db) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const putReq = store.put(record);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
    await promise;
  }

  // localStorageへのバックアップミラーリング（二重保護）
  try {
    const existing = getLocalStorageBackup();
    const filtered = existing.filter(
      (item) => item.requestId !== record.requestId,
    );
    filtered.push(record);
    localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(filtered));
  } catch {
    // 容量制限等での失敗時は無視
  }
}

/**
 * 保存されている未同期設置レコード一覧を取得する
 */
export async function listPendingInstallations(): Promise<
  PendingInstallationRecord[]
> {
  const db = await openDb();
  if (db) {
    const { promise, resolve } =
      Promise.withResolvers<PendingInstallationRecord[]>();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();
    getReq.onsuccess = () => {
      resolve(getReq.result as PendingInstallationRecord[]);
    };
    getReq.onerror = () => {
      resolve(getLocalStorageBackup());
    };
    return promise;
  }
  return getLocalStorageBackup();
}

/**
 * 設置レコードの同期状態を更新する
 */
export async function updateInstallationSyncStatus(
  requestId: string,
  status: PendingInstallationRecord["syncStatus"],
  errorMessage?: string,
): Promise<void> {
  const items = await listPendingInstallations();
  const target = items.find((item) => item.requestId === requestId);
  if (!target) return;

  target.syncStatus = status;
  target.lastAttemptAt = new Date().toISOString();
  if (errorMessage !== undefined) {
    target.errorMessage = errorMessage;
  }
  await savePendingInstallation(target);
}

/**
 * 設置レコードを削除する（同期完了後など）
 */
export async function deletePendingInstallation(
  requestId: string,
): Promise<void> {
  const db = await openDb();
  if (db) {
    const { promise, resolve } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const delReq = store.delete(requestId);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => resolve();
    await promise;
  }

  try {
    const existing = getLocalStorageBackup();
    const filtered = existing.filter((item) => item.requestId !== requestId);
    localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(filtered));
  } catch {
    // no-op
  }
}

function getLocalStorageBackup(): PendingInstallationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingInstallationRecord[];
  } catch {
    return [];
  }
}

export type SyncResultSummary = {
  total: number;
  synced: number;
  conflicts: number;
  failed: number;
  results: Array<{
    requestId: string;
    nodeId: string;
    status: "synced" | "conflict" | "failed";
    message: string;
  }>;
};

/**
 * 帰社後、許可済みPCへ未同期レコードを一括送信・同期する
 */
export async function syncPendingInstallationsToPc(
  pcBaseUrl: string,
  apiToken: string,
): Promise<SyncResultSummary> {
  const pending = await listPendingInstallations();
  const toSync = pending.filter((item) => item.syncStatus !== "synced");

  const summary: SyncResultSummary = {
    total: toSync.length,
    synced: 0,
    conflicts: 0,
    failed: 0,
    results: [],
  };

  const endpoint = `${pcBaseUrl.replace(/\/+$/, "")}/api/v1/installations/confirm`;

  for (const item of toSync) {
    await updateInstallationSyncStatus(item.requestId, "syncing");

    const reqPayload: InstallationConfirmRequest = {
      request_id: item.requestId,
      node_id: item.nodeId,
      installation_id: item.installationId,
      installed_at: item.installedAt,
      latitude: item.latitude,
      longitude: item.longitude,
      position_accuracy_m: item.positionAccuracyM,
      identity_method: item.identityMethod,
      position_method: item.positionMethod,
      capture: item.capture,
      expected_version: 1,
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Token": apiToken,
        },
        body: JSON.stringify(reqPayload),
      });

      if (response.ok) {
        const data = (await response.json()) as InstallationConfirmResponse;
        await updateInstallationSyncStatus(item.requestId, "synced");
        summary.synced++;
        summary.results.push({
          requestId: item.requestId,
          nodeId: item.nodeId,
          status: "synced",
          message: data.message || "PC台帳への確定同期に成功しました",
        });
      } else if (response.status === 409) {
        const errJson = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
          detail?: string;
        };
        const errMsg =
          errJson.error?.message ||
          errJson.detail ||
          "既存の設置世代と競合しました";
        await updateInstallationSyncStatus(item.requestId, "conflict", errMsg);
        summary.conflicts++;
        summary.results.push({
          requestId: item.requestId,
          nodeId: item.nodeId,
          status: "conflict",
          message: errMsg,
        });
      } else {
        const errMsg = `HTTPエラー (${response.status})`;
        await updateInstallationSyncStatus(item.requestId, "failed", errMsg);
        summary.failed++;
        summary.results.push({
          requestId: item.requestId,
          nodeId: item.nodeId,
          status: "failed",
          message: errMsg,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await updateInstallationSyncStatus(item.requestId, "failed", message);
      summary.failed++;
      summary.results.push({
        requestId: item.requestId,
        nodeId: item.nodeId,
        status: "failed",
        message: `通信接続エラー: ${message}`,
      });
    }
  }

  return summary;
}
