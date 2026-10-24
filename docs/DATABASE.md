# DATABASE.md — データベース仕様書（SQLite & 将来構想）

> 文書版: 2.0 / 2026-10-24  
> 対象: JPHACKS / SQLite (実証・オフライン用) + SQLAlchemy 2.0 + Alembic

---

## 1. データベース方針

- **検証・オフライン用エンジン**: **SQLite 3**（`backend/data/sanmou-test.sqlite3`）
  - 外部DBサーバーの起動が不要で、山林現場のノートPC単体で稼働可能なファイルベースDB。
  - SQLAlchemy 2.0 によるORM定義と、Alembicによるマイグレーション管理を適用。
  - スレッド間共有設定: `connect_args={"check_same_thread": False}`。
- **時刻管理**: すべて UTC の `TIMESTAMP` として保存。
- **削除方針**: センサーおよび関連データは**論理削除**（`is_deleted = true`）を基本とし、過去の観測・監査記録を物理削除しない。

---

## 2. 実装済みテーブル定義（実証用SQLite）

### 2.1 `sensors`（センサー台帳テーブル）
| カラム名 | 型 | NULL | 初期値 | 説明 |
|---|---|---|---|---|
| `id` | VARCHAR(36) | NO | UUIDv4 | 内部主キー（一意識別子） |
| `sensor_code` | VARCHAR(64) | NO | - | UI表示・検索用コード（大文字小文字区別なしUNIQUE） |
| `name` | VARCHAR(128) | NO | - | センサー名称 |
| `latitude` | FLOAT | NO | - | 設置緯度（-90.0 〜 90.0） |
| `longitude` | FLOAT | NO | - | 設置経度（-180.0 〜 180.0） |
| `is_deleted` | BOOLEAN | NO | `false` | 論理削除フラグ |
| `created_at` | TIMESTAMP | NO | 現在UTC | 登録日時 |
| `updated_at` | TIMESTAMP | NO | 現在UTC | 更新日時 |

### 2.2 `sensor_evaluation_states`（センサー判定状態テーブル）
センサーの観測重要度と機器状態を独立して保持するテーブル（`sensors` と 1:1 紐付け）。

| カラム名 | 型 | NULL | 初期値 | 説明 |
|---|---|---|---|---|
| `sensor_id` | VARCHAR(36) | NO | FK | 対象センサーID（主キー） |
| `observation_severity` | VARCHAR(16) | NO | `'unknown'` | 観測重要度（`normal`, `caution`, `danger`, `unknown`） |
| `communication_status` | VARCHAR(16) | NO | `'unknown'` | 通信状態（`online`, `offline`, `unknown`） |
| `low_battery` | BOOLEAN | YES | `NULL` | 低電池状態（`true` / `false` / `NULL:未判定`） |
| `device_fault` | BOOLEAN | YES | `NULL` | 故障状態（`true` / `false` / `NULL:未判定`） |
| `last_received_at` | TIMESTAMP | YES | `NULL` | サーバー最終受信日時 |
| `updated_at` | TIMESTAMP | NO | 現在UTC | 判定更新日時 |

### 2.3 `audit_logs`（変更監査ログテーブル）
台帳の新規登録や座標変更の前後差分を追跡記録するテーブル。

| カラム名 | 型 | NULL | 初期値 | 説明 |
|---|---|---|---|---|
| `id` | INTEGER | NO | AUTO_INCREMENT | 監査ログ連番主キー |
| `action` | VARCHAR(32) | NO | - | 操作種別（`create`, `update` 等） |
| `target_type` | VARCHAR(32) | NO | `'sensor'` | 対象エンティティ名 |
| `target_id` | VARCHAR(36) | NO | - | 対象エンティティのID |
| `before_payload` | TEXT | YES | `NULL` | 変更前のJSON表現 |
| `after_payload` | TEXT | NO | - | 変更後のJSON表現 |
| `created_at` | TIMESTAMP | NO | 現在UTC | 操作日時 |

---

## 3. ER図（実証用SQLite）

```mermaid
erDiagram
    SENSORS ||--|| SENSOR_EVALUATION_STATES : evaluates
    SENSORS ||--o{ AUDIT_LOGS : tracked_in

    SENSORS {
        string id PK
        string sensor_code UK
        string name
        float latitude
        float longitude
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    SENSOR_EVALUATION_STATES {
        string sensor_id PK,FK
        string observation_severity
        string communication_status
        boolean low_battery
        boolean device_fault
        datetime last_received_at
        datetime updated_at
    }

    AUDIT_LOGS {
        int id PK
        string action
        string target_type
        string target_id
        text before_payload
        text after_payload
        datetime created_at
    }
```

---

## 4. マイグレーション管理（Alembic）

スキーマ変更はすべて Alembic マイグレーションスクリプトとしてバージョン管理します。

```bash
# マイグレーション適用
alembic upgrade head

# 新規マイグレーション作成（モデル変更時）
alembic revision --autogenerate -m "add_new_table"
```
