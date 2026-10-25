# README_build.md — 起動・ビルド・検証手順

製品の目的は [README.md](README.md)、実装と試験の境界は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) と [docs/VALIDATION.md](docs/VALIDATION.md) を参照してください。

## 1. 準備とオフライン実行の区別

Node.js / npmとPythonが必要です。フロントエンドの許容Node版は `frontend/package.json` のengines、Pythonは3.11以上を確認してください。

初回は起動スクリプトが依存関係の導入を行うため、通常はパッケージ取得のための回線が必要です。実機受信の起動ではバックエンド仮想環境も準備します。PCやネットワークの状態で所要時間は変わるため、数秒・準備不要とは保証しません。

セットアップ済み環境でのローカル受信・保存・閲覧をオフラインで検証してください。外部地図やURL下絵、更新は別の接続条件があります。

Windows / macOSを主対象にしたコードですが、未試験のOS・端末を動作保証しません。使った版と成否を記録してください。

## 2. 実機を使う起動

リポジトリルートで実行します。

### Windows

```powershell
.\start.bat
```

集約機のCOMポートを入力します。他アプリのシリアルモニターが同じポートを開いていないか確認してください。

### macOS / Linux

```bash
bash start.sh
```

実際のUSBシリアルポートを指定します。未検出時は接続・権限を確認してください。

両スクリプトは `scripts/run_test_environment.py` へ進み、受信・FastAPI・Next.jsを起動します。ブラウザにはログのURLを開いてください。

シリアルなしで既存CSVを確認する場合：

```bash
python scripts/run_test_environment.py --no-serial
```

これは新しい無線受信の試験ではありません。

## 3. 機器なしのデモ画面

Windowsは `start_demo.bat`、macOS / Linuxは `bash start_demo.sh` を使用します。`start.py` はフロント依存を確認し、バックエンド仮想環境がある場合はその起動も試みます。初回のバックエンド導入をすべて行うスクリプトとは別です。

デモ値や仮座標は実機の測定結果ではありません。終了は起動元でCtrl+Cを使用し、プロセスが残っていないか確認してください。ウィンドウを閉じるだけで全環境の子プロセス停止が保証されるとはしません。

## 4. 画面

| URL                               | 用途・注意                                                          |
| --------------------------------- | ------------------------------------------------------------------- |
| `http://localhost:3000/map`       | 機体位置・レイヤー・基準設定・警告等。実在地図とデモ図形を区別      |
| `http://localhost:3000/dashboard` | CSV観測の数値・履歴。未計測は未計測として表示                       |
| `http://localhost:3000/sensors`   | SQLite台帳の登録・編集                                              |
| `http://localhost:3000/mobile`    | スマホ向けWeb画面。スマホからの接続にはPCの到達可能なアドレスを使う |
| `http://127.0.0.1:8000/health`    | FastAPI疎通。機体の受信継続を保証するものではない                   |

スマホのlocalhostはスマホ自身です。PCとスマホ間はローカルWi-Fi等、待受、ファイアウォール、認証、必要なHTTPS・端末権限を確認します。現在の開発サーバーを公開インターネットへ露出しないでください。

本リポジトリで確認できるモバイル実装はWebです。Flutterソースの所在が確認できていないため、ここから `flutter run` する手順は掲載しません。独立アプリ化は将来目標です。

## 5. 手動セットアップ

ロックファイルを用いたフロント依存の導入：

```bash
npm --prefix frontend ci
```

Windows：

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
```

macOS / Linux：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

試験用APIの環境・トークン・DBの準備は一括起動スクリプトと `.env.example` を確認してください。個別にフロントだけ起動しても、実機APIが動くとは限りません。

## 6. 品質コマンド

次は実行手順であり、現在の成功件数や全項目の合格を示すものではありません。

```bash
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

仮想環境を有効にしたPython環境で：

```bash
ruff format --check backend scripts
ruff check backend scripts
mypy backend/app backend/scripts scripts
pytest backend
```

結果にはコミット・環境・実行コマンド・失敗・未実行を添えます。自動テスト成功と、実機デモ・圏外動作・現場での業務効果は別々に記録してください。
