# API_SPEC.md — FastAPI REST API契約仕様書

> 文書版: 2.0 / 2026-10-24  
> 対象: JPHACKS / FastAPI (Python 3.11) + Next.js BFF

---

## 1. 共通仕様

- **ベースURL**:
  - FastAPI直接: `http://127.0.0.1:8000`
  - Next.js BFFプロキシ: `http://localhost:3000/api/backend/*`
- **通信データ形式**: JSON (`application/json; charset=utf-8`)
- **タイムスタンプ**: ISO 8601 UTC形式（例: `2026-10-24T12:00:00Z`）
- **共通エラー形式**:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "入力内容に誤りがあります",
      "details": [
        {
          "location": ["body", "sensor_code"],
          "message": "空白以外の文字を入力してください",
          "type": "value_error"
        }
      ]
    }
  }
  ```
- **実証実験用ヘルス保護（一時トークン）**:
  テスト環境の管理エンドポイントには `X-Test-Token` ヘッダーによる保護を適用（起動時に自動生成され、Next.js BFFサーバー経由で付与）。

---

## 2. エンドポイント一覧

### 2.1 システム管理
| Method | パス | 説明 | 認証/ヘッダー |
|---|---|---|---|
| `GET` | `/health` | APIサーバーの稼働状態確認 | 不要 |
| `GET` | `/openapi.json` | OpenAPI 3.1 仕様スキーマの出力 | 不要 |

### 2.2 センサー台帳管理（FastAPI / SQLite）
| Method | パス | 説明 | 認証/ヘッダー |
|---|---|---|---|
| `GET` | `/sensors` | 登録済みセンサー一覧（カーソルページネーション対応） | `X-Test-Token` |
| `GET` | `/sensors/{id}` | 特定センサーの詳細および判定状態 | `X-Test-Token` |
| `POST` | `/sensors` | センサーの新規手動登録（ID、名称、緯度、経度） | `X-Test-Token` |
| `PATCH` | `/sensors/{id}` | センサー名称および設置座標の更新（監査ログ記録） | `X-Test-Token` |

#### `POST /sensors` リクエスト例
```json
{
  "sensor_code": "T1",
  "name": "木ノード01（尾根側）",
  "latitude": 35.1234567,
  "longitude": 137.9876543
}
```

#### `GET /sensors` レスポンス例
```json
{
  "items": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "sensor_code": "T1",
      "name": "木ノード01（尾根側）",
      "latitude": 35.1234567,
      "longitude": 137.9876543,
      "observation_severity": "unknown",
      "communication_status": "unknown",
      "low_battery": null,
      "device_fault": null,
      "last_received_at": null,
      "source": "device_test",
      "created_at": "2026-10-24T12:00:00Z",
      "updated_at": "2026-10-24T12:00:00Z"
    }
  ],
  "next_cursor": null
}
```

### 2.3 テレメトリ・観測生データ（実証実験用CSV読込）
| Method | パス | 説明 | 認証/ヘッダー |
|---|---|---|---|
| `GET` | `/test/observations` | 受信CSVから最新N件のS0生データを取得 | `X-Test-Token` |

#### クエリパラメータ
- `limit`: 取得件数（デフォルト: 500、最大: 1000）
- `node_id`: 特定ノードによる絞り込み（例: `T1`）

#### レスポンス例
```json
{
  "source": "device_test",
  "total_records": 128,
  "items": [
    {
      "node_id": "T1",
      "seq": 42,
      "hop": 1,
      "sample_ms": 125430,
      "ax_mg": 15,
      "ay_mg": -32,
      "az_mg": 998,
      "soil_raw": 1420,
      "battery_mv": 3280,
      "received_at": "2026-10-24T12:00:03Z"
    }
  ]
}
```

---

## 3. 型同期手順（FastAPI ↔ TypeScript）

FastAPIのOpenAPI定義からTypeScript型を同期し、フロントエンドとバックエンドの型安全性を100%保証します。

```bash
# 1. FastAPIからOpenAPIスキーマを出力
python backend/scripts/export_openapi.py

# 2. openapi-typescript でフロントエンド型を再生成
npm --prefix frontend run api:types
```
