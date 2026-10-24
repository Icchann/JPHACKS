# ARCHITECTURE.md — システム構成とアーキテクチャ設計

> 文書版: 2.0 / 2026-10-24  
> 対象: JPHACKS / Next.js + FastAPI + SQLite

---

## 1. システム論理構成と「適材適所」の設計思想

本システムは、「電波のない山林現場での完全オフライン自立」と「基地局・事務所でのネットワーク通知・データ同期」を両立するため、**「オフライン・ファースト ＋ 機会的ネットワーク同期（Opportunistic Sync）」** を採用しています。

また、Python一本化によるリスク（線描画性能の劣化、スマホ非対応、シリアル受信スレッドの競合）を回避するため、**ハード・通信・同期にはPython**を、**ベクター線描画・UIにはWeb標準（React / SVG）** を適材適所で配備しています。

```mermaid
flowchart TD
    subgraph Field[山林現場 (電波ゼロ・完全オフライン自立)]
        T1[樹木ノード T1 / T2<br/>土壌水分・加速度・電池]
        S1[斜面ノード S1 / S2<br/>土壌水分・加速度・電池]
        Collector[LoRa受信・集約機]
        T1 -->|LoRa長距離無線| Collector
        S1 -->|LoRa長距離無線| Collector
    end

    subgraph EdgePC[現場ノートPC / 基地局 PC]
        subgraph PyEngine[【Python層】ハード・数値処理・永続化]
            Serial[pyserial 受信エンジン<br/>115200bps / S0パケット検証]
            DB[(ローカルSQLite<br/>センサー台帳・判定ログ)]
            Math[傾斜角計算・水分校正<br/>NumPy・異常判定]
            Collector -->|USBシリアル| Serial
            Serial --> DB
            Serial --> Math
            Math --> DB
        end

        subgraph WebEngine[【Web/SVG層】ベクター線描画・現場UI]
            FastAPIServer[FastAPI REST API<br/>127.0.0.1:8000]
            ForestryMap[森林基本図 SVGマップ<br/>等高線・林道・境界・ピン]
            DB <--> FastAPIServer
            FastAPIServer <--> ForestryMap
        end
    end

    subgraph NetworkSync[基地局・事務所 (ネット接続時に自動発火)]
        FastAPIServer -.->|インターネット自動検知| AlertJob[緊急通知ワーカー]
        AlertJob -.->|外部送信| AdminEmail[全管理者宛 メール通知]
        AlertJob -.->|将来拡張| WebPush[現場作業員 スマホPush通知]
        PhoneWorker[現場スマホ<br/>※画面開発は一旦保留] -.->|Wi-Fi/LTE到達時に同期| FastAPIServer
    end
```

---

## 2. サービス責務

### 2.1 シリアル受信エンジン（Python）
- **責務**:
  - USBシリアルポートからの非同期・ストリーミング読み込み。
  - 改行コード（CRLF）単位の正確なフレームバッファリング（`SerialLineBuffer`）。
  - マイコン起動ログや不正文字列の安全なスキップ（例外を握りつぶさず件数を集計）。
  - S0形式レコードの数値バリデーション、受信タイムスタンプの付与、CSVへの逐次追記。
- **耐障害性**: ポートの切断・再接続時にもプロセス全体がクラッシュしない安全なリトライ構造。

### 2.2 FastAPI バックエンド（Python 3.11）
- **責務**:
  - 受信CSVファイルの高速・安全な読み出し（直近N件のスライシング）。
  - SQLiteデータベース（SQLAlchemy + Alembic）を用いたセンサー台帳、状態、変更監査ログのCRUD。
  - OpenAPIスキーマ（`openapi.json`）の公開とTypeScript型自動生成の正本提供。
  - 実証実験用の一時トークン認可（`X-Test-Token`）による管理APIの保護。

### 2.3 Next.js フロントエンド（React 19 / TypeScript）
- **責務**:
  - App RouterによるSSRおよびCSRのハイブリッド構成。
  - BFF（Backend For Frontend）層として `/api/test-*` を提供し、FastAPIとの通信および一時トークンの付与を隠蔽（ブラウザへのトークン露出を防止）。
  - Google Maps衛星写真のクライアント描画と、APIキー未設定時・オフライン時のフォールバックUI提供。
  - WAI-ARIA準拠のアクセシビリティ対応コンポーネント。

---

## 3. なぜこの技術スタックなのか（適材適所の選定理由）

本システムでは、「AIのテンプレート的な選定」を排除し、林業現場の物理的制約と技術的特性に基づき、各技術を適材適所で採用しています。

### 3.1 Python (FastAPI / pyserial / SQLAlchemy / NumPy) を選んだ理由
1. **シリアル通信（`pyserial`）の圧倒的安定性**:
   ESP32やLoRa集約機とのUSBシリアル通信（COMポート / TTY）を、WindowsとMacのOS差分なく最も安定して制御可能。Node.jsのシリアルライブラリのようにWindows環境でC++ビルドエラー（`node-gyp`）で破綻するリスクを完全に排除。
