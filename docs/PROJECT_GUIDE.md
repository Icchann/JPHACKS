# PROJECT_GUIDE.md — 開発・運用・実装ガイド

> 文書版: 2.0 / 2026-10-24  
> 対象: JPHACKS / 全体開発運用マニュアル

---

## 1. ディレクトリ構成と役割

```text
/
├── README.md               # JPHACKS提出用プロジェクト概要・プロダクト説明
├── AGENTS.md               # 最上位AIエージェント・開発統合規約
├── docs/                   # 仕様書・設計書・運用ドキュメント
│   ├── REQUIREMENTS.md     # 統合要件定義書（MVP vs 後続、オフライン要件）
│   ├── ARCHITECTURE.md     # システム構成図、オフライン・クロスプラットフォーム設計
│   ├── SCREEN_SPEC.md      # 画面仕様書、UIデザイン規約、遷移仕様
│   ├── API_SPEC.md         # FastAPI REST API契約仕様書
│   ├── DATABASE.md         # データベース仕様書（SQLiteスキーマ、Alembic）
│   ├── IMPLEMENTATION_PLAN.md # 段階実装計画とマイルストーン
│   ├── DECISIONS.md        # 設計判断・決定事項の記録
│   └── PROJECT_GUIDE.md    # （本書）開発・運用ガイド
├── frontend/               # Next.js 16.4 / React 19 / TypeScript (2-space)
│   ├── src/
│   │   ├── app/            # App Router (map, sensors, dashboard, api routes)
│   │   ├── components/     # 共通UIコンポーネント (Sidebar, Badge, Button, Map)
│   │   ├── features/       # 画面別機能モジュール (monitoring, sensor-detail, etc.)
│   │   └── lib/            # ユーティリティ、APIプロキシ
│   └── package.json
├── backend/                # FastAPI / Python 3.11+ (4-space)
│   ├── app/
│   │   ├── api/            # ルーティング、エンドポイント定義
│   │   ├── core/           # 設定（pydantic-settings）、エラーハンドラ
│   │   ├── db/             # SQLAlchemyセッション、エンジン管理
│   │   ├── device/         # シリアル受信、S0プロトコルパース、CSVストア
│   │   ├── models/         # SQLAlchemy ORMモデル
│   │   └── schemas/        # Pydanticバリデーションスキーマ
│   ├── alembic/            # DBマイグレーションスクリプト
│   ├── scripts/            # シリアル受信単体スクリプト、OpenAPI出力
│   └── tests/              # pytest単体テスト
├── scripts/                # クロスプラットフォーム一括起動スクリプト
│   └── run_test_environment.py # USB受信 + DB + FastAPI + Next.js 一括起動
└── backend/data/           # ローカルデータ保存先（.gitignore対象）
    ├── observations.csv    # 受信生テレメトリCSV
    └── sanmou-test.sqlite3 # 検証・オフライン用SQLite DB
```

---

## 2. 必要動作環境

- **Node.js**: `24.x`（Active LTS推奨、`.nvmrc` 参照。※EOLを迎えたNode 20系は開発・セキュリティ上の理由から非推奨）
- **Python**: `3.11.x`（`.python-version` 参照）
- **OS**: Windows 11 / macOS 14+ / Linux（クロスプラットフォーム両対応）

---

## 3. 初回セットアップ手順

### Windows (PowerShell)
```powershell
# 1. フロントエンドの依存関係インストール
npm --prefix frontend install

# 2. バックエンドの仮想環境作成とライブラリ導入
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install --upgrade pip
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
```

### macOS / Linux (bash / zsh)
```bash
# 1. フロントエンドの依存関係インストール
npm --prefix frontend install

# 2. バックエンドの仮想環境作成とライブラリ導入
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

---

## 4. 起動モードと手順

### 4.1 通常のWebデモ起動（ハードウェア機器不要）
UIデザインや画面遷移の確認を行いたい場合は、モックデータ（`source=demo`）で動作する通常開発モードを使用します。

**ターミナル1 (FastAPI)**:
```bash
# Windows
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
# macOS
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

**ターミナル2 (Next.js)**:
```bash
npm --prefix frontend run dev
```

- **アクセスURL**:
  - 衛星地図監視ホーム: `http://localhost:3000/map`
  - テレメトリダッシュボード: `http://localhost:3000/dashboard`
  - センサー台帳管理: `http://localhost:3000/sensors`
  - API ヘルスチェック: `http://127.0.0.1:8000/health`

---

### 4.2 実証実験・オフライン一括起動（実機または既存CSV）
集約機とのシリアル通信、SQLite永続化、高速CSV読込ダッシュボードをまとめて起動します。

**USB実機を接続する場合**:
```bash
# Windows (COMポート指定)
backend/.venv/Scripts/python scripts/run_test_environment.py --port COM3

# macOS (USBシリアルデバイス指定)
backend/.venv/bin/python scripts/run_test_environment.py --port /dev/tty.usbmodem1101
```

**USB実機を接続せず、既存CSVデータのみで実証画面を確認する場合**:
```bash
# Windows
backend/.venv/Scripts/python scripts/run_test_environment.py --no-serial

# macOS
backend/.venv/bin/python scripts/run_test_environment.py --no-serial
```

---

## 5. 品質検査コマンド

コミットや作業完了前に、各品質チェックが警告・エラーゼロで通ることを確認します。

### フロントエンド品質チェック
```bash
npm --prefix frontend run format:check   # Prettier 2-space インデント検査
npm --prefix frontend run lint           # ESLint 検査 (--max-warnings=0)
npm --prefix frontend run typecheck      # TypeScript 型検査
npm --prefix frontend run test           # Vitest 単体テスト
```

### バックエンド品質チェック
```bash
# Windows
backend/.venv/Scripts/python -m ruff format --check backend scripts
backend/.venv/Scripts/python -m ruff check backend scripts
backend/.venv/Scripts/python -m mypy backend/app backend/scripts scripts
backend/.venv/Scripts/python -m pytest backend

# macOS
backend/.venv/bin/python -m ruff format --check backend scripts
backend/.venv/bin/python -m ruff check backend scripts
backend/.venv/bin/python -m mypy backend/app backend/scripts scripts
backend/.venv/bin/python -m pytest backend
```

---

## 6. OpenAPI 型定義の自動同期

FastAPIのスキーマ変更時は、以下の手順でフロントエンドのTypeScript型定義を再生成します。

```bash
# Windows
backend/.venv/Scripts/python backend/scripts/export_openapi.py
npm --prefix frontend run api:types

# macOS
backend/.venv/bin/python backend/scripts/export_openapi.py
npm --prefix frontend run api:types
```
