# IMPLEMENTATION_PLAN.md — 段階実装・検証計画

文書版：2.1 / 2026-10-26

## 1. 方針

目的は限られた人手で広い山林を把握する巡回支援。既存のローカル受信・表示を保ちながら、実機の核心体験、現場運用、多数ノードの順に検証する。

以前の「完了」は当時の報告であり、すべての環境・現場での受け入れ完了には読み替えない。本書のチェックは今後の確認事項で、コードがないことを示すものではない。

## 2. マイルストーン

### M0：開発環境・品質基盤

Next.js / FastAPIと品質コマンドは存在する。対象コミット・実行環境・成功と失敗を記録する。未実行のテストを成功扱いにしない。

### M1：地図による全体把握

地図・レイヤー・検索・台帳連携のコードを確認できる。デモ地形と実在地図、仮座標・プリセットと実測位置を区別する。

- [ ] 機体IDと設置位置が一致し、未登録・欠測が分かる。
- [ ] 地図の出典・座標整合・利用条件を確認する。

### M2：詳細・履歴

機体詳細・グラフ等のコードを確認できる。実機観測には実在する履歴のみを使う。

- [ ] 未計測の土壌・電池を確定値で補わない。
- [ ] 未判定・通信状態・基準状態を分ける。

### M3：受信・ローカル保存

USB受信、CSV、SQLite台帳、起動スクリプトがある。T1の受信ログが共有されている。

- [ ] 本番相当の機体・PCで再起動、USB切断、欠損、重複、保存失敗を試す。
- [ ] 外部回線なしの起動・受信・保存・閲覧を、準備条件付きで記録する。

### M4：基準からの変化・確認解除

PCとスマホの機体別基準・警告共有コードがある。現在の共有APIはメモリ保持。

- [ ] 基準設定 → 傾ける → 対象の変化 → 確認・解除 → 再試行を通す。
- [ ] 古い値・全軸ゼロ・基準未設定で誤判定しない。
- [ ] 認証・基準の永続化・安定性・時刻の扱いを改善する。

### M5：ダッシュボードと取得性能

CSVの最新値・グラフ・末尾読込等の実装がある。

- [ ] 機体一覧と履歴の件数制限で、低頻度機体が消えないか確認する。
- [ ] 大量履歴、機体絞り込み、ページング、連続稼働の応答・メモリを測る。

### M6：現場端末と配布

スマホWebのNFC関連処理・登録・未同期キュー・手動再送がある。Flutter・BLE等を完成済みとしない。

- [ ] 非対応NFC・位置取得失敗・保存失敗・通信中断で正確な結果を表示する。
- [ ] 圏外の初回起動、保存保持、競合、認証を実機確認する。
- [ ] 登録操作時刻の履歴照合と、履歴なし時の現在値選択を実装する。
- [ ] PC・スマホの独立アプリ配布、地図のローカル素材、バックアップと復旧を検討する。

### M7：多数ノードと業務評価

数百〜数千ノードを一人で把握することは将来目標。

- [ ] PC側の模擬負荷と無線側の実機容量を別々に試験する。
- [ ] 既存業務と、確認候補を選ぶ時間・移動・設置保守の総工数を比較する。
- [ ] 利用者と合格条件を定め、未達なら対象や取得周期・表示を見直す。

### M8：海外適用・通知拡張

- [ ] 海外の業務、規制、地図、電源、保守、競合を調査する。
- [ ] ウェアラブル・近接SOS等の到達性・認知・誤通知を別試験する。
- [ ] 実証前に世界初・追随不可能・安全保証を記載しない。

## 3. 次へ進む条件

[VALIDATION.md](VALIDATION.md) に沿って、条件・成否・残る限界を記録する。現場協力が得られない場合は技術試験と操作試験に限定し、業務効果を主張しない。担当・納期・試験の数値目標は未確定で、この文書から新たに確定しない。

## 4. マップ改善および Issue #27〜#36 対応の段階実装計画書（2026-10-26）

ユーザー承認のもと、以下の5フェーズ（Phase 1〜Phase 5）の順序で実装・検証・Git反映を実施する。

### Phase 1: マップUI・スクロール分離・凡例外出し・固定座標投影（Issue #33 & UX改善）

- **対象ファイル**:
  - `frontend/src/features/monitoring/components/offline-mountain-map.tsx`
  - `frontend/src/features/monitoring/components/offline-mountain-map.module.css`
  - `frontend/src/features/monitoring/components/monitoring-home.tsx`
  - `frontend/src/features/monitoring/components/monitoring-home.module.css`
