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
  initialTab?: "monitor" | "register";
  isNfcLaunch?: boolean;
};

type PendingRegistration = {
  sensor_code: string;
  name: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  sourceMethod: "nfc" | "gps" | "manual";
};

// Web NFC API (NDEFReader) の型定義（Android Chrome 等で標準対応）
type NdefRecordInit = {
  recordType: string;
  data?: string;
};

type NdefReadingEvent = Event & {
  serialNumber?: string;
  message: {
    records: Array<{
      recordType: string;
      data?: DataView;
    }>;
  };
};

interface WebNdefReader {
  scan: () => Promise<void>;
  write: (message: { records: NdefRecordInit[] }) => Promise<void>;
  onreading: ((event: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}

declare global {
  interface Window {
    NDEFReader?: new () => WebNdefReader;
  }
}

const DEFAULT_VENUE_LAT = "35.154210";
const DEFAULT_VENUE_LON = "136.966420";
const PENDING_STORAGE_KEY = "sanmou_pending_registrations";
const DEMO_FALLBACK_SAMPLE_MS = 1000;
const DEMO_T1_AX_MG = -128;
const DEMO_OTHER_AX_MG = -112;
const DEMO_T1_AY_MG = -112;
const DEMO_OTHER_AY_MG = -96;
const DEMO_AZ_MG = 944;
const DEMO_SOIL_RAW = 1420;
const DEMO_BATTERY_MV = 3280;
const DEMO_UPRIGHT_AZ_MG = 1000;
const BEEP_START_FREQ_HZ = 880;
const BEEP_END_FREQ_HZ = 440;
const BEEP_DURATION_SEC = 0.25;
const BEEP_START_GAIN = 0.3;
const BEEP_END_GAIN = 0.01;
const BEEP_INTERVAL_MS = 500;
const BASELINE_POLL_INTERVAL_MS = 2000;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const MIN_VERTICAL_ACCEL_MG = 1;
const COSINE_MIN_CLAMP = -1.0;
const COSINE_MAX_CLAMP = 1.0;
const DANGER_TILT_THRESHOLD_DEG = 15.0;
const GEOLOCATION_TIMEOUT_MS = 4000;
const GEOLOCATION_MAX_AGE_MS = 60000;
const COPY_FEEDBACK_DURATION_MS = 2000;
const HTTP_CONFLICT = 409;
const SENSOR_LIST_LIMIT = 200;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const COORDINATE_DECIMAL_PLACES = 6;
const UNCONNECTED_RAW_SENTINEL = -1;
const VIBRATE_PATTERN_MS = [400, 150, 400, 150, 600];
function getDefaultNodeName(nodeId: string): string {
  if (nodeId === "T1") {
    return "タニ装着ノード（木ノードT1）";
  }
  return nodeId.startsWith("T")
    ? `樹木ノード ${nodeId}`
    : `斜面ノード ${nodeId}`;
}

// NDEFレコードやURL文字列から機体ID（T1, S1等）を抽出する
function extractNodeIdFromNfcPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, "http://localhost");
    const fromQuery =
      url.searchParams.get("node") ?? url.searchParams.get("id");
    if (fromQuery && /^[A-Za-z0-9_-]{1,64}$/.test(fromQuery)) {
      return fromQuery.toUpperCase();
    }
  } catch {
    // URL形式でない場合はプレーンテキストとして解析
  }
  const match = trimmed.match(/\b([TS][0-9A-Za-z_-]{1,15})\b/i);
  if (match) {
    return match[1].toUpperCase();
  }
  if (/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}

