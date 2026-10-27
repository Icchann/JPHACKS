# API_SPEC.md — 現在のAPIと後続の契約

文書版：2.1 / 2026-10-26

実装確認の整理であり、本番公開・認証・耐久性を保証するものではない。FastAPIの実スキーマは `/openapi.json` とコードを正本とする。Next.js内の基準共有APIは別契約。

## 1. 接続先・保護

- FastAPI：標準の試験起動では `http://127.0.0.1:8000`。
- Next.js：PCからは `http://localhost:3000`。スマホはPCへ到達するアドレスを使用する。
- 台帳BFF：`/api/test-sensors`、`/api/test-sensors/[id]`。
- 観測BFF：`/api/test-observations`。
- 基準共有：`/api/test-baseline`（Next.js内のメモリ保持）。

試験用トークンをBFFからFastAPIへ付ける処理は、利用者の認証とは別。特に基準共有APIも含め、LAN共有の許可・入力検証は改善・試験対象。

## 2. FastAPI

| Method      | パス                 | 説明                                                                |
| ----------- | -------------------- | ------------------------------------------------------------------- |
| GET         | `/health`            | API疎通。無線受信継続の保証ではない                                 |
| GET         | `/openapi.json`      | 実装のスキーマ                                                      |
| GET / POST  | `/sensors`           | 台帳一覧・作成                                                      |
| GET / PATCH | `/sensors/{id}`      | 台帳の取得・編集                                                    |
| GET         | `/test/observations` | test環境のCSV観測取得                                               |
| DELETE      | `/test/observations` | test環境のCSV履歴クリア。データを失う操作で、試験でも無断実行しない |

台帳等には試験用 `X-Test-Token` を使う。詳細な環境条件・返却値はルート実装で確認する。

### 台帳作成の例（座標は架空）

```json
{
  "sensor_code": "T1",
  "name": "樹木ノード01",
  "latitude": 35.1234567,
  "longitude": 137.9876543,
  "installed_at": "2026-10-27T08:30:00Z",
  "position_accuracy_m": 4.5,
  "identity_method": "web_nfc",
  "position_method": "gps"
}
```

作成・編集スキーマにはID・名称・座標に加え、現場設置記録メタデータ（設置確定日時 `installed_at`、測位精度 `position_accuracy_m`、識別方法 `identity_method`、測位方法 `position_method`）を含みます（Issue #47）。

台帳一覧は `items` と `next_cursor` を返す。状態フィールドは `observation_severity`、`communication_status`、`device_fault_status`、`low_battery`、`last_received_at`、`installed_at` 等。列挙値・制約は `backend/app/schemas/sensors.py` に従う。

### 観測取得

- limit：デフォルト500、最大2000（FastAPIの現実装）。
- node_id：任意の機体ID絞り込み。
- sourceはdevice_test。土壌・電池の未計測はAPIでnull。
- received_atはPC受信日時。sample_msは機体起動後時刻。

レスポンス例（形式の説明用。実測ログではない）：

```json
{
  "items": [
    {
      "received_at": "2026-10-25T06:00:00Z",
      "node_id": "T1",
      "seq": 1,
      "hop": 0,
      "sample_ms": 3115,
      "ax_mg": -128,
      "ay_mg": -176,
      "az_mg": 928,
      "soil_raw": null,
      "battery_mv": null
    }
  ],
  "file_exists": true,
  "invalid_row_count": 0,
  "source": "device_test",
  "refreshed_at": "2026-10-25T06:00:01Z"
}
```

時刻はタイムゾーン付きで扱う。スマホの表示用ローカル時刻文字列と、観測のISO形式日時を直接比較しない。

## 3. Next.js基準共有API

コード：`frontend/src/app/api/test-baseline/route.ts`。

- GET：機体別baselinesとactiveAlertを返す。node_id指定時はその機体のbaselineも返す。
- POST：node_idとax・ay・az、任意のsetAtで基準を保存する。activeAlertやclearAlertも扱う。
- DELETE：node_id指定でその基準を削除、省略時は全基準を消す。警告も解除する。無断で実行しない。

現在の保存先はサーバーメモリで、SQLiteではない。setAtは表示用の時刻文字列も許容する。要求ID、採用観測ID、操作日時と確定日時、認証、数値の有効性・鮮度等を保証する完成版契約ではない。

## 4. 後続の同期・基準契約

以下は要求で、現在のエンドポイントがすべて満たすとはしない。

- 設置記録：位置精度、取得方法、日時、再設置・競合の履歴。
- 登録予約：要求ID、機体ID、操作日時、未同期・照合・失敗等の状態。
- 履歴採用：操作時刻付近の有効な観測を選び、元時刻・採用観測・時計差を記録する。
- 履歴なし：利用者が現在値採用を明示選択し、勝手に置換しない。
- 永続化・認証・再送の重複抑制・保存失敗の応答。

`/api/sensors/sync` や外部メールを、実装済みのAPIとして前提にしない。現在のスマホWebの手動再送は、既存の台帳作成・更新を利用する。

## 5. 型とエラー

FastAPIのスキーマ生成とTypeScript型同期は契約の一部を検査する手段であり、全体の型安全性や実行時入力の100%保証ではない。Next.js独自APIも別途検証する。

```bash
python backend/scripts/export_openapi.py
npm --prefix frontend run api:types
```

エラーの形はFastAPIのハンドラー・BFF・基準APIで異なる場合がある。未同期・認証失敗・API停止・機体未受信を一つの成功・正常へまとめない。
