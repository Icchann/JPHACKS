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

### 単独PC安全モード（既定）とLAN公開モードの切り替え

意図しない同一LAN内からのセンサー台帳改変や観測履歴削除を防ぐため、`scripts/run_test_environment.py` と `start.py` は既定で Next.js を `127.0.0.1`（単独PC安全モード）で待ち受けます。

スマホ実機（`/mobile`）など同一LAN内の別端末からアクセスする場合は、`--allow-lan` 引数（または環境変数 `SANMOU_ALLOW_LAN=1`）を指定して起動してください。

```bash
python scripts/run_test_environment.py --no-serial --allow-lan
```

さらに、変更・削除系API（`/api/test-sensors` の `POST`/`PATCH`/`DELETE`、`/api/test-observations` の `DELETE`）は Cross-Origin リクエスト（`Origin` 不一致）を `403 Forbidden` で拒否し、環境変数 `SANMOU_OPERATOR_TOKEN` 設定時は `X-Sanmou-Operator-Token` ヘッダー（または `operator_token` クエリ）が一致しないリクエストを `401 Unauthorized` で保護します。

## 3. 機器なしのデモ画面

Windowsは `start_demo.bat`、macOS / Linuxは `bash start_demo.sh` を使用します（LAN内のスマホから接続する場合は `python start.py --allow-lan` を実行します）。`start.py` はフロント依存を確認し、バックエンド仮想環境がある場合はその起動も試みます。初回のバックエンド導入をすべて行うスクリプトとは別です。

デモ値や仮座標は実機の測定結果ではありません。終了は起動元でCtrl+Cを使用し、プロセスが残っていないか確認してください。ウィンドウを閉じるだけで全環境の子プロセス停止が保証されるとはしません。

## 4. 画面

| URL                               | 用途・注意                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `http://localhost:3000/map`       | 機体位置・レイヤー・基準設定・警告等。実在地図とデモ図形を区別                                               |
| `http://localhost:3000/dashboard` | CSV観測の数値・履歴。未計測は未計測として表示                                                                |
| `http://localhost:3000/sensors`   | SQLite台帳の登録・編集                                                                                       |
| `http://localhost:3000/mobile`    | スマホ向けWeb画面。未同期キューからの同期は手動ボタン操作。スマホ実機からの接続時は `--allow-lan` で起動する |
| `http://127.0.0.1:8000/health`    | FastAPI疎通。機体の受信継続を保証するものではない                                                            |

スマホのlocalhostはスマホ自身です。PCとスマホ間はローカルWi-Fi等、`--allow-lan` による待受許可、ファイアウォール、必要に応じた `SANMOU_OPERATOR_TOKEN`、HTTPS・端末権限を確認します。現在の開発サーバーを公開インターネットへ露出しないでください。

本リポジトリで確認できるモバイル実装は Next.js Web 画面（`/mobile`）であり、圏外キューからの同期は手動ボタン操作です。Flutterネイティブアプリ、BLE近接SOS、帰社後の自動同期は将来構想であり、ここから `flutter run` する手順は存在しません。

また、データ上の時刻は `installed_at`（スマホでの設置記録時刻）、`sample_ms`（マイコン起動後ミリ秒）、`received_at`（PC受信時刻）の3種類に明確に区別されており、`installed_at` を記録しただけで `sample_ms` が絶対観測日時に変換されるわけではありません。

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

## 6. モバイルアプリのビルドと実行（Capacitor / iOS / Android）

山網は、ブラウザ版（`/mobile`）に加えて、iPhone実機でのBluetooth（CoreBluetooth）制限を突破するための **Capacitor ネイティブアプリ（iOS / Android）** を構成しています。

### 6.1 Windows / macOS 環境ごとの実行方針

| プラットフォーム        | Windows からの実行・ビルド                                                                                                                                                         | macOS からの実行・ビルド                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Android アプリ**      | **ローカルで完全対応 (◎)**<br>Android Studio または `./gradlew` で即座にビルド・実機転送可能                                                                                       | **ローカルで完全対応 (◎)**                                                                |
| **iPhone (iOS) アプリ** | **GitHub Actions（クラウド上のMac）で自動ビルド (◎)**<br>※Appleの規約によりローカルでのXcodeビルドにはMacが必要ですが、GitHubへpushすればクラウド上のMacランナーがビルド検証を実行 | **ローカルで完全対応 (◎)**<br>Xcodeから手元のiPhoneへ無料のApple IDで直接インストール可能 |

### 6.2 Windows 環境から進める場合（手元にMacがない場合）

1. **GitHub Actions クラウドビルドの活用**:
   - コードを変更してブランチまたはリポジトリへ `git push` すると、自動的に `.github/workflows/mobile-build.yml` がトリガーされます。
   - **iOS**: クラウド上の `macos-latest` ランナーで Xcode ビルド（コンパイル・依存関係解決）が実行され、ビルドエラーがないか自動検証されます。
   - **Android**: クラウド上の Linux ランナーで `app-debug.apk` が自動生成され、GitHub Actions の「Artifacts（成果物）」から直接ダウンロードして実機へインストールできます。
2. **Windows ローカルでの Android アプリビルド**:
   ```powershell
   cd frontend
   npx cap sync android
   npx cap open android
   ```
   Android Studio が立ち上がり、USB接続した Android 実機へ「Run」ボタン一発で転送できます。

### 6.3 macOS 環境での iPhone (iOS) 実機書き込み手順

手元に Mac がある場合、またはチーム内の Mac メンバーに依頼する場合：

1. リポジトリを取得し、Capacitor を同期します：
   ```bash
   cd frontend
   npx cap sync ios
   npx cap open ios
   ```
2. Xcode が開きます。手元の iPhone を USB ケーブルで接続します。
3. `App` ターゲットの「Signing & Capabilities」で、自分の個人の無料 Apple ID（Personal Team）を選択します（年間99ドルの有料開発者登録は不要です）。
4. 上部の実行先デバイスに接続した iPhone を選択し、**「Run (⌘R)」** を押すと、iPhone 実機へ直接山網アプリが書き込まれ起動します。

## 7. 品質コマンド

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
