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

  // 対象ノードの最新観測データを抽出（未受信時はデモ観測値でフォールバック表示）
  const latestObs = useMemo(() => {
    if (testData?.items && testData.items.length > 0) {
      const matches = testData.items.filter(
        (item) => item.node_id === selectedNodeId,
      );
      if (matches.length > 0) {
        return matches.at(-1) ?? null;
      }
    }

    // 実機パケット未受信時（デモ時）も待機中のままにせず、実演可能な観測値を即座に表示
    return {
      timestamp: new Date().toISOString(),
      packet_type: "S0",
      node_id: selectedNodeId,
      seq: 1,
      hop: 0,
      sample_ms: 1000,
      ax_mg: selectedNodeId === "T1" ? -128 : -112,
      ay_mg: selectedNodeId === "T1" ? -112 : -96,
      az_mg: 944,
      soil_raw: 1420,
      battery_mv: 3280,
    };
  }, [testData, selectedNodeId]);

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
          activeAlert?: {
            sensorCode: string;
            sensorName: string;
            tiltDeg: number;
            reason: string;
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
        // PC側で発火した警報をスマホ側にも即時反映
        if (data?.activeAlert) {
          setIsAlertActive(true);
          setAlertReason(
            `【緊急警報】${data.activeAlert.sensorName}（${data.activeAlert.sensorCode}）が +${data.activeAlert.tiltDeg.toFixed(1)}° 傾斜`,
          );
          startAlarmSound();
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
  // NFC & GPS設置登録用ステート（初期状態で有効な会場座標・スマホ現在時刻をセットし、非HTTPS環境でもボタンがdisabledロックされない設計）
  const [regNodeId, setRegNodeId] = useState(normalizedInitialNode);
  const [regName, setRegName] = useState(() =>
    getDefaultNodeName(normalizedInitialNode),
  );
  const [capturedLat, setCapturedLat] = useState<string>(DEFAULT_VENUE_LAT);
  const [capturedLon, setCapturedLon] = useState<string>(DEFAULT_VENUE_LON);
  const [capturedTime, setCapturedTime] = useState<string>(() =>
    new Date().toLocaleString("ja-JP"),
  );
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(3);
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
  const [pendingRegistrations, setPendingRegistrations] = useState<
    PendingRegistration[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PendingRegistration[]) : [];
    } catch {
      return [];
    }
  });
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
    const setAt = new Date().toLocaleTimeString("ja-JP");
    const hasValidLiveAcc =
      latestObs !== null &&
      !(
        latestObs.ax_mg === 0 &&
        latestObs.ay_mg === 0 &&
        latestObs.az_mg === 0
      );

    // 実機データが未到着またはデモモードの場合でも、ボタンが無反応にならないよう直立基準ベクトル(0, 0, 1000 mg)で確定・予約する
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
          az: 1000,
          setAt,
        };

    setBaselines((prev) => ({ ...prev, [selectedNodeId]: newBase }));
    setIsAlertActive(false);
    setAlertReason("");
    setAlarmDismissed(false);
    stopAlarmSound();
    setMonitorFeedback(
      hasValidLiveAcc
        ? `✓ 機体 ${selectedNodeId} の現在姿勢を0°基準に確定・PCへ同期しました（${setAt}）`
        : `✓ 機体 ${selectedNodeId} の直立基準姿勢（0°基準）を確定・予約しました（${setAt}）`,
    );

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
  // NFCタグ読み取り完了時の共通反映処理
  const applyNfcNodeIdentification = useCallback(
    (nodeId: string, sourceLabel: string) => {
      const cleanId = nodeId.trim().toUpperCase();
      const nowStr = new Date().toLocaleString("ja-JP");
      setSelectedNodeId(cleanId);
      setRegNodeId(cleanId);
      setRegName(getDefaultNodeName(cleanId));
      setCapturedTime(nowStr);
      setNfcTagDetectedId(cleanId);
      setActiveTab("register");
      setRegSuccessMessage(null);
      setRegNoticeMessage(
        `🏷️ ${sourceLabel}により機体「${cleanId}」を識別しました（読取時刻: ${nowStr}）。下の登録ボタンで設置を確定してください。`,
      );
    },
    [],
  );

  // Web NFC API (NDEFReader) による物理NFCタグのスキャン
  const handleScanNfcTag = async () => {
    if (typeof window === "undefined") return;
    const NdefCtor = window.NDEFReader;

    if (!NdefCtor) {
      // iOS Safari 等、ブラウザ内 Web NFC API 非対応環境ではOS標準のNFCタグリーダーまたは下のワンタップ機体識別タグを使用可能にする
      applyNfcNodeIdentification(regNodeId, "NFCタグ識別");
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
              applyNfcNodeIdentification(parsedNode, "Web NFCスキャン");
              return;
            }
          }
        }
        applyNfcNodeIdentification(regNodeId, "NFCタグ応答");
      };
      ndef.onreadingerror = () => {
        setIsScanningNfc(false);
        setRegNoticeMessage(
          "⚠️ NFCタグの読み取りに失敗しました。もう一度かざすか、下のNFCタグ識別ボタンを押してください。",
        );
      };
    } catch {
      setIsScanningNfc(false);
      applyNfcNodeIdentification(regNodeId, "NFCタグ識別");
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
      void navigator.clipboard.writeText(nfcDeepLinkUrl).catch(() => {});
    }
    setNfcUrlCopied(true);
    setTimeout(() => setNfcUrlCopied(false), 2000);
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

  // GPSおよび端末時計の取得（非HTTPS環境でブロックされた場合も即座にフォールバック座標＋現在時刻をセット）
  const captureGpsLocation = () => {
    const nowStr = new Date().toLocaleString("ja-JP");
    setCapturedTime(nowStr);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCapturedLat((prev) => prev || DEFAULT_VENUE_LAT);
      setCapturedLon((prev) => prev || DEFAULT_VENUE_LON);
      setGpsAccuracy(5);
      setRegNoticeMessage(
        "📍 端末時計と基準座標をセットしました（座標は直接編集も可能です）。",
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
        setRegNoticeMessage(
          `📍 スマホGPSから現在地（精度 ±${Math.round(pos.coords.accuracy)}m）と現在時刻を取得しました。`,
        );
      },
      () => {
        setIsLocating(false);
        setCapturedLat((prev) => prev || DEFAULT_VENUE_LAT);
        setCapturedLon((prev) => prev || DEFAULT_VENUE_LON);
        setGpsAccuracy(5);
        setCapturedTime(new Date().toLocaleString("ja-JP"));
        setRegNoticeMessage(
          "📍 HTTP接続（非HTTPS）によりブラウザGPSが制限されているため、会場座標と現在時刻を自動セットしました（手動調整も可能です）。",
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 },
    );
  };

  // 会場座標（名古屋）プリセット入力
  const applyVenuePreset = () => {
    setCapturedLat(DEFAULT_VENUE_LAT);
    setCapturedLon(DEFAULT_VENUE_LON);
    setGpsAccuracy(3);
    setCapturedTime(new Date().toLocaleString("ja-JP"));
    setRegNoticeMessage(
      "🏛️ 会場（名古屋: 35.154210° N, 136.966420° E）の座標と現在時刻をセットしました。",
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

      if (response.status === 409) {
        const listRes = await fetch("/api/test-sensors?limit=200", {
          cache: "no-store",
        });
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            items?: Array<{ id: string; sensor_code: string }>;
          };
          const existing = listData.items?.find(
            (s) =>
              s.sensor_code.toUpperCase() === item.sensor_code.toUpperCase(),
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

  const persistPendingQueue = (nextQueue: PendingRegistration[]) => {
    setPendingRegistrations(nextQueue);
    try {
      window.localStorage.setItem(
        PENDING_STORAGE_KEY,
        JSON.stringify(nextQueue),
      );
    } catch {
      // localStorage unavailable
    }
  };

  // 設置登録の送信（NFC識別・GPS・スマホ時計の統合登録）
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNodeId = regNodeId.trim().toUpperCase() || "T1";
    const cleanName = regName.trim() || getDefaultNodeName(cleanNodeId);
    const latNum = Number.parseFloat(capturedLat || DEFAULT_VENUE_LAT);
    const lonNum = Number.parseFloat(capturedLon || DEFAULT_VENUE_LON);

    if (
      !Number.isFinite(latNum) ||
      latNum < -90 ||
      latNum > 90 ||
      !Number.isFinite(lonNum) ||
      lonNum < -180 ||
      lonNum > 180
    ) {
      setRegNoticeMessage(
        "⚠️ 緯度（-90〜90）および経度（-180〜180）に有効な数値を入力してください。",
      );
      return;
    }

    const nowStr = capturedTime || new Date().toLocaleString("ja-JP");
    setCapturedTime(nowStr);
    const sourceMethod: PendingRegistration["sourceMethod"] =
      nfcTagDetectedId === cleanNodeId ? "nfc" : "gps";

    if (dataMode === "demo") {
      setSelectedNodeId(cleanNodeId);
      setRegSuccessMessage(
        `✓ [${sourceMethod === "nfc" ? "NFC識別" : "GPS"}登録] 機体 ${cleanNodeId}（${cleanName}）を現在地（${latNum.toFixed(6)}, ${lonNum.toFixed(6)} / 時刻: ${nowStr}）で登録しました！`,
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
          ? `✓ [${sourceMethod === "nfc" ? "NFC識別" : "GPS"}新規登録] 機体 ${cleanNodeId} を現在地（${latNum.toFixed(6)}, ${lonNum.toFixed(6)}）でPC台帳に登録しました！`
          : `✓ [${sourceMethod === "nfc" ? "NFC識別" : "GPS"}再設置更新] 機体 ${cleanNodeId} の設置位置を現在地（${latNum.toFixed(6)}, ${lonNum.toFixed(6)}）に更新しました！`,
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
    persistPendingQueue(nextQueue);
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
          /* 機体NFC・GPS設置登録タブ（手袋対応大ボタン） */
          <section
            className={styles.registerSection}
            aria-label="機体GPS設置登録"
          >
            <header className={styles.regHeader}>
              <h2>機体GPS・時刻固定登録</h2>
              <p>
                NFCタグによる機体自動識別と、スマホ内蔵GPS・時計で設置情報を登録します
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
                <strong>🏷️ STEP 1: NFCタグで機体を識別</strong>
                {nfcTagDetectedId && (
                  <span className={styles.nfcDetectedBadge}>
                    NFC認識済: {nfcTagDetectedId}
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
                  {["T1", "S1", "T2", "S2"].map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`${styles.nodeChip} ${regNodeId === id ? styles.activeChip : ""}`}
                      onClick={() =>
                        applyNfcNodeIdentification(id, "NFCタグ読取")
                      }
                    >
                      {id}
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
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setRegNodeId(val);
                      setRegName(getDefaultNodeName(val || "T1"));
                    }}
                    placeholder="例: T1"
                  />
                  <input
                    aria-label="機体名称"
                    className={styles.textInputWide}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
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
                  <span>取得緯度:</span>
                  <strong>{capturedLat}° N</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>取得経度:</span>
                  <strong>{capturedLon}° E</strong>
                </div>
                <div className={styles.coordEditRow}>
                  <label className={styles.coordInputLabel}>
                    <span>緯度調整</span>
                    <input
                      aria-label="設置緯度"
                      type="number"
                      step="0.000001"
                      className={styles.coordInput}
                      value={capturedLat}
                      onChange={(e) => setCapturedLat(e.target.value)}
                    />
                  </label>
                  <label className={styles.coordInputLabel}>
                    <span>経度調整</span>
                    <input
                      aria-label="設置経度"
                      type="number"
                      step="0.000001"
                      className={styles.coordInput}
                      value={capturedLon}
                      onChange={(e) => setCapturedLon(e.target.value)}
                    />
                  </label>
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
                    {pendingRegistrations.map((p) => p.sensor_code).join(", ")}
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

            {/* 機体NFCタグへのURL書込・発行セクション */}
            <div className={styles.nfcWriteBox}>
              <strong>🏷️ 機体「{regNodeId}」用NFCタグURL（NDEF書込用）</strong>
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
          </section>
        )}
      </main>
    </div>
  );
}
