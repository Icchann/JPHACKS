# README_build.md — 動作環境・ビルド・実行・テスト手順書

> 本書は、「山網（Sanmou）」システムのPC（フロントエンド/バックエンド）およびスマホアプリ（Flutter）の起動・ビルド・テスト手順をまとめた開発運用マニュアルです。  
> ※提出用の製品概要・機能説明は [README.md](README.md) をご覧ください。

---

## 🚀 起動方法（セットアップ不要・完全自動）

手動でのライブラリ導入（`npm install` や `pip install`、仮想環境作成など）は**一切不要**です。
初回起動時に必要な準備がすべて自動で行われ、数秒後にブラウザが自動で立ち上がります。

### 1. 実機メイン起動（外付けUSB集約機を接続して動かす場合）

- **Windows**: フォルダ内の **`start.bat` をダブルクリック**（COMポート番号を入力）
- **Mac / Linux**: ターミナルで **`./start.sh`** を実行

> 自動でUSBシリアル受信・SQLite DB・FastAPI・Next.js画面が一括起動し、**リアルタイム波形ダッシュボード（`http://localhost:3000/dashboard`）** が開きます。

### 2. デモ画面起動（機器を繋がずに画面や地図を確認したい場合）

- **Windows**: フォルダ内の **`start_demo.bat` をダブルクリック**
- **Mac / Linux**: ターミナルで **`./start_demo.sh`** を実行

> 自動で画面サーバーが立ち上がり、ブラウザで **森林基本図マップ（`http://localhost:3000/map`）** が開きます。

### 🛑 終了する方法（ワンステップ）

起動している黒い画面（ウィンドウ）で **`Ctrl + C` を押すか、ウィンドウの「×」ボタンで閉じるだけ** で安全に全処理が停止します。

---

## 動作環境・必要要件

- **Node.js**: 24.x（Active LTS推奨。22.x / 24.x 対応）
- **Python**: 3.11.x 以上
- **Flutter**: 3.x 以上（スマホアプリ用）
- **対応OS**: Windows 11 / macOS 14+ / Linux（クロスプラットフォーム両対応）

---

## 画面確認URL一覧

- 🌲 **山林監視メインスクリーン**: `http://localhost:3000/map`
  - 森林基本図（御在所岳等高線図・下絵オーバーレイ）、汎用パンくずリスト
  - 多層レイヤー切替（休憩所、私有地境界、作業道、危険生物、地質）
  - 測量標センサーピン（🌲樹木 / ⛰️斜面）、静的危険バッジ
  - ピンをクリックすると、直近24時間の時系列推移グラフを含む **詳細モーダル** が開きます。
  - 山林切替の `[＋]` ボタンから新規山林・下絵図面を登録可能。
- 📈 **テレメトリダッシュボード**: `http://localhost:3000/dashboard`
  - 実機シリアルから届く3軸加速度・土壌生値・電池電圧を3秒ごとにリアルタイム描画。
- 📋 **センサー管理台帳**: `http://localhost:3000/sensors`
  - センサーの手動登録・緯度経度編集（SQLite永続化）。
- 🩺 **API ヘルスチェック**: `http://127.0.0.1:8000/health`

---

## 💻 PC側（Next.js / FastAPI）の品質検査・テスト手順

```bash
# フロントエンド自動テスト（全18ファイル / 70テスト）
npm --prefix frontend run test

# TypeScript 厳格型検査（型エラーゼロを検証）
npm --prefix frontend run typecheck

# ESLint 構文検査（警告ゼロ --max-warnings=0 を検証）
npm --prefix frontend run lint

# Prettier コードフォーマット検査
npm --prefix frontend run format:check

# プロダクションビルド検証
npm --prefix frontend run build

# バックエンド自動テスト（全31テスト）
backend/.venv/bin/pytest backend
backend/.venv/bin/mypy backend/app backend/scripts scripts
backend/.venv/bin/ruff check backend scripts
```

---

## 📱 スマホアプリ（Flutter）のビルド・実行手順

### 1. 実機 iPhone での実行・転送（推奨・NFC/BLE検証用）

1. iPhoneの「設定」→「プライバシーとセキュリティ」→「デベロッパーモード」をONにして再起動。
2. MacとiPhoneを有線ケーブルで接続し、「このコンピュータを信頼する」を許可。
3. 接続デバイス名を確認:
   ```bash
   flutter devices
   ```
4. 実機へビルド・転送して起動:
   ```bash
   flutter run -d <iPhoneのデバイス名>
   ```

### 2. ケーブルを抜いてiPhone単体で持ち歩く場合（Release実行）

```bash
flutter run --release -d <iPhoneのデバイス名>
```

※一度転送すれば、ケーブルを抜いてホーム画面のアイコンから単体起動できます。

### 3. Mac画面上の iOSシミュレータ で実行する場合

```bash
open -a Simulator
flutter run -d iphone
```

### 4. Chrome（Web）で最速で画面確認する場合

```bash
flutter run -d chrome
```

### 5. スマホアプリの自動テスト実行

```bash
flutter test
```

---

<details>
<summary>🛠️ 開発者向けの手動セットアップ・個別コマンド（任意）</summary>

※通常はダブルクリック（`start.bat` / `start_demo.bat`）で自動準備されるため、手動実行は不要です。

### 手動セットアップ手順

**Windows (PowerShell)**:

```powershell
npm --prefix frontend install
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
```

**macOS / Linux**:

```bash
npm --prefix frontend install
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

### 個別起動コマンド

```bash
# フロントエンド単体起動
npm --prefix frontend run dev

# バックエンド単体起動
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000

# 実機一括スクリプト（シリアルあり）
python scripts/run_test_environment.py --port COM3

# 実機一括スクリプト（シリアルなし・既存CSV確認）
python scripts/run_test_environment.py --no-serial
```

</details>
