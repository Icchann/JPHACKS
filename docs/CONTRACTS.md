# CONTRACTS.md — 山網 共通通信・設置ID・データ契約仕様書

> 文書版: 1.0 / 2026-10-29  
> 対象: 機体ファームウェア (ESP32C3) / スマホ現場Web・PWA / PCバックエンド (FastAPI & SQLite)  
> 準拠: Issue #53, #54, #55, #56, #59, #61, DEC-23

---

## 1. 識別子（ID）体系と責任境界

山林現場での携帯圏外運用において、時刻の推測や暗黙の最新値採用を排除し、観測・設置・基準を厳密に対応付けるため、以下の5つの独立した識別子を定義する。

| 識別子 | 生成元 | 形式・文字数 | 役割とライフサイクル | 通信サイズ |
|---|---|---|---|---|
| `request_id` | スマホ端末 | UUIDv4 (36文字) | 現場端末での1回の設置操作・通信再送単位。同一 `request_id` の再送は完全に同一の結果を返す（冪等性）。別端末や別操作による再送は新規発行する。 | 36バイト (文字列) |
| `installation_id` | スマホ端末 / 機体 | `inst_<node>_<timestamp>` または UUIDv4 (最大40文字) | 機体の樹木・現場への物理的取り付け単位。機体の再設置・樹木移設ごとに新規発行される。機体NVSおよびPC SQLiteに永続化される。 | 最大40バイト |
| `capture_id` | 機体 (ESP32) | `cap_<node>_<hash>` または UUIDv4 (最大40文字) | 設置直後の静止区間における基準姿勢サンプリング結果単位。一度確定したレコードは不変（Immutable）。 | 最大40バイト |
| `boot_id` | 機体 (ESP32) | `b_<boot_seq>_<random>` (最大24文字) | 機体の電源投入・再起動セッション単位。再起動しても `installation_id` は維持され、`boot_id` のみが更新される。 | 最大24バイト |
| `sample_seq` | 機体 (ESP32) | 0以上の符号なし32bit整数 (0〜4294967295) | 当該 `boot_id` 内での観測連番。LoRaパケットの欠落・重複検知に使用する。 | 4バイト (バイナリ/文字列) |

---

## 2. 日時・タイムスタンプの厳密な分離

以下の5つの日時は**絶対に混同せず、互いに変換・捏造してはならない**。

1. **スマホ操作日時 (`client_operated_at`)**: スマホ画面上で作業員が「設置・基準取得」ボタンを押下した端末時計の時刻。
2. **GPS測位日時 (`gps_acquired_at`)**: スマホのGPSセンサーが緯度経度を測位した時刻。
3. **機体サンプリング区間 (`sample_ms`, `duration_ms`)**: 機体のESP32起動後ミリ秒カウンタ。機体はRTC（実時間時計）を持たないため、絶対時刻への勝手な断定換算は禁止。
4. **PC受信日時 (`received_at`)**: PC側のUSBシリアル受信機がLoRaパケットを受信し、パースした時点のPC時計（タイムゾーン付きUTC）。
5. **PC登録確定日時 (`confirmed_at`)**: スマホから持ち帰った同期データがPCのSQLite DBトランザクションで確定保存された時刻。

---

## 3. BLE GATT 通信契約（設置・基準取得）

### 3.1 サービスおよびキャラクタリスティック UUID

- **山網 設置管理サービス UUID**: `7a261800-0001-4b19-9000-00805f9b34fb`
- **DeviceInfo (機体照合) UUID**: `00002a29-0000-1000-8000-00805f9b34fb` (Manufacturer) / `00002a24-0000-1000-8000-00805f9b34fb` (Model Number = `node_id`)
- **設置命令キャラクタリスティック (Write)**: `7a261801-0001-4b19-9000-00805f9b34fb`
- **設置状態・基準結果キャラクタリスティック (Read / Notify)**: `7a261802-0001-4b19-9000-00805f9b34fb`

### 3.2 設置命令ペイロード (スマホ → 機体 Write)

JSONまたはTLV（初期実装はJSONバイト列）:
```json
{
  "cmd": "start_installation",
  "request_id": "c1f7b92a-89a1-43e7-a9a2-97b7b1234567",
  "installation_id": "inst_T1_20261029_090000",
  "auth_token": "sanmou-field-token-2026",
  "expected_version": 1
}
```

