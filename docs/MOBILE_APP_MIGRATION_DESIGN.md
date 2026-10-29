# MOBILE_APP_MIGRATION_DESIGN.md — 現場登録画面のネイティブアプリ移行設計書

> 文書版: 1.0 / 2026-10-29  
> 対象: iOS (iPhone) / Android ネイティブアプリ化構想  
> 準拠: Issue #64, #57, #58, #60, DEC-13, DEC-23

---

## 1. 目的と位置付け

山林深部での完全オフライン自立運用（MISTAKE-001参照）を実現するため、現在のWeb/PWA先行プロトタイプ（`/mobile`）から、iOSおよびAndroidのスタンドアロン・ネイティブアプリへ移行するためのアーキテクチャ境界と技術選定を定義する。

- **現フェーズ (Web/PWA)**: Android ChromeでのWeb Bluetooth / Web NFCを主対象とし、Web標準APIで現場実証を先行。
- **将来フェーズ (ネイティブアプリ化)**: Capacitor / Flutter によるiOS/Android両対応ネイティブアプリへの移行。

---

## 2. プラットフォーム制約と技術比較

| 項目 | Web/PWA (現行) | Capacitor (推奨) | Flutter (フルリライト) |
|---|---|---|---|
| **Android BLE** | Web Bluetooth API (◎) | `@capacitor-community/bluetooth-le` (◎) | `flutter_blue_plus` (◎) |
| **iOS BLE** | **不可 (×)** (Safari未対応) | CoreBluetoothネイティブ連携 (◎) | CoreBluetoothネイティブ連携 (◎) |
| **NFC タグ読取** | Androidのみ (`NDEFReader`) (○) | `@capawesome-team/capacitor-nfc` (◎) | `nfc_manager` (◎) |
| **iOS NFC自動起動** | バックグラウンドタグ読取 (URL) (◎) | Universal Links / URL Scheme (◎) | Universal Links / URL Scheme (◎) |
| **コード共通化** | 100% (React/TypeScript) | **95% (Reactコード資産をそのまま活用)** | 0% (Dartで画面・ロジックを再実装) |
| **推奨判定** | 現行プロトタイプ検証用 | **最有力移行パス (推奨)** | 将来のUI刷新時候補 |

### 選定理由
Capacitorを採用することで、すでに実装・テスト済みの以下のコア資産を1行も改変することなく100%再利用できる。
1. `BleDeviceAdapter` インターフェース（`WebBluetoothAdapter` を `CapacitorBluetoothAdapter` へ差し替えるだけ）
2. `installation-queue-storage.ts`（IndexedDB / SQLiteストレージ）
3. `installation-contract-types.ts`（通信・データ契約型定義）
4. React 19 UIコンポーネント（`/mobile` 画面）

---

## 3. アプリ差し替え境界（抽象インターフェース）

```text
[Mobile UI コンポーネント (mobile-home.tsx)]
                 │
                 ▼
     [BleDeviceAdapter インターフェース]
       ├── WebBluetoothAdapter (Android Chrome / Web環境)
       ├── CapacitorBluetoothAdapter (iOS / Android ネイティブアプリ)
       └── MockBluetoothAdapter (デモ・シミュレータ環境)
                 │
                 ▼
     [StorageAdapter インターフェース]
       ├── IndexedDbStorageAdapter (Web環境)
       └── NativeSqliteStorageAdapter (Capacitor SQLite)
                 │
                 ▼
     [SyncService (POST /api/v1/installations/confirm)]
```

### 差し替えコード例 (Capacitor Native Adapter)
```typescript
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BleDeviceAdapter, BleProgressCallback } from './ble-device-adapter';
import { CaptureData } from '../../sensor-management/installation-contract-types';

export class CapacitorBluetoothAdapter implements BleDeviceAdapter {
  isSupported(): boolean {
    return true; // iOS / Android 実機ネイティブ
  }

  async connectAndVerifyNode(expectedNodeId: string): Promise<boolean> {
    await BleClient.initialize();
    const device = await BleClient.requestDevice({
      services: [SANMOU_BLE_SERVICE_UUID],
    });
    await BleClient.connect(device.deviceId);
    return true;
  }

  async executeInstallation(
    requestId: string,
    installationId: string,
    onProgress?: BleProgressCallback
  ): Promise<CaptureData> {
    // ネイティブCoreBluetooth経由でのWrite & Read
    // ...
  }

  async disconnect(): Promise<void> {
    // ...
  }
}
```

---

## 4. iPhone標準Safariの制約と運用告知

- **技術的事実**: Apple WebKitのセキュリティポリシーにより、iOS上のSafari・PWAではWeb Bluetooth APIが完全に無効化されています。
- **UI表示ポリシー**: iOS Safariからアクセスされた場合、「このブラウザはBLE基準取得に対応していません（Android Chromeまたは山網専用アプリをご利用ください）」と明示し、未対応を成功と偽装しない。