// 林業現場の作業員・タニさんが携帯するスマートフォン専用の画面
// （PC画面の誤アクセスを防ぎ、大ボタン警報モニター・NFC機体識別・GPS時刻固定登録を提供）
export function MobileHome({
  dataMode = "demo",
  initialNodeId = "T1",
  initialTab = "monitor",
  isNfcLaunch = false,
}: MobileHomeProps) {
  const normalizedInitialNode = initialNodeId.trim().toUpperCase() || "T1";
  const [activeTab, setActiveTab] = useState<"monitor" | "register">(
    initialTab,
  );
  const [selectedNodeId, setSelectedNodeId] = useState(normalizedInitialNode);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [alertReason, setAlertReason] = useState("");
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  const [monitorFeedback, setMonitorFeedback] = useState<string | null>(null);
  // 実機テスト観測データの購読（モバイル画面では常にライブ観測を取得）
  const { data: testData, error: testObsError } = useTestObservations(true);

  // 対象ノードの最新観測データを抽出
  // 実機テストモード（dataMode === "test"）で未受信のときは架空値を捏造せず null を返す（Issue #27）
  const latestObs = useMemo(() => {
    if (testData?.items && testData.items.length > 0) {
      const matches = testData.items.filter(
        (item) => item.node_id === selectedNodeId,
      );
      if (matches.length > 0) {
        return matches.at(-1) ?? null;
      }
    }

    if (dataMode === "test") {
      return null;
    }

    // デモモード時のみ、実機未接続でも画面操作を確認できるようデモ観測値を返す
    return {
      received_at: new Date().toISOString(),
      node_id: selectedNodeId,
      seq: 1,
      hop: 0,
      sample_ms: DEMO_FALLBACK_SAMPLE_MS,
      ax_mg: selectedNodeId === "T1" ? DEMO_T1_AX_MG : DEMO_OTHER_AX_MG,
      ay_mg: selectedNodeId === "T1" ? DEMO_T1_AY_MG : DEMO_OTHER_AY_MG,
      az_mg: DEMO_AZ_MG,
      soil_raw: DEMO_SOIL_RAW,
      battery_mv: DEMO_BATTERY_MV,
    };
  }, [dataMode, testData, selectedNodeId]);
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
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(
          BEEP_START_FREQ_HZ,
          ctx.currentTime,
        );
        oscillator.frequency.exponentialRampToValueAtTime(
          BEEP_END_FREQ_HZ,
          ctx.currentTime + BEEP_DURATION_SEC,
        );
        gainNode.gain.setValueAtTime(BEEP_START_GAIN, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          BEEP_END_GAIN,
          ctx.currentTime + BEEP_DURATION_SEC,
        );
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + BEEP_DURATION_SEC);
      };

      playBeep();
      alarmIntervalRef.current = window.setInterval(playBeep, BEEP_INTERVAL_MS);
    } catch {
      // ブラウザの音声自動再生制限時は画面アラート表示のみで継続する
    }
  }, []);

  const stopAlarmSound = useCallback(() => {
    clearInterval(alarmIntervalRef.current ?? undefined);
    alarmIntervalRef.current = null;
  }, []);
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
          activeAlerts?: Record<
            string,
            {
              sensorCode: string;
              sensorName: string;
              tiltDeg: number;
              reason: string;
            }
          >;
          activeAlert?: {
            sensorCode: string;
            sensorName: string;
            tiltDeg: number;
            reason: string;
          } | null;
        };
        if (!mounted) return;
        // サーバー側で削除された基準がスマホ側に残らないよう、マージではなく置換する（Issue #29）
        if (data?.baselines) {
          setBaselines(data.baselines);
        } else if (data?.baseline) {
          setBaselines((prev) => ({
            ...prev,
            [selectedNodeId]: data.baseline!,
          }));
        }
        // PC側で発火した警報をスマホ側にも即時反映（機体別辞書 activeAlerts を優先参照）
        const matchedAlert =
          data?.activeAlerts?.[selectedNodeId] ??
          (data?.activeAlerts
            ? (Object.values(data.activeAlerts)[0] ?? null)
            : (data?.activeAlert ?? null));
        if (matchedAlert) {
          setIsAlertActive(true);
          setAlertReason(
            `【緊急警報】${matchedAlert.sensorName}（${matchedAlert.sensorCode}）が +${matchedAlert.tiltDeg.toFixed(1)}° 傾斜`,
          );
          startAlarmSound();
        }
      } catch {
        // オフライン・通信エラー時は手元の基準を維持
      }
    };
    void loadBaselines();
    const timer = window.setInterval(loadBaselines, BASELINE_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selectedNodeId, startAlarmSound]);

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
        Math.atan2(
          horiz,
          Math.max(Math.abs(latestObs.az_mg), MIN_VERTICAL_ACCEL_MG),
        ) * RADIANS_TO_DEGREES
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
    const cosTheta = Math.max(
      COSINE_MIN_CLAMP,
      Math.min(COSINE_MAX_CLAMP, dot / (normCurr * normBase)),
    );
    return Math.acos(cosTheta) * RADIANS_TO_DEGREES;
  }, [latestObs, currentBaseline]);
  // NFC & GPS設置登録用ステート（初期状態で有効な会場座標・スマホ現在時刻をセットし、非HTTPS環境でもボタンがdisabledロックされない設計）
  const [regNodeId, setRegNodeId] = useState(normalizedInitialNode);
  const [regName, setRegName] = useState(() =>
    getDefaultNodeName(normalizedInitialNode),
  );
  const [capturedLat, setCapturedLat] = useState<string>(DEFAULT_VENUE_LAT);
  const [capturedLon, setCapturedLon] = useState<string>(DEFAULT_VENUE_LON);
  // サーバー(Node.js)とスマホ端末のロケール・時刻差による Hydration Error を防ぐため、初期値は固定しマウント後にクライアント現在時刻をセットする
  const [capturedTime, setCapturedTime] = useState<string>("");
  // 測位精度: 実測GPS取得前は null とし、架空の精度表示（±3m等）を防止する（Issue #42, AGENTS.md §5.5）
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [regSuccessMessage, setRegSuccessMessage] = useState<string | null>(
    null,
  );
  const [regNoticeMessage, setRegNoticeMessage] = useState<string | null>(
    isNfcLaunch
      ? `🏷️ NFCタグから機体「${normalizedInitialNode}」を自動識別しました。スマホ時計と座標を確認して登録を確定できます。`
      : null,
  );
  const [nfcTagDetectedId, setNfcTagDetectedId] = useState<string | null>(
    isNfcLaunch ? normalizedInitialNode : null,
  );
  const [isScanningNfc, setIsScanningNfc] = useState(false);
  const [nfcUrlCopied, setNfcUrlCopied] = useState(false);
  // SSR 時とクライアント localStorage の差分による DOM Mismatch を防ぐため、初期値は空配列としマウント後に読み込む
  const [pendingRegistrations, setPendingRegistrations] = useState<
    PendingRegistration[]
  >([]);

  useEffect(() => {
    // クライアントマウント後に現在時刻と保存済みキューを非同期にロードし、Hydration Mismatch を防ぐ
    const timerId = window.setTimeout(() => {
      setCapturedTime((prev) => prev || new Date().toLocaleString("ja-JP"));
      try {
        const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PendingRegistration[];
          if (Array.isArray(parsed)) {
            setPendingRegistrations(parsed);
          }
        }
      } catch {
        // localStorage 読取失敗時は空キューを維持
      }
    }, 0);
    return () => window.clearTimeout(timerId);
  }, []);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // 警報トリガー（傾き検知または手動テスト）
  const triggerAlarm = useCallback(
    (reason: string) => {
      setIsAlertActive(true);
      setAlertReason(reason);
      startAlarmSound();

      // Android/対応ブラウザでのバイブレーション発火
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(VIBRATE_PATTERN_MS);
        } catch {
          // バイブレーション非対応ブラウザでは無視する
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

  const setBaselinePosture = useCallback(async () => {
    const setAt = new Date().toLocaleTimeString("ja-JP");
    const hasValidLiveAcc =
      latestObs !== null &&
      !(
        latestObs.ax_mg === 0 &&
        latestObs.ay_mg === 0 &&
        latestObs.az_mg === 0
      );

    // 実機テストモードで未受信または全軸ゼロの場合は、架空の直立ベクトルで基準確定せず警告を表示する（Issue #27）
    if (dataMode === "test" && !hasValidLiveAcc) {
      setMonitorFeedback(
        "⚠️ 有効な実機観測データを受信していないため、基準姿勢を確定できません",
      );
      return;
    }

    const newBase = hasValidLiveAcc
      ? {
          ax: latestObs.ax_mg,
          ay: latestObs.ay_mg,
          az: latestObs.az_mg,
          setAt,
        }
      : {
          ax: 0,
          ay: 0,
          az: DEMO_UPRIGHT_AZ_MG,
          setAt,
        };

    setBaselines((prev) => ({ ...prev, [selectedNodeId]: newBase }));
    setIsAlertActive(false);
    setAlertReason("");
    setAlarmDismissed(false);
    stopAlarmSound();

    // POST /api/test-baseline の応答を確認してから同期完了メッセージを表示し、通信失敗時に成功と偽装しない（Issue #27）
    try {
      const response = await fetch("/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: selectedNodeId, ...newBase }),
      });
      if (!response || !response.ok) {
        setMonitorFeedback("⚠️ PCへの基準同期に失敗しました（通信エラー）");
        return;
      }
      setMonitorFeedback(
        hasValidLiveAcc
          ? `✓ 機体 ${selectedNodeId} の現在姿勢を0°基準に確定・PCへ同期しました（${setAt}）`
          : `✓ 機体 ${selectedNodeId} の直立基準姿勢（0°基準）を確定・予約しました（${setAt}）`,
      );
    } catch {
      setMonitorFeedback("⚠️ PCへの基準同期に失敗しました（通信エラー）");
    }
  }, [dataMode, latestObs, selectedNodeId, stopAlarmSound]);

  // 基準姿勢が確定しているときのみ、相対角度15°以上を検知して自動警報
  useEffect(() => {
    if (!currentBaseline || relativeTiltDeg === null) return;
    if (relativeTiltDeg < DANGER_TILT_THRESHOLD_DEG) {
      if (alarmDismissed) {
        const resetTimer = setTimeout(() => {
          setAlarmDismissed(false);
        }, 0);
        return () => clearTimeout(resetTimer);
      }
      return;
    }
    if (
      relativeTiltDeg >= DANGER_TILT_THRESHOLD_DEG &&
      !isAlertActive &&
      !alarmDismissed
    ) {
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
  // 機体識別反映処理（物理NFCタグ読取、ディープリンク、または手動ボタン選択）
  const applyNodeIdentification = useCallback(
    (nodeId: string, sourceLabel: string, isPhysicalNfc = false) => {
      const cleanId = nodeId.trim().toUpperCase();
      const nowStr = new Date().toLocaleString("ja-JP");
      setSelectedNodeId(cleanId);
      setRegNodeId(cleanId);
      setRegName(getDefaultNodeName(cleanId));
      setCapturedTime(nowStr);
      setNfcTagDetectedId(isPhysicalNfc ? cleanId : null);
      setActiveTab("register");
      setRegSuccessMessage(null);
      setRegNoticeMessage(
        isPhysicalNfc
          ? `🏷️ ${sourceLabel}により機体「${cleanId}」を識別しました（読取時刻: ${nowStr}）。下の登録ボタンで設置を確定してください。`
          : `🔘 ${sourceLabel}により機体「${cleanId}」を選択しました。下の登録ボタンで設置を確定してください。`,
      );
    },
    [],
  );

  // Web NFC API (NDEFReader) による物理NFCタグのスキャン
  const handleScanNfcTag = async () => {
    if (typeof window === "undefined") return;
    const NdefCtor = window.NDEFReader;

    if (!NdefCtor) {
      // iOS Safari 等、ブラウザ内 Web NFC API 非対応環境では成功偽装を行わず、正直な案内を表示する（Issue #42, AGENTS.md §5.5）
      setRegNoticeMessage(
        "ℹ️ ご利用のブラウザ・環境はWeb NFC直接読取に対応していません。機体タグにかざしてPWAを自動起動するか、下の機体ボタンから手動選択してください。",
      );
      return;
    }

    try {
      setIsScanningNfc(true);
      setRegNoticeMessage(
        "📲 スマホ背面上部をセンサー筐体のNFCタグにかざしてください...",
      );
      const ndef = new NdefCtor();
      await ndef.scan();
      ndef.onreading = (event: NdefReadingEvent) => {
        setIsScanningNfc(false);
        for (const record of event.message.records) {
          if (record.data) {
            const decoder = new TextDecoder();
            const decoded = decoder.decode(record.data);
            const parsedNode = extractNodeIdFromNfcPayload(decoded);
            if (parsedNode) {
              applyNodeIdentification(parsedNode, "Web NFCスキャン", true);
              return;
            }
          }
        }
        setRegNoticeMessage(
          "⚠️ 読み取ったNFCタグに機体ID（T1/S1等）が含まれていませんでした。下の機体ボタンから手動選択してください。",
        );
      };
      ndef.onreadingerror = () => {
        setIsScanningNfc(false);
        setRegNoticeMessage(
          "⚠️ NFCタグの読み取りに失敗しました。もう一度かざすか、下の機体ボタンから手動選択してください。",
        );
      };
    } catch {
      setIsScanningNfc(false);
      setRegNoticeMessage(
        "⚠️ NFCスキャンの開始に失敗しました（権限が拒否されたか、非HTTPS接続です）。下の機体ボタンから手動選択してください。",
      );
    }
  };

  // 機体別NFCディープリンクURLの生成（NDEF URLレコード用）
  const nfcDeepLinkUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://Slack.local:3000";
    const modeParam = dataMode === "test" ? "mode=test&" : "";
    return `${origin}/mobile?${modeParam}node=${encodeURIComponent(regNodeId)}&tab=register&nfc=1`;
  }, [dataMode, regNodeId]);

  const handleCopyNfcUrl = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(nfcDeepLinkUrl).catch(() => {
        // クリップボード権限がない環境では状態表示のみ更新する
      });
    }
    setNfcUrlCopied(true);
    setTimeout(() => setNfcUrlCopied(false), COPY_FEEDBACK_DURATION_MS);
  };

  // Web NFC API によるNFCタグへのURL書き込み
  const handleWriteNfcTag = async () => {
    if (typeof window === "undefined") return;
    const NdefCtor = window.NDEFReader;

    if (!NdefCtor) {
      handleCopyNfcUrl();
      setRegNoticeMessage(
        `📋 機体「${regNodeId}」用のNFC登録URLをコピーしました。NFCツールアプリ等でタグにURLレコードとして書き込んでください。`,
      );
      return;
    }

    try {
      const ndef = new NdefCtor();
      await ndef.write({
        records: [{ recordType: "url", data: nfcDeepLinkUrl }],
      });
      setRegNoticeMessage(
        `✓ NFCタグへ機体「${regNodeId}」の登録URL（${nfcDeepLinkUrl}）を書き込みました！`,
      );
    } catch {
      handleCopyNfcUrl();
      setRegNoticeMessage(
        `📋 NFC書込権限がないため、機体「${regNodeId}」のNFC登録URLをクリップボードにコピーしました。`,
      );
    }
  };

  // GPSおよび端末時計の取得（非HTTPS環境で制限された場合もフォールバック座標＋現在時刻をセット）
  const captureGpsLocation = () => {
    const nowStr = new Date().toLocaleString("ja-JP");
    setCapturedTime(nowStr);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCapturedLat((prev) => prev || DEFAULT_VENUE_LAT);
      setCapturedLon((prev) => prev || DEFAULT_VENUE_LON);
      setGpsAccuracy(null);
      setRegNoticeMessage(
        "📍 端末時計と参考座標をセットしました（ブラウザ位置情報非対応）。",
      );
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturedLat(pos.coords.latitude.toFixed(COORDINATE_DECIMAL_PLACES));
        setCapturedLon(pos.coords.longitude.toFixed(COORDINATE_DECIMAL_PLACES));
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setCapturedTime(new Date().toLocaleString("ja-JP"));
        setIsLocating(false);
        setRegNoticeMessage(
          `📍 スマホGPSから現在地（実測精度 ±${Math.round(pos.coords.accuracy)}m）と現在時刻を取得しました。`,
        );
      },
      () => {
        setIsLocating(false);
        setCapturedLat((prev) => prev || DEFAULT_VENUE_LAT);
        setCapturedLon((prev) => prev || DEFAULT_VENUE_LON);
        setGpsAccuracy(null);
        setCapturedTime(new Date().toLocaleString("ja-JP"));
        setRegNoticeMessage(
          "📍 GPS測位に失敗したため、参考会場座標と現在時刻をセットしました（手動調整可能です）。",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      },
    );
  };

  // 会場座標（名古屋）プリセット入力（実測精度は持たないため null とする: Issue #42）
  const applyVenuePreset = () => {
    setCapturedLat(DEFAULT_VENUE_LAT);
    setCapturedLon(DEFAULT_VENUE_LON);
    setGpsAccuracy(null);
    setCapturedTime(new Date().toLocaleString("ja-JP"));
    setRegNoticeMessage(
      "🏛️ 会場（名古屋: 35.154210° N, 136.966420° E）の参考座標と現在時刻をセットしました。",
    );
  };

  // 単一レコードをバックエンド台帳へ送信（POST → 409時はPATCH上書き）
  const sendRegistrationToBackend = async (item: {
    sensor_code: string;
    name: string;
    latitude: number;
    longitude: number;
  }): Promise<"created" | "updated" | "failed"> => {
    try {
      const response = await fetch("/api/test-sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });

      if (response.ok) {
        return "created";
      }

      if (response.status === HTTP_CONFLICT) {
        const listRes = await fetch(
          `/api/test-sensors?limit=${SENSOR_LIST_LIMIT}`,
          {
            cache: "no-store",
          },
        );
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            items?: Array<{ id: string; sensor_code: string }>;
          };
          const existing = listData.items?.find(
            (sensorItem) =>
              sensorItem.sensor_code.toUpperCase() ===
              item.sensor_code.toUpperCase(),
          );
          if (existing) {
            const patchRes = await fetch(
              `/api/test-sensors/${encodeURIComponent(existing.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: item.name,
                  latitude: item.latitude,
                  longitude: item.longitude,
                }),
              },
            );
            if (patchRes.ok) {
              return "updated";
            }
          }
        }
      }
      return "failed";
    } catch {
      return "failed";
    }
  };

  // localStorage への永続化を先に試行し、例外発生時はメモリ状態も成功表示も更新しない（Issue #30）
  const persistPendingQueue = (nextQueue: PendingRegistration[]): boolean => {
    try {
      const serialized = JSON.stringify(nextQueue);
      if (
        typeof Storage !== "undefined" &&
        typeof Storage.prototype.setItem === "function" &&
        Storage.prototype.setItem !== window.localStorage.setItem
      ) {
        Storage.prototype.setItem.call(
          window.localStorage,
          PENDING_STORAGE_KEY,
          serialized,
        );
      }
      window.localStorage.setItem(PENDING_STORAGE_KEY, serialized);
      const verified = window.localStorage.getItem(PENDING_STORAGE_KEY);
      if (verified !== serialized) {
        return false;
      }
      setPendingRegistrations(nextQueue);
      return true;
    } catch {
      return false;
    }
  };

  // 設置登録の送信（NFC識別・GPS・スマホ時計の統合登録）
  const handleRegisterSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const cleanNodeId = regNodeId.trim().toUpperCase() || "T1";
    const cleanName = regName.trim() || getDefaultNodeName(cleanNodeId);
    const latNum = Number.parseFloat(capturedLat || DEFAULT_VENUE_LAT);
    const lonNum = Number.parseFloat(capturedLon || DEFAULT_VENUE_LON);

    if (
      !Number.isFinite(latNum) ||
      latNum < MIN_LATITUDE ||
      latNum > MAX_LATITUDE ||
      !Number.isFinite(lonNum) ||
      lonNum < MIN_LONGITUDE ||
      lonNum > MAX_LONGITUDE
    ) {
      setRegNoticeMessage(
        "⚠️ 緯度（-90〜90）および経度（-180〜180）に有効な数値を入力してください。",
      );
      return;
    }

    const nowStr = capturedTime || new Date().toLocaleString("ja-JP");
    setCapturedTime(nowStr);
    const sourceMethod: PendingRegistration["sourceMethod"] =
      nfcTagDetectedId === cleanNodeId
        ? "nfc"
        : gpsAccuracy !== null
          ? "gps"
          : "manual";
    const methodLabel =
      sourceMethod === "nfc"
        ? "NFC識別"
        : sourceMethod === "gps"
          ? "GPS実測"
          : "手動/プリセット";

    if (dataMode === "demo") {
      setSelectedNodeId(cleanNodeId);
      setRegSuccessMessage(
        `✓ [${methodLabel}登録] 機体 ${cleanNodeId}（${cleanName}）を現在地（${latNum.toFixed(COORDINATE_DECIMAL_PLACES)}, ${lonNum.toFixed(COORDINATE_DECIMAL_PLACES)} / 時刻: ${nowStr}）で登録しました！`,
      );
      return;
    }

    const result = await sendRegistrationToBackend({
      sensor_code: cleanNodeId,
      name: cleanName,
      latitude: latNum,
      longitude: lonNum,
    });

    if (result === "created" || result === "updated") {
      setSelectedNodeId(cleanNodeId);
      // 同期済みになった機体が未同期キューにあれば除去
      const remaining = pendingRegistrations.filter(
        (item) => item.sensor_code.toUpperCase() !== cleanNodeId,
      );
      persistPendingQueue(remaining);
      setRegSuccessMessage(
        result === "created"
          ? `✓ [${methodLabel}新規登録] 機体 ${cleanNodeId} を現在地（${latNum.toFixed(COORDINATE_DECIMAL_PLACES)}, ${lonNum.toFixed(COORDINATE_DECIMAL_PLACES)}）でPC台帳に登録しました！`
          : `✓ [${methodLabel}再設置更新] 機体 ${cleanNodeId} の設置位置を現在地（${latNum.toFixed(COORDINATE_DECIMAL_PLACES)}, ${lonNum.toFixed(COORDINATE_DECIMAL_PLACES)}）に更新しました！`,
      );
      return;
    }

    // 圏外・オフライン時は端末内キューに保存（同一機体IDは最新情報で上書きし重複登録を防止）
    const entry: PendingRegistration = {
      sensor_code: cleanNodeId,
      name: cleanName,
      latitude: latNum,
      longitude: lonNum,
      capturedAt: nowStr,
      sourceMethod,
    };
    const nextQueue = [
      ...pendingRegistrations.filter(
        (item) => item.sensor_code.toUpperCase() !== cleanNodeId,
      ),
      entry,
    ];
    const isSaved = persistPendingQueue(nextQueue);
    if (!isSaved) {
      setRegSuccessMessage(null);
      setRegNoticeMessage(
        "⚠️ 端末ストレージへの保存に失敗しました（容量不足またはブラウザ制限）。画面を閉じずに再接続して送信してください。",
      );
      return;
    }
    setRegSuccessMessage(
      `✓ 機体 ${cleanNodeId} のNFC/GPS登録データをスマホ内に保存しました（未同期: ${nextQueue.length}件・帰社後ワンタップ同期対応）`,
    );
  };
  // 圏外で保存した未同期データのPC台帳への一括同期
  const handleSyncPendingRegistrations = async () => {
    if (pendingRegistrations.length === 0) return;
    setIsSyncingPending(true);
    const unsynced: PendingRegistration[] = [];
    let syncedCount = 0;

    for (const item of pendingRegistrations) {
      if (dataMode === "demo") {
        syncedCount += 1;
        continue;
      }
      const res = await sendRegistrationToBackend({
        sensor_code: item.sensor_code,
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
      });
      if (res === "created" || res === "updated") {
        syncedCount += 1;
      } else {
        unsynced.push(item);
      }
    }

    persistPendingQueue(unsynced);
    setIsSyncingPending(false);
    if (syncedCount > 0) {
      setRegSuccessMessage(
        `✓ 未同期の設置登録データ ${syncedCount}件 をPC台帳へ同期完了しました！`,
      );
    } else {
      setRegNoticeMessage(
        "⚠️ PC台帳サーバーへ接続できませんでした。同一Wi-Fi接続後に再度お試しください。",
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
                  <strong>現地の状況や機体の傾きを確認してください</strong>
                  <span>
                    本警報は現地確認の参考情報です。周囲の安全を確認して行動してください
                  </span>
                </div>
                <button
                  className={styles.calibrateAlarmBtn}
                  onClick={() => {
                    void setBaselinePosture();
                  }}
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
                      {["T1", "S1", "T2", "S2"].map((nodeId) => (
                        <button
                          key={nodeId}
                          type="button"
                          className={`${styles.miniNodeBtn} ${selectedNodeId === nodeId ? styles.activeMiniBtn : ""}`}
                          onClick={() => setSelectedNodeId(nodeId)}
                        >
                          {nodeId}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {monitorFeedback && (
                  <div className={styles.successBanner} role="status">
                    {monitorFeedback}
                  </div>
                )}

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
                            ? `${relativeTiltDeg < 5.0 ? "🟢 正常・直立" : relativeTiltDeg < 15.0 ? "🟡 注意・傾き変化" : "🔴 警戒・大きな傾斜"} (+${relativeTiltDeg.toFixed(1)}°)`
                            : "計算不可"
                        : "待機中"}
                    </strong>
                  </div>
                  <div className={styles.metricItem}>
                    <span>地面の湿り気 (土壌水分)</span>
                    <strong>
                      {latestObs
                        ? latestObs.soil_raw === null ||
                          latestObs.soil_raw === UNCONNECTED_RAW_SENTINEL
                          ? "未計測 (センサー未接続)"
                          : `${latestObs.soil_raw} (接続中)`
                        : "待機中"}
                    </strong>
                  </div>
                  <div className={styles.metricItem}>
                    <span>機体バッテリー</span>
                    <strong>
                      {latestObs
                        ? latestObs.battery_mv === null ||
                          latestObs.battery_mv === UNCONNECTED_RAW_SENTINEL
                          ? "未計測 (未接続)"
                          : `${latestObs.battery_mv} mV`
                        : "待機中"}
                    </strong>
                  </div>
                </div>

                <div className={styles.baselineBox}>
                  {currentBaseline ? (
                    <div className={styles.baselineStatus}>
                      <span className={styles.baselineConfirmedTitle}>
                        🎯 直立基準（0°）確定済み
                      </span>
                      <span className={styles.baselineConfirmedMeta}>
                        確定時刻: {currentBaseline.setAt}
                      </span>
                      <button
                        type="button"
                        className={styles.resetBaselineBtn}
                        onClick={() => {
                          void setBaselinePosture();
                        }}
                      >
                        今の姿勢で0°基準を再設定
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.setBaselineBtn}
                      onClick={() => {
                        void setBaselinePosture();
                      }}
                    >
                      🎯 タニ直立時の姿勢を「基準姿勢」に確定
                    </button>
                  )}
                </div>

                <details className={styles.devToolsDetails}>
                  <summary className={styles.devToolsSummary}>
                    🛠️ 実演ピッチ用テスト操作（通常現場では使用しません）
                  </summary>
                  <div className={styles.testActionBlock}>
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
                </details>
              </div>
            )}
          </section>
        ) : (
          /* 機体NFC・GPS設置登録タブ（手袋対応大ボタン） */
          <section
            className={styles.registerSection}
            aria-label="機体GPS設置登録"
          >
            <header className={styles.regHeader}>
              <h2>機体の設置登録</h2>
              <p>
                機体番号を選び、「現在地GPSと時刻を取得」を押して登録してください
              </p>
            </header>

            {regNoticeMessage && (
              <div className={styles.nfcNoticeBanner} role="status">
                {regNoticeMessage}
              </div>
            )}

            {regSuccessMessage && (
              <div className={styles.successBanner} role="status">
                {regSuccessMessage}
              </div>
            )}

            {/* NFC機体識別・スキャンブロック */}
            <div className={styles.nfcScanBox}>
              <div className={styles.nfcScanHeader}>
                <strong>🏷️ STEP 1: NFCまたは手動で機体を識別</strong>
                {nfcTagDetectedId ? (
                  <span className={styles.nfcDetectedBadge}>
                    NFC認識済: {nfcTagDetectedId}
                  </span>
                ) : (
                  <span className={styles.manualSelectedBadge}>
                    手動選択: {regNodeId}
                  </span>
                )}
              </div>
              <button
                type="button"
                className={styles.nfcScanBigBtn}
                onClick={() => {
                  void handleScanNfcTag();
                }}
                disabled={isScanningNfc}
              >
                {isScanningNfc
                  ? "📲 NFCタグ待機中（タグにかざしてください）..."
                  : "📲 NFCタグをスキャンして機体を識別"}
              </button>
              <div className={styles.nfcQuickRow}>
                <span className={styles.nfcQuickHint}>
                  機体IDを選択（またはNFCタグ読取）:
                </span>
                <div className={styles.nodeChips}>
                  {["T1", "S1", "T2", "S2"].map((nodeId) => (
                    <button
                      key={nodeId}
                      type="button"
                      className={`${styles.nodeChip} ${regNodeId === nodeId ? styles.activeChip : ""}`}
                      onClick={() =>
                        applyNodeIdentification(nodeId, "機体ボタン選択", false)
                      }
                    >
                      {nodeId}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleRegisterSubmit} className={styles.regForm}>
              <div className={styles.nodeSelectRow}>
                <label
                  className={styles.fieldLabel}
                  htmlFor="mobile-reg-node-id"
                >
                  対象機体ID / 設置名称:
                </label>
                <div className={styles.manualIdRow}>
                  <input
                    id="mobile-reg-node-id"
                    aria-label="機体ID"
                    className={styles.textInputCompact}
                    value={regNodeId}
                    onChange={(changeEvent) => {
                      const val = changeEvent.target.value.toUpperCase();
                      setRegNodeId(val);
                      setRegName(getDefaultNodeName(val || "T1"));
                    }}
                    placeholder="例: T1"
                  />
                  <input
                    aria-label="機体名称"
                    className={styles.textInputWide}
                    value={regName}
                    onChange={(changeEvent) =>
                      setRegName(changeEvent.target.value)
                    }
                    placeholder="設置名称を入力"
                  />
                </div>
              </div>

              <div className={styles.gpsActionBox}>
                <span className={styles.fieldLabel}>
                  📍 STEP 2: 設置場所（GPS）と設置時刻の取得
                </span>
                <button
                  type="button"
                  className={styles.captureGpsBigBtn}
                  onClick={captureGpsLocation}
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

              <div className={styles.capturedSummary}>
                <div className={styles.summaryRow}>
                  <span>記録緯度:</span>
                  <strong>{capturedLat}° N</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>記録経度:</span>
                  <strong>{capturedLon}° E</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>設置時刻:</span>
                  <strong suppressHydrationWarning>
                    {capturedTime || "現在時刻を取得中..."}
                  </strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>測位精度:</span>
                  <span>
                    {gpsAccuracy !== null
                      ? `実測 ±${gpsAccuracy}m`
                      : "未測位（参考プリセット座標）"}
                  </span>
                </div>
              </div>

              <button type="submit" className={styles.submitRegistrationBtn}>
                この位置・時刻で機体を固定登録
              </button>
            </form>

            {/* 圏外保存データのPC台帳同期セクション */}
            {pendingRegistrations.length > 0 && (
              <div className={styles.pendingSyncBox}>
                <div className={styles.pendingSyncHeader}>
                  <strong>
                    📦 スマホ内保存済み（未同期: {pendingRegistrations.length}
                    件）
                  </strong>
                  <span>
                    対象:{" "}
                    {pendingRegistrations
                      .map((pendingItem) => pendingItem.sensor_code)
                      .join(", ")}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.syncPendingBtn}
                  onClick={() => {
                    void handleSyncPendingRegistrations();
                  }}
                  disabled={isSyncingPending}
                >
                  {isSyncingPending
                    ? "🔄 PC台帳へ同期中..."
                    : `🔄 未同期データをPC台帳へ同期（${pendingRegistrations.length}件）`}
                </button>
              </div>
            )}

            {/* 機体NFCタグへのURL書込・発行セクション（事務所用ツールとして折りたたみ隔離） */}
            <details className={styles.devToolsDetails}>
              <summary className={styles.devToolsSummary}>
                🏷️ 機体NFCタグURL書込ツール（事務所用）
              </summary>
              <div className={styles.nfcWriteBox}>
                <strong>機体「{regNodeId}」用NFCタグURL（NDEF書込用）</strong>
                <code className={styles.nfcUrlCode}>{nfcDeepLinkUrl}</code>
                <div className={styles.nfcWriteActions}>
                  <button
                    type="button"
                    className={styles.nfcCopyBtn}
                    onClick={handleCopyNfcUrl}
                  >
                    {nfcUrlCopied ? "✓ コピー完了" : "📋 NFC登録URLをコピー"}
                  </button>
                  <button
                    type="button"
                    className={styles.nfcWriteBtn}
                    onClick={() => {
                      void handleWriteNfcTag();
                    }}
                  >
                    📲 NFCタグへURLを書込
                  </button>
                </div>
              </div>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}
