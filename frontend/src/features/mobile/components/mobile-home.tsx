"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTestObservations } from "../../dashboard/use-test-observations";
import styles from "./mobile-home.module.css";

type MobileHomeProps = {
  dataMode?: "demo" | "test";
  initialNodeId?: string;
};

// 林業現場の作業員・タニさんが携帯するスマートフォン専用の画面
// （PC画面の誤アクセスを防ぎ、大ボタン警報モニターとGPS時刻固定登録を提供）
export function MobileHome({
  dataMode = "demo",
  initialNodeId = "T1",
}: MobileHomeProps) {
  const [activeTab, setActiveTab] = useState<"monitor" | "register">("monitor");
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodeId);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [alertReason, setAlertReason] = useState("");
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  // 実機テスト観測データの購読（デモモード時は不要なポーリングを抑制）
  const { data: testData, error: testObsError } = useTestObservations(
    dataMode === "test",
  );

  // 対象ノードの最新観測データを抽出
  const latestObs = useMemo(() => {
    if (!testData?.items || testData.items.length === 0) return null;
    const matches = testData.items.filter(
      (item) => item.node_id === selectedNodeId,
    );
    return matches.at(-1) ?? null;
  }, [testData, selectedNodeId]);

  // 各機体の基準姿勢（キャリブレーション値）辞書
  const [baselines, setBaselines] = useState<
    Record<string, { ax: number; ay: number; az: number; setAt: string }>
  >({});

  // サーバーに保存された最新基準姿勢を定期取得（PCとの双方向同期）
  useEffect(() => {
    let mounted = true;
    const loadBaselines = async () => {
      try {
        const res = await fetch("/api/test-baseline", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          baselines?: Record<
            string,
            { ax: number; ay: number; az: number; setAt: string }
          >;
          baseline?: {
            ax: number;
            ay: number;
            az: number;
            setAt: string;
          } | null;
        };
        if (!mounted) return;
        if (data?.baselines) {
          setBaselines((prev) => ({ ...prev, ...data.baselines }));
        } else if (data?.baseline) {
          setBaselines((prev) => ({
            ...prev,
            [selectedNodeId]: data.baseline!,
          }));
        }
      } catch {
        // オフライン・通信エラー時は手元の基準を維持
      }
    };
    void loadBaselines();
    const timer = window.setInterval(loadBaselines, 2000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selectedNodeId]);

  const currentBaseline = baselines[selectedNodeId] ?? null;

  // 基準姿勢からの角度変位（内積・コサイン類似度）
  const relativeTiltDeg = useMemo(() => {
    if (!latestObs) return null;
    // seq=0 の全軸ゼロは除外
    if (
      latestObs.ax_mg === 0 &&
      latestObs.ay_mg === 0 &&
      latestObs.az_mg === 0
    ) {
      return null;
    }
    if (!currentBaseline) {
      const horiz = Math.sqrt(latestObs.ax_mg ** 2 + latestObs.ay_mg ** 2);
      return (
        (Math.atan2(horiz, Math.max(Math.abs(latestObs.az_mg), 1)) * 180) /
        Math.PI
      );
    }
    const dot =
      latestObs.ax_mg * currentBaseline.ax +
      latestObs.ay_mg * currentBaseline.ay +
      latestObs.az_mg * currentBaseline.az;
    const normCurr = Math.sqrt(
      latestObs.ax_mg ** 2 + latestObs.ay_mg ** 2 + latestObs.az_mg ** 2,
    );
    const normBase = Math.sqrt(
      currentBaseline.ax ** 2 +
        currentBaseline.ay ** 2 +
        currentBaseline.az ** 2,
    );
    if (normCurr === 0 || normBase === 0) return null;
    const cosTheta = Math.max(-1.0, Math.min(1.0, dot / (normCurr * normBase)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  }, [latestObs, currentBaseline]);
  // GPS設置登録用ステート
  const [regNodeId, setRegNodeId] = useState("T1");
  const [regName, setRegName] = useState("タニ装着ノード（木ノードT1）");
  const [capturedLat, setCapturedLat] = useState<string>("");
  const [capturedLon, setCapturedLon] = useState<string>("");
  const [capturedTime, setCapturedTime] = useState<string>("");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [regSuccessMessage, setRegSuccessMessage] = useState<string | null>(
    null,
  );

  // Web Audio API による自律型アラーム音生成（外部音声ファイル不要）
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);
  const startAlarmSound = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        ("webkitAudioContext" in window
          ? (window.webkitAudioContext as typeof AudioContext)
          : undefined);
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      // 周期的なビープ音を発振
      clearInterval(alarmIntervalRef.current ?? undefined);
      const playBeep = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      };

      playBeep();
      alarmIntervalRef.current = window.setInterval(playBeep, 500);
    } catch {
      // Audio not permitted yet
    }
  }, []);

  const stopAlarmSound = useCallback(() => {
    clearInterval(alarmIntervalRef.current ?? undefined);
    alarmIntervalRef.current = null;
  }, []);

  // 警報トリガー（傾き検知または手動テスト）
  const triggerAlarm = useCallback(
    (reason: string) => {
      setIsAlertActive(true);
      setAlertReason(reason);
      startAlarmSound();

      // Android/対応ブラウザでのバイブレーション発火
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([400, 150, 400, 150, 600]);
        } catch {
          // Ignored
        }
      }
    },
    [startAlarmSound],
  );

  const dismissAlarm = useCallback(() => {
    setIsAlertActive(false);
    setAlertReason("");
    setAlarmDismissed(true);
    stopAlarmSound();
  }, [stopAlarmSound]);

  const setBaselinePosture = useCallback(() => {
    if (
      !latestObs ||
      (latestObs.ax_mg === 0 && latestObs.ay_mg === 0 && latestObs.az_mg === 0)
    ) {
      alert(
        "有効な加速度データを受信していません。seq=0の全軸ゼロは基準にできません。",
      );
      return;
    }
    const setAt = new Date().toLocaleTimeString("ja-JP");
    const newBase = {
      ax: latestObs.ax_mg,
      ay: latestObs.ay_mg,
      az: latestObs.az_mg,
      setAt,
    };
    setBaselines((prev) => ({ ...prev, [selectedNodeId]: newBase }));
    setIsAlertActive(false);
    setAlertReason("");
    setAlarmDismissed(false);
    stopAlarmSound();

    void fetch("/api/test-baseline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: selectedNodeId, ...newBase }),
    }).catch(() => {});
  }, [latestObs, selectedNodeId, stopAlarmSound]);

  // 基準姿勢が確定しているときのみ、相対角度15°以上を検知して自動警報
  useEffect(() => {
    if (!currentBaseline || relativeTiltDeg === null) return;
    if (relativeTiltDeg < 15.0) {
      if (alarmDismissed) {
        const resetTimer = setTimeout(() => {
          setAlarmDismissed(false);
        }, 0);
        return () => clearTimeout(resetTimer);
      }
      return;
    }
    if (relativeTiltDeg >= 15.0 && !isAlertActive && !alarmDismissed) {
      const timer = setTimeout(() => {
        triggerAlarm(
          `姿勢変位 +${relativeTiltDeg.toFixed(1)}° を検知しました（確定した基準姿勢から大きく変動）`,
        );
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [
    relativeTiltDeg,
    isAlertActive,
    alarmDismissed,
    triggerAlarm,
    currentBaseline,
  ]);
  useEffect(() => {
    return () => {
      stopAlarmSound();
    };
  }, [stopAlarmSound]);
  // GPSおよび端末時計の取得（センサー時計不在の補完）
  const captureGpsLocation = () => {
    if (!navigator.geolocation) {
      alert(
        "お使いの端末はGPS測位に対応していません。手動で入力してください。",
      );
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturedLat(pos.coords.latitude.toFixed(6));
        setCapturedLon(pos.coords.longitude.toFixed(6));
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setCapturedTime(new Date().toLocaleString("ja-JP"));
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        alert(
          `GPS測位に失敗しました: ${err.message}。会場プリセットを使用できます。`,
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // 会場座標（名古屋）プリセット入力
  const applyVenuePreset = () => {
    setCapturedLat("35.154210");
    setCapturedLon("136.966420");
    setGpsAccuracy(3);
    setCapturedTime(new Date().toLocaleString("ja-JP"));
  };

  // 設置登録の送信（既存ノード重複409時はPATCH更新へフォールバック、通信断時はlocalStorage保存）
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedLat || !capturedLon) {
      alert("位置情報を取得してください。");
      return;
    }

    const latNum = parseFloat(capturedLat);
    const lonNum = parseFloat(capturedLon);
    const payload = {
      sensor_code: regNodeId,
      name: regName,
      latitude: latNum,
      longitude: lonNum,
    };

    const savePendingToLocalStorage = () => {
      try {
        const key = "sanmou_pending_registrations";
        const raw = window.localStorage.getItem(key);
        const list = raw ? (JSON.parse(raw) as unknown[]) : [];
        list.push({ ...payload, capturedAt: capturedTime });
        window.localStorage.setItem(key, JSON.stringify(list));
      } catch {
        // localStorage unavailable
      }
    };

    try {
      const response = await fetch("/api/test-sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setRegSuccessMessage(
          `✓ 機体 ${regNodeId} を現在地（${capturedLat}, ${capturedLon}）で登録しました！`,
        );
        return;
      }

      if (response.status === 409) {
        // 既に登録済みのsensor_codeの場合は一覧から検索してPATCHで座標と名称を更新する
        const listRes = await fetch("/api/test-sensors?limit=200", {
          cache: "no-store",
        });
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            items?: Array<{ id: string; sensor_code: string }>;
          };
          const existing = listData.items?.find(
            (item) => item.sensor_code === regNodeId,
          );
          if (existing) {
            const patchRes = await fetch(
              `/api/test-sensors/${encodeURIComponent(existing.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: regName,
                  latitude: latNum,
                  longitude: lonNum,
                }),
              },
            );
            if (patchRes.ok) {
              setRegSuccessMessage(
                `✓ 機体 ${regNodeId} の設置位置を現在地（${capturedLat}, ${capturedLon}）に更新しました！`,
              );
              return;
            }
          }
        }
      }

      savePendingToLocalStorage();
      setRegSuccessMessage(
        `✓ 機体 ${regNodeId} の登録データをローカルに保存しました（帰社後同期）`,
      );
    } catch {
      savePendingToLocalStorage();
      setRegSuccessMessage(
        `✓ 機体 ${regNodeId} の登録データを端末内に保存しました（完全圏外モード）`,
      );
    }
  };

  const connectionBadgeLabel = useMemo(() => {
    if (dataMode !== "test") {
      return "🟢 デモ接続中";
    }
    if (testObsError) {
      return "🔴 通信オフライン";
    }
    if (latestObs) {
      return "🟢 実機受信中";
    }
    return "🟡 受信待機中";
  }, [dataMode, testObsError, latestObs]);

  return (
    <div
      className={`${styles.mobileContainer} ${isAlertActive ? styles.alertPulseBg : ""}`}
    >
      {/* 画面上部ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <span className={styles.brandEmoji} aria-hidden="true">
            🌲
          </span>
          <div>
            <strong>山網 現場モバイル</strong>
            <span className={styles.subtext}>
              {dataMode === "test" ? "実機テストモード" : "デモ運用"}
            </span>
          </div>
        </div>
        <span className={styles.badgeOnline}>{connectionBadgeLabel}</span>
      </header>

      {/* ナビゲーションタブ（手袋対応・大径） */}
      <nav
        aria-label="モバイル機能切替"
        className={styles.tabsNav}
        role="tablist"
      >
        <button
          aria-selected={activeTab === "monitor"}
          className={`${styles.tabBtn} ${activeTab === "monitor" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("monitor")}
          role="tab"
          type="button"
        >
          🚨 現場警報モニター
        </button>
        <button
          aria-selected={activeTab === "register"}
          className={`${styles.tabBtn} ${activeTab === "register" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("register")}
          role="tab"
          type="button"
        >
          📍 機体GPS設置登録
        </button>
      </nav>

      {/* メインコンテンツ */}
      <main className={styles.content}>
        {activeTab === "monitor" ? (
          <section
            className={styles.monitorSection}
            aria-label="現場安全警報モニター"
          >
            {/* 警報発火時の全画面アラートカード */}
            {isAlertActive ? (
              <div className={styles.activeAlertCard} role="alert">
                <div className={styles.alarmIconAnim}>🚨</div>
                <h2 className={styles.alertHeading}>大きな姿勢変化を検知！</h2>
                <p className={styles.alertDetail}>{alertReason}</p>
                <div className={styles.actionGuide}>
                  <strong>作業員へ退避指示を発令してください</strong>
                  <span>周囲の斜面崩壊・倒木・滑落に注意してください</span>
                </div>
                <button
                  className={styles.calibrateAlarmBtn}
                  onClick={setBaselinePosture}
                  type="button"
                >
                  🎯 現在の姿勢を0°基準に再設定して警報解除
                </button>
                <button
                  className={styles.dismissAlarmBtn}
                  onClick={dismissAlarm}
                  type="button"
                >
                  🔕 警報音を停止して確認
                </button>
              </div>
            ) : (
              /* 平常監視カード */
              <div className={styles.normalMonitorCard}>
                <div className={styles.statusRow}>
                  <span className={styles.statusIcon}>🟢</span>
                  <div>
                    <h2 className={styles.normalHeading}>正常監視中</h2>
                    <span className={styles.targetNodeText}>
                      監視対象: {selectedNodeId}（
                      {selectedNodeId === "T1"
                        ? "タニ装着ノード"
                        : "林業センサー"}
                      ）
                    </span>
                    <div className={styles.monitorNodeSelector}>
                      {["T1", "S1", "T2", "S2"].map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={`${styles.miniNodeBtn} ${selectedNodeId === id ? styles.activeMiniBtn : ""}`}
                          onClick={() => setSelectedNodeId(id)}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.metricsList}>
                  <div className={styles.metricItem}>
                    <span>姿勢傾斜角</span>
                    <strong>
                      {latestObs
                        ? latestObs.ax_mg === 0 &&
                          latestObs.ay_mg === 0 &&
                          latestObs.az_mg === 0
                          ? "初期化中 (全軸0)"
                          : relativeTiltDeg !== null
                            ? `+${relativeTiltDeg.toFixed(1)}° (${currentBaseline ? "基準差" : "基準未設定・仮算出"})`
                            : "計算不可"
                        : "待機中"}
                    </strong>
                  </div>
                  <div className={styles.metricItem}>
                    <span>土壌水分生値</span>
                    <strong>
                      {latestObs
                        ? latestObs.soil_raw === null ||
                          latestObs.soil_raw === -1
                          ? "未計測 (未接続)"
                          : `${latestObs.soil_raw} ADC`
                        : "待機中"}
                    </strong>
                  </div>
                  <div className={styles.metricItem}>
                    <span>電池電圧</span>
                    <strong>
                      {latestObs
                        ? latestObs.battery_mv === null ||
                          latestObs.battery_mv === -1
                          ? "未計測 (未接続)"
                          : `${latestObs.battery_mv} mV`
                        : "待機中"}
                    </strong>
                  </div>
                </div>

                <div className={styles.baselineBox}>
                  {currentBaseline ? (
                    <div className={styles.baselineStatus}>
                      <span>
                        🎯 基準姿勢確定済み ({currentBaseline.setAt}):
                      </span>
                      <code>
                        ax={currentBaseline.ax}, ay={currentBaseline.ay}, az=
                        {currentBaseline.az} mg
                      </code>
                      <button
                        type="button"
                        className={styles.resetBaselineBtn}
                        onClick={setBaselinePosture}
                      >
                        現在の姿勢で基準を再設定
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.setBaselineBtn}
                      onClick={setBaselinePosture}
                    >
                      🎯 タニ直立時の姿勢を「基準姿勢」に確定（現在:
                      基準未設定）
                    </button>
                  )}
                </div>

                <div className={styles.testActionBlock}>
                  <span className={styles.testHint}>
                    実演ピッチ用テスト操作:
                  </span>
                  <button
                    className={styles.triggerTestBtn}
                    onClick={() =>
                      triggerAlarm(
                        "タニさんが体を20°傾けました（模擬倒木検知実演）",
                      )
                    }
                    type="button"
                  >
                    ⚠️ 警報アラートを実演テスト発火
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          /* 機体GPS設置登録タブ（手袋対応大ボタン） */
          <section
            className={styles.registerSection}
            aria-label="機体GPS設置登録"
          >
            <header className={styles.regHeader}>
              <h2>機体GPS・時刻固定登録</h2>
              <p>
                センサーに時計・GPSがない制約をスマホ内蔵機能で自動補完します
              </p>
            </header>

            {regSuccessMessage && (
              <div className={styles.successBanner} role="status">
                {regSuccessMessage}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className={styles.regForm}>
              <div className={styles.nodeSelectRow}>
                <span className={styles.fieldLabel}>機体IDを選択:</span>
                <div className={styles.nodeChips}>
                  {["T1", "S1", "T2", "S2"].map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`${styles.nodeChip} ${regNodeId === id ? styles.activeChip : ""}`}
                      onClick={() => {
                        setRegNodeId(id);
                        setRegName(
                          id.startsWith("T")
                            ? `樹木ノード ${id}`
                            : `斜面ノード ${id}`,
                        );
                      }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.gpsActionBox}>
                <button
                  type="button"
                  className={styles.captureGpsBigBtn}
                  onClick={captureGpsLocation}
                  disabled={isLocating}
                >
                  {isLocating ? "⏳ 測位中..." : "📍 現在地GPSと時刻を取得"}
                </button>
                <button
                  type="button"
                  className={styles.venuePresetBtn}
                  onClick={applyVenuePreset}
                >
                  🏛️ 会場（名古屋）座標を即時セット
                </button>
              </div>

              {capturedLat && (
                <div className={styles.capturedSummary}>
                  <div className={styles.summaryRow}>
                    <span>取得緯度:</span>
                    <strong>{capturedLat}° N</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>取得経度:</span>
                    <strong>{capturedLon}° E</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>設置時刻:</span>
                    <strong>{capturedTime}</strong>
                  </div>
                  {gpsAccuracy !== null && (
                    <div className={styles.summaryRow}>
                      <span>測位精度:</span>
                      <span>±{gpsAccuracy}m</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                className={styles.submitRegistrationBtn}
                disabled={!capturedLat}
              >
                この位置・時刻で機体を固定登録
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