2. **傾斜角・土壌水分の数値計算・信号処理**:
   加速度3軸生データ（$a_x, a_y, a_z$）からピッチ・ロール角を計算する三角関数や、ノイズ除去（移動平均、ローパスフィルタ）、土壌水分校正テーブルの適用が最も容易。
3. **軽量なローカルSQLite永続化**:
   外部DBミドルウェアのセットアップなしに、ファイル1つでセンサー台帳・判定状態・監査ログを安全に管理。
4. **ネットワーク復帰時の非同期中継**:
   事務所で光回線やLTEに接続された際、バックグラウンドタスクで管理者宛メールやクラウド同期を安全に実行。

### 3.2 Web標準 (React 19 / SVG / CSS Modules) を選んだ理由
1. **「ベクター線描画」における圧倒的表現力とハードウェア加速**:
   森林基本図の等高線、沢筋、林道、境界線、時系列推移チャートなど、数千点のベクター線をGPUハードウェア加速で滑らかに描画できる環境は、ブラウザ標準（SVG/Canvas）以外に存在しない（PythonネイティブGUIのTkinterやmatplotlibではカクつきやデザイン劣化が著しい）。
2. **クロスデバイス対応（PC・タブレット・将来のスマホ）**:
   現場PC（Windows / Mac）だけでなく、将来のiPadや作業員のスマホ（iPhone / Android）でも、画面レイアウトを崩さずに同一のベクター線地図を表示可能。
3. **将来のスマホ機能（Web NFC / Web Push）の標準基盤**:
   専用アプリのインストールなしに、ブラウザ標準のWeb APIでNFCタグ読み取りやプッシュ通知を受信可能。

---

## 4. Python一本化（GUI含む）を採用しなかった理由（リスクの回避）

「すべてをPythonコードだけで書く（Tkinter, PyQt, Streamlit, Flet等）」アプローチを検討した結果、以下の3大リスクを回避するために採用を見送りました。

1. **スマホ（iOS / Android）で動作しなくなるリスク**:
   PythonのネイティブGUIはiPhoneやAndroidで動作せず、現場作業員のスマホ連携が永久に不可能になる。
2. **線描画性能と操作感の劣化**:
   Python GUIフレームワークは等高線やベクター地図の動的透過（30%薄く表示）やホバーツールチップの描画が重く、現場での実用に耐えない。
3. **シリアル受信と描画処理のスレッド競合（GIL問題）**:
   PythonのGIL（グローバルインタプリタロック）により、重い地図描画処理中にシリアル受信スレッドがブロックされ、115200bpsで届くLoRaパケットを取りこぼす致命的障害を防ぐため、受信（Python）と描画（ブラウザJSエンジン）のプロセス責務を明確に分離した。

---

## 5. オフライン自立と機会的同期（Opportunistic Sync）

1. **現場（山奥・電波ゼロ）**:
   - 現場PC単体で完全オフライン自立稼働。外部インターネットが遮断されていても、LoRa受信・DB保存・森林基本図SVGマップ表示が100%動作。
   - スマホ画面は**一旦開発を動かさず（保留）**、現場PCでの安全監視を最優先とする。
2. **基地局・事務所（電波・ネットあり）**:
   - 現場PCが事務所のインターネット回線に接続された際、FastAPIがそれを検知し、危険判定が出ているセンサーの警告を管理者宛にメール自動送信。

---

## 6. クロスプラットフォーム対応（Windows & macOS）

| 領域 | Windows (PowerShell) | macOS (POSIX bash/zsh) | 抽象化・対応方法 |
|---|---|---|---|
| **シリアルポート** | `COM3`, `COM4` 等 | `/dev/tty.usbmodem*` 等 | 引数 `--port` および環境変数で動的注入 |
| **起動スクリプト** | `scripts/run_test_environment.py` | 同一スクリプトで両対応 | `os.name` による `npm` vs `npm.cmd` の自動判定 |
| **パス処理** | `\` 区切り | `/` 区切り | Python `pathlib.Path` の全面使用 |
| **プロセス停止** | `taskkill` / `SIGTERM` | `SIGTERM` / `SIGINT` | `subprocess.Popen` の標準シグナルハンドリング |
| **Web動作** | Edge, Chrome 等 | Safari, Chrome 等 | 標準Web標準（HTML5 / SVG / CSS Modules）に準拠 |

---

## 7. 通信セキュリティとデータ境界

- **一時トークン（Ephemeral Token）**:
  実証実験スクリプト起動時に `secrets.token_urlsafe()` でランダム生成され、Next.js サーバー（Node.js）と FastAPI のプロセス間でのみ共有される。ブラウザのJavaScriptには一切露出しない。
- **CORS制限**:
  FastAPI側はローカルの `FRONTEND_ORIGIN`（デフォルト `http://localhost:3000`）のみを許可し、オープンな外部アクセスを遮断する。