### 3.3 設置状態・基準結果ペイロード (機体 → スマホ Read/Notify)

```json
{
  "status": "committed",
  "request_id": "c1f7b92a-89a1-43e7-a9a2-97b7b1234567",
  "node_id": "T1",
  "installation_id": "inst_T1_20261029_090000",
  "capture_id": "cap_8f7b2c1a-4567-4890-a1b2-c3d4e5f60789",
  "boot_id": "b_0001_a9f2",
  "sample_count": 20,
  "duration_ms": 2000,
  "baseline_ax_mg": -120,
  "baseline_ay_mg": -95,
  "baseline_az_mg": 985,
  "variance_mg2": 45,
  "quality": "good",
  "config_version": 1
}
```

- `status` 列挙値:
  - `idle`: 待機中
  - `wait_still`: 作業員の手離れ・静止判定待ち（揺れ検知中）
  - `sampling`: 静止区間サンプリング計測中（例: 2000ms間）
  - `committed`: 機体NVSへ原子的保存完了（スマホはこの時点で読出可能）
  - `error_unstable`: 揺れが収まらず時間切れ
  - `error_sensor`: ADXL367 通信エラーまたは全軸ゼロ・飽和異常
  - `error_auth`: 認証トークン不一致
  - `error_conflict`: 既存の別要求との不一致・競合

---

## 4. LoRa パケット契約（S1新形式・S0互換）

### 4.1 S1 パケット形式（新仕様・13項目）

CSV文字列形式（末尾 `\r\n`）:
```text
S1,<node_id>,<installation_id>,<boot_id>,<sample_seq>,<hop>,<sample_ms>,<ax_mg>,<ay_mg>,<az_mg>,<soil_raw>,<battery_mv>,<config_version>
```

- 各フィールド定義:
  1. `packet_type`: 固定文字列 `"S1"`
  2. `node_id`: 機体コード（例: `"T1"`）
  3. `installation_id`: 現在機体に設定されている物理設置ID（例: `"inst_T1_20261029_090000"`）
  4. `boot_id`: 起動セッションID（例: `"b_0001_a9f2"`）
  5. `sample_seq`: 当該起動内での観測連番（`0, 1, 2, ...`）
  6. `hop`: 中継ホップ数（自機直接送信時は `0`）
  7. `sample_ms`: 機体起動後ミリ秒
  8. `ax_mg`: X軸加速度 (mg、符号付き整数、通常範囲 -2000〜2000)
  9. `ay_mg`: Y軸加速度 (mg、符号付き整数)
  10. `az_mg`: Z軸加速度 (mg、符号付き整数)
  11. `soil_raw`: 土壌水分ADC生値（未計測時は `-1`）
  12. `battery_mv`: 電池電圧ミリボルト（未計測時は `-1`）
  13. `config_version`: 測定レンジ・フィルター設定版（整数、現行は `1`）

### 4.2 S0 パケット形式（旧仕様・10項目、下位互換性維持）

```text
S0,<node_id>,<seq>,<hop>,<sample_ms>,<ax_mg>,<ay_mg>,<az_mg>,<soil_raw>,<battery_mv>
```
PCバックエンドはS0行を受信した場合、`installation_id = "legacy_s0"`、`boot_id = "legacy"`、`config_version = 0` として透過的に解析し、旧機体からの通信を遮断しない。

---

## 5. 測定設定仕様（config_version = 1）

BLE基準取得とLoRa観測で同一の重力ベクトル比較を行うため、センサー設定を厳密に固定する。

- センサーIC: Analog Devices ADXL367
- 測定レンジ: ±2g（16-bitモード、感度: 1mg/LSB）
- 出力データレート (ODR): 12.5 Hz (サンプリング周期 80ms)
- フィルター帯域: 1/4 ODR (ナイキスト周波数以下に制限し高周波振動をカット)
- 静止判定条件: 2000ms（25サンプル）中の各軸分散 $\sigma^2 \le 100\,\text{mg}^2$、かつ合成加速度 $800\,\text{mg} \le |\mathbf{a}| \le 1200\,\text{mg}$