- **実装内容**:
  1. **スクロール分離**: 通常表示時の単なるホイール操作では地図の `panOffset` を動かさず、`Ctrl`/`⌘` + ホイール時（および全画面拡大表示時）のみネイティブ非 passive リスナーで `preventDefault()` してズームする。`overscroll-behavior: contain` を適用する。
  2. **凡例の外出し**: SVG内の `<g className={styles.mapLegend}>` を削除し、地図ヘッダー／フッターへ重ならないコンパクト凡例バー（開閉トグル対応）として分離する。
  3. **案C（固定工区グリッド投影＋相対区画スロット）の実装**:
     - `OfflineMountainMap` に `mountainBounds: { minLat, maxLat, minLon, maxLon }` を渡し、検索やセンサー増減で `bounds` が変動しない固定投影にする。
     - 工区固定枠外のセンサー（会場座標等）は図面を引き伸ばさず「現地仮設・相対区画スロット」に整列配置し、参考配置バッジを表示する。
     - `dataMode === "test"` 時はデモ用の `DEMO_OVERLAY_PATHS` / `DEMO_OVERLAY_POINTS` を除外する。

### Phase 2: 画面横断の姿勢・状態判定統一とAPI停止時の鮮度凍結修正（Issue #27, #28, #31）

- **対象ファイル**:
  - `frontend/src/features/monitoring/monitoring-utils.ts`
  - `frontend/src/features/monitoring/components/monitoring-home.tsx`
  - `frontend/src/features/sensor-management/components/sensor-management.tsx`
  - `frontend/src/app/sensors/[id]/page.tsx`
  - `frontend/src/features/sensor-detail/components/sensor-detail.tsx`
  - `frontend/src/features/mobile/components/mobile-home.tsx`
  - `frontend/src/features/dashboard/use-test-observations.ts`
- **実装内容**:
  1. **Issue #27**: `mobile-home.tsx` で `dataMode === "test"` の未受信時に固定観測値を返すフォールバックを廃止して `null` とし、`POST /api/test-baseline` の `res.ok` を確認してから同期成功/失敗を表示する。
  2. **Issue #28**: `monitoring-utils.ts` に共通の評価関数 `evaluateLiveSensorState(sensor, latestObs, baseline, nowMs)` を新設し、地図・台帳・詳細・モバイルの4画面すべてで同一の傾斜角（基準差 vs 基準未設定の区別）および `unknown` 維持（`unknown` を勝手に `normal` や `ok` に変換しない）を徹底する。
  3. **Issue #31**: `useTestObservations` および監視画面に実時間クロック（`nowMs` 定期更新）と API エラー状態を導入し、API 停止後に `refreshed_at` が止まっても60秒経過で確実に受信途絶（または API 取得エラー・古い値）へ遷移させる。

### Phase 3: 機体別基準・警告管理の分離永続化と圏外キュー保存検証（Issue #29, #30）

- **対象ファイル**:
  - `frontend/src/app/api/test-baseline/route.ts`
  - `frontend/src/features/monitoring/components/monitoring-home.tsx`
  - `frontend/src/features/mobile/components/mobile-home.tsx`
- **実装内容**:
  1. **Issue #29**: `/api/test-baseline` の警告管理を単一 `activeAlert` から機体別の `activeAlerts: Record<string, AlertData>` に変更し、ローカルJSONファイルへの永続化と入力バリデーション（全軸ゼロ `(0,0,0)` や数値以外の拒否）を追加する。`S1` の基準設定や削除で `T1` の警告が消えないようにし、モバイル側の基準同期も削除済みキーが反映される完全置換方式に修正する。
  2. **Issue #30**: `persistPendingQueue` で `localStorage.setItem` の例外を検知して `boolean` を返し、保存失敗時には成功バナーを出さずエラーメッセージと再試行・控え表示を行う。

### Phase 4: LAN共有時の管理・基準APIの操作保護とWindows BOMテスト/CI整備（Issue #32, #35）

- **対象ファイル**:
  - `frontend/src/lib/test-api-proxy.ts`
  - `frontend/src/app/api/test-baseline/route.ts`
  - `frontend/src/app/api/test-observations/route.ts`
  - `scripts/run_test_environment.py`
  - `backend/tests/test_csv_store.py`
  - `.github/workflows/ci.yml`
- **実装内容**:
  1. **Issue #32**: `run_test_environment.py` でデフォルトは `127.0.0.1` 待受（`--lan` 指定時のみ `0.0.0.0` 待受）に分離し、`/api/test-baseline` にも `SANMOU_APP_ENV === "test"` チェックおよび同一オリジン／操作キー検証を追加する。
  2. **Issue #35**: `backend/tests/test_csv_store.py` の `test_append_accepts_existing_utf8_bom_header` で `write_bytes` を使用して Windows での `CRCRLF` 化を修正し、`.github/workflows/ci.yml`（Ubuntu / Windows / macOS）を追加する。

### Phase 5: ドキュメント・審査準備検証記録の最終整合（Issue #34, #36, #3）

- **対象ファイル**:
  - `README.md`, `README_build.md`, `FUTURE_WORK.md`, `docs/VALIDATION.md`
- **実装内容**:
  - PR #37 の統合内容をベースに、新しく追加したテスト結果・画面仕様・制限事項を `docs/VALIDATION.md` および `README.md` に反映する。
