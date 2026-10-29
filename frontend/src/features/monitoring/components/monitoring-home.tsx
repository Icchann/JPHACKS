"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AppSidebar,
  SidebarToggleButton,
} from "../../../components/ui/app-sidebar";
import { Breadcrumbs } from "../../../components/ui/breadcrumbs";
import { QrCode } from "../../../components/ui/qr-code";
import {
  DEFAULT_LAYER_STATES,
  DEMO_MOUNTAINS,
  DEMO_OVERLAY_PATHS,
  DEMO_OVERLAY_POINTS,
} from "../demo-data";
import { evaluateLiveSensorState } from "../evaluate-live-sensor-state";
import {
  countSeverities,
  filterSensors,
  formatJapanDateTime,
  OBSERVATION_LABELS,
} from "../monitoring-utils";
import type {
  DemoAlert,
  DemoSensor,
  LayerVisibility,
  MapLayerId,
  MapPresetMode,
  MountainArea,
  ObservationSeverity,
} from "../types";
import { useTestObservations } from "../../dashboard/use-test-observations";
import type {
  TestSensor,
  TestSensorListResponse,
} from "../../sensor-management/sensor-api-types";
import { useDemoMonitoring } from "../use-demo-monitoring";
import { Icon } from "./icon";
import { LayerController } from "./layer-controller";
import styles from "./monitoring-home.module.css";
import { OfflineMountainMap } from "./offline-mountain-map";
import { type MapFocusRequest, SatelliteMap } from "./satellite-map";
import { SensorDetailModal } from "./sensor-detail-modal";
import { WarningPanel } from "./warning-panel";
const SUMMARY_ORDER: ObservationSeverity[] = ["normal", "caution", "danger"];
const SENSOR_POLL_INTERVAL_MS = 5_000;
const STALE_CHECK_INTERVAL_MS = 5_000;
const BASELINE_POLL_INTERVAL_MS = 1_500;
const COPY_FEEDBACK_DURATION_MS = 2_000;
const TOAST_DISMISS_DELAY_MS = 6_000;
const MOBILE_BREAKPOINT_PX = 768;
const DANGER_TILT_THRESHOLD_DEG = 15.0;
const TEST_ALERT_DEMO_TILT_DEG = 24.5;
const QR_CODE_SIZE_PX = 220;
const HTTP_NO_CONTENT = 204;
const DEFAULT_NEW_MOUNTAIN_MIN_LAT = 35.008;
const DEFAULT_NEW_MOUNTAIN_MAX_LAT = 35.025;
const DEFAULT_NEW_MOUNTAIN_MIN_LON = 136.415;
const DEFAULT_NEW_MOUNTAIN_MAX_LON = 136.455;
const BEEP_START_FREQ_HZ = 880;
const BEEP_END_FREQ_HZ = 440;
const BEEP_DURATION_SEC = 0.3;
const BEEP_START_GAIN = 0.2;
const BEEP_END_GAIN = 0.01;
const BEEP_INTERVAL_MS = 600;

// 台帳上の初期状態（unknown 等）を normal や ok へ偽装せずそのまま保持する（Issue #28）
function convertTestSensorToDemo(item: TestSensor): DemoSensor {
  return {
    id: item.id,
    sensorCode: item.sensor_code,
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    observationSeverity: item.observation_severity,
    communicationStatus: item.communication_status,
    deviceFaultStatus: item.device_fault_status,
    lowBattery: Boolean(item.low_battery),
    soilMoistureValue: null,
    tiltValue: null,
    batteryPercent: null,
    lastReceivedAt: item.last_received_at,
    source: "device_test",
    nodeType: item.sensor_code.startsWith("T") ? "tree" : "slope",
  };
}

type MonitoringHomeProps = {
  initialMapEngine?: "offline_svg" | "satellite_google";
  dataMode?: "demo" | "test";
};

export function MonitoringHome({
  initialMapEngine = "offline_svg",
  dataMode = "demo",
}: MonitoringHomeProps = {}) {
  const router = useRouter();
  const { snapshot, newAlerts, dismissNewAlerts } = useDemoMonitoring();
  const { data: testObservations, error: testObsError } = useTestObservations(
    dataMode === "test",
  );
  const isLiveTestMode = Boolean(
    !testObsError &&
    testObservations?.items &&
    testObservations.items.length > 0,
  );
  const [registeredSensors, setRegisteredSensors] = useState<DemoSensor[]>([]);
  const [currentTimestampMs, setCurrentTimestampMs] = useState<number>(() =>
    Date.now(),
  );

  // API停止後も経過時間を進め、60秒超過時にオンライン表示が凍結しないようにする（Issue #31）
  useEffect(() => {
    if (dataMode !== "test") return;
    const timerId = window.setInterval(() => {
      setCurrentTimestampMs(Date.now());
    }, STALE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [dataMode]);
  useEffect(() => {
    if (dataMode !== "test") return;

    let isMounted = true;
    async function loadTestSensors() {
      try {
        const response = await fetch("/api/test-sensors?limit=200", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as TestSensorListResponse;
        if (!isMounted) return;

        const converted: DemoSensor[] = result.items.map(
          convertTestSensorToDemo,
        );
        setRegisteredSensors(converted);
      } catch {
        // API未接続時は前回の状態を維持
      }
    }

    void loadTestSensors();
    const timerId = window.setInterval(
      loadTestSensors,
      SENSOR_POLL_INTERVAL_MS,
    );
    return () => {
      isMounted = false;
      window.clearInterval(timerId);
    };
  }, [dataMode]);

  const [query, setQuery] = useState("");
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(
    null,
  );
  const [resetViewRequest /* , setResetViewRequest */] = useState(0);

  // 林業現場向け新機能: 開閉サイドバー、複数山選択、レイヤー制御、詳細モーダル
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mountainsList, setMountainsList] =
    useState<MountainArea[]>(DEMO_MOUNTAINS);
  const [selectedMountainId, setSelectedMountainId] =
    useState<string>("shirakami-03");
  const [isAddMountainOpen, setIsAddMountainOpen] = useState(false);
  const [newMountainName, setNewMountainName] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newMapImageUrl, setNewMapImageUrl] = useState(
    "/maps/gozaisyo_toukousen.png",
  );
  // スマホ誤アクセス防止 & QRモーダル用ステート
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [copied, setCopied] = useState(false);
  // PC画面での緊急警報ステート & Web Audio音 (Issue #16)
  const [manualEmergencyAlert, setManualEmergencyAlert] = useState<{
    sensorId: string;
    sensorName: string;
    sensorCode: string;
    code: string;
    tiltDeg: number;
    reason: string;
  } | null>(null);
  const [latchedEmergencyAlert, setLatchedEmergencyAlert] = useState<{
    sensorId: string;
    sensorName: string;
    sensorCode: string;
    code: string;
    tiltDeg: number;
    reason: string;
  } | null>(null);
  const [dismissedDangerCodes, setDismissedDangerCodes] = useState<
    Record<string, boolean>
  >({});

  const pcAudioContextRef = useRef<AudioContext | null>(null);
  const pcAlarmIntervalRef = useRef<number | null>(null);

  const startPcAlarm = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        ("webkitAudioContext" in window
          ? (window.webkitAudioContext as typeof AudioContext)
          : undefined);
      if (!AudioCtx) return;
      if (!pcAudioContextRef.current) {
        pcAudioContextRef.current = new AudioCtx();
      }
      const ctx = pcAudioContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      clearInterval(pcAlarmIntervalRef.current ?? undefined);
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
      pcAlarmIntervalRef.current = window.setInterval(
        playBeep,
        BEEP_INTERVAL_MS,
      );
    } catch {
      // ブラウザの自動再生ポリシーにより音声再生がブロックされた場合は画面表示のみで警報を継続する
    }
  }, []);

  const stopPcAlarm = useCallback(() => {
    clearInterval(pcAlarmIntervalRef.current ?? undefined);
    pcAlarmIntervalRef.current = null;
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile =
        window.innerWidth < MOBILE_BREAKPOINT_PX ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      setIsMobileDevice(isMobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 実行環境の固定ホスト名（mDNS: Slack.local）およびLAN IP
  const [networkIp, setNetworkIp] = useState<string>("192.168.92.11");
  const [bonjourHost, setBonjourHost] = useState<string>("Slack.local");
  const [useBonjour, setUseBonjour] = useState<boolean>(true);
  const [customIp, setCustomIp] = useState<string>("");
  const [qrTargetNode, setQrTargetNode] = useState<string>("");

  useEffect(() => {
    fetch("/api/network-ip")
      .then((res) => res.json())
      .then((data: { ip?: string; hostname?: string }) => {
        if (data?.ip) setNetworkIp(data.ip);
        if (data?.hostname) setBonjourHost(data.hostname);
      })
      .catch(() => {
        // LAN IP自動取得に失敗した場合は初期ホスト名（Slack.local）へフォールバックする
      });
  }, []);
  const effectiveHost =
    customIp.trim() || (useBonjour ? bonjourHost : networkIp);

  const mobileUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (dataMode === "test") {
      params.set("mode", "test");
    }
    if (qrTargetNode) {
      params.set("node", qrTargetNode);
      params.set("tab", "register");
      params.set("nfc", "1");
    }
    const queryStr = params.toString();
    const querySuffix = queryStr ? `?${queryStr}` : "";
    if (typeof window === "undefined") {
      return `http://${effectiveHost}:3000/mobile${querySuffix}`;
    }
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const targetHost =
      hostname === "localhost" || hostname === "127.0.0.1"
        ? effectiveHost
        : hostname;
    return `${window.location.protocol}//${targetHost}${port}/mobile${querySuffix}`;
  }, [dataMode, effectiveHost, qrTargetNode]);
  const copyMobileUrl = () => {
    void navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  };
  const [baselines, setBaselines] = useState<
    Record<string, { ax: number; ay: number; az: number; setAt: string }>
  >({});

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
        if (mounted && data?.baselines) {
          setBaselines(data.baselines);
        }
        // 他機体の基準操作で別機体の警報が誤って消えないよう、機体別辞書 activeAlerts で当該機体の警報有無を確認する（Issue #29）
        if (mounted && manualEmergencyAlert) {
          const isCurrentManualAlertStillActive = data?.activeAlerts
            ? Boolean(data.activeAlerts[manualEmergencyAlert.sensorCode])
            : data?.activeAlert !== null &&
              (data?.activeAlert === undefined ||
                data.activeAlert.sensorCode ===
                  manualEmergencyAlert.sensorCode);
          if (!isCurrentManualAlertStillActive) {
            setManualEmergencyAlert(null);
          }
        }
      } catch {
        // 一時的な通信失敗時は直前の基準・警報状態を保持する
      }
    };
    void loadBaselines();
    const interval = setInterval(loadBaselines, BASELINE_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [manualEmergencyAlert]);

  const resetNodeBaseline = useCallback(
    async (nodeId: string) => {
      const latestItem = testObservations?.items
        ?.filter((it) => it.node_id === nodeId)
        .at(-1);

      if (!latestItem) {
        alert(
          `機体「${nodeId}」の観測データがまだ届いていません。受信開始をお待ちください。`,
        );
        return;
      }
      if (
        latestItem.ax_mg === 0 &&
        latestItem.ay_mg === 0 &&
        latestItem.az_mg === 0
      ) {
        alert("seq=0の全軸ゼロ初期化値は基準姿勢にできません。");
        return;
      }

      const newBaseline = {
        ax: latestItem.ax_mg,
        ay: latestItem.ay_mg,
        az: latestItem.az_mg,
        setAt: new Date().toLocaleTimeString("ja-JP"),
      };

      setBaselines((prev) => ({ ...prev, [nodeId]: newBaseline }));
      setLatchedEmergencyAlert((prev) =>
        prev?.sensorCode === nodeId ? null : prev,
      );
      setManualEmergencyAlert((prev) =>
        prev?.sensorCode === nodeId ? null : prev,
      );
      setDismissedDangerCodes((prev) => {
        if (!prev[nodeId]) return prev;
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
      stopPcAlarm();

      try {
        await fetch("/api/test-baseline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node_id: nodeId, ...newBaseline }),
        });
      } catch {
        // ignore sync error
      }
    },
    [stopPcAlarm, testObservations],
  );

  // SQLiteから登録済み山林工区（下絵画像URL・境界範囲）を取得
  useEffect(() => {
    let isMounted = true;
    async function loadMountains() {
      try {
        const response = await fetch("/api/backend/mountains", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as {
          items: Array<{
            id: string;
            name: string;
            area_name: string;
            description: string | null;
            min_latitude: number;
            max_latitude: number;
            min_longitude: number;
            max_longitude: number;
            map_image_url: string | null;
          }>;
        };
        if (!isMounted || !result.items || result.items.length === 0) return;

        const converted: MountainArea[] = result.items.map((mountainItem) => ({
          id: mountainItem.id,
          name: mountainItem.name,
          areaName: mountainItem.area_name,
          description: mountainItem.description,
          minLatitude: mountainItem.min_latitude,
          maxLatitude: mountainItem.max_latitude,
          minLongitude: mountainItem.min_longitude,
          maxLongitude: mountainItem.max_longitude,
          mapImageUrl: mountainItem.map_image_url,
          centerLatitude:
            (mountainItem.min_latitude + mountainItem.max_latitude) / 2,
          centerLongitude:
            (mountainItem.min_longitude + mountainItem.max_longitude) / 2,
        }));
        // DEMO_MOUNTAINSの定義を維持しつつ、DB登録の山林情報で更新・追加
        setMountainsList(() => {
          const mergedMap = new Map<string, MountainArea>();
          for (const item of DEMO_MOUNTAINS) {
            mergedMap.set(item.id, item);
          }
          for (const item of converted) {
            mergedMap.set(item.id, item);
          }
          return Array.from(mergedMap.values());
        });
        if (
          !converted.some(
            (mountainItem) => mountainItem.id === selectedMountainId,
          ) &&
          !DEMO_MOUNTAINS.some((m) => m.id === selectedMountainId)
        ) {
          setSelectedMountainId(converted[0]?.id ?? "shirakami-03");
        }
      } catch {
        // API未接続時はDEMO_MOUNTAINSを維持
      }
    }

    void loadMountains();
    return () => {
      isMounted = false;
    };
  }, [selectedMountainId]);

  const handleCreateMountain = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!newMountainName.trim() || !newAreaName.trim()) return;

    try {
      const response = await fetch("/api/backend/mountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMountainName.trim(),
          area_name: newAreaName.trim(),
          min_latitude: DEFAULT_NEW_MOUNTAIN_MIN_LAT,
          max_latitude: DEFAULT_NEW_MOUNTAIN_MAX_LAT,
          min_longitude: DEFAULT_NEW_MOUNTAIN_MIN_LON,
          max_longitude: DEFAULT_NEW_MOUNTAIN_MAX_LON,
          map_image_url:
            newMapImageUrl.trim() || "/maps/gozaisyo_toukousen.png",
        }),
      });
      if (response.ok) {
        const created = (await response.json()) as {
          id: string;
          name: string;
          area_name: string;
          description: string | null;
          min_latitude: number;
          max_latitude: number;
          min_longitude: number;
          max_longitude: number;
          map_image_url: string | null;
        };
        const newArea: MountainArea = {
          id: created.id,
          name: created.name,
          areaName: created.area_name,
          description: created.description,
          minLatitude: created.min_latitude,
          maxLatitude: created.max_latitude,
          minLongitude: created.min_longitude,
          maxLongitude: created.max_longitude,
          mapImageUrl: created.map_image_url,
          centerLatitude: (created.min_latitude + created.max_latitude) / 2,
          centerLongitude: (created.min_longitude + created.max_longitude) / 2,
        };
        setMountainsList((prev) => [...prev, newArea]);
        setSelectedMountainId(newArea.id);
        setIsAddMountainOpen(false);
        setNewMountainName("");
        setNewAreaName("");
      }
    } catch {
      // エラーハンドリング
    }
  };

  const [layerStates, setLayerStates] =
    useState<Record<MapLayerId, LayerVisibility>>(DEFAULT_LAYER_STATES);
  const [activePreset, setActivePreset] = useState<MapPresetMode>("disaster");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [selectedModalSensor, setSelectedModalSensor] =
    useState<DemoSensor | null>(null);
  const [isWarningPanelOpen, setIsWarningPanelOpen] = useState(true);
  const [mapViewEngine] = useState<"offline_svg" | "satellite_google">(
    initialMapEngine,
  );

  const currentMountain = useMemo(
    () =>
      mountainsList.find((mountain) => mountain.id === selectedMountainId) ??
      mountainsList[0] ??
      DEMO_MOUNTAINS[0],
    [mountainsList, selectedMountainId],
  );
  // 実機モード時は台帳データのみを採用し、デモデータとの混在を完全排除
  const baseSensors = useMemo(() => {
    if (dataMode === "test") {
      return registeredSensors;
    }
    return snapshot.sensors;
  }, [dataMode, registeredSensors, snapshot.sensors]);

  const filteredSensors = useMemo(
    () => filterSensors(baseSensors, query),
    [baseSensors, query],
  );

  // 実機パケットを受信しているが、台帳に未登録のノードIDを検出
  const unregisteredNodeIds = useMemo(() => {
    if (
      dataMode !== "test" ||
      !testObservations?.items ||
      testObservations.items.length === 0
    ) {
      return [];
    }
    const registeredCodes = new Set(
      baseSensors.map((sensor) => sensor.sensorCode),
    );
    const allLiveNodeIds = new Set(
      testObservations.items.map((item) => item.node_id),
    );
    return Array.from(allLiveNodeIds).filter(
      (nodeId) => !registeredCodes.has(nodeId),
    );
  }, [dataMode, testObservations, baseSensors]);

  // 実機テストモード時は共通評価関数 evaluateLiveSensorState を用いて傾斜・重要度・通信鮮度を一貫評価する（Issue #28, #31）
  const activeSensors = useMemo(() => {
    if (dataMode !== "test") {
      return filteredSensors;
    }

    const latestByNode: Record<
      string,
      NonNullable<typeof testObservations>["items"][number]
    > = {};
    for (const item of testObservations?.items ?? []) {
      latestByNode[item.node_id] = item;
    }

    const refreshedTimestampMs = testObservations?.refreshed_at
      ? Date.parse(testObservations.refreshed_at)
      : Number.NaN;
    const evaluationTimestampMs =
      !testObsError && Number.isFinite(refreshedTimestampMs)
        ? Math.max(currentTimestampMs, refreshedTimestampMs)
        : currentTimestampMs;

    return filteredSensors.map((sensor) =>
      evaluateLiveSensorState(
        sensor,
        latestByNode[sensor.sensorCode] ?? null,
        baselines[sensor.sensorCode] ?? null,
        evaluationTimestampMs,
        Boolean(testObsError),
      ),
    );
  }, [
    baselines,
    currentTimestampMs,
    dataMode,
    filteredSensors,
    testObsError,
    testObservations,
  ]);

  const visibleSensorIds = useMemo(
    () => new Set(activeSensors.map((sensor) => sensor.id)),
    [activeSensors],
  );

  const currentModalSensor = useMemo(
    () =>
      selectedModalSensor
        ? (activeSensors.find(
            (sensor) => sensor.id === selectedModalSensor.id,
          ) ?? selectedModalSensor)
        : null,
    [activeSensors, selectedModalSensor],
  );

  const effectiveRefreshedAt = useMemo(() => {
    if (
      dataMode === "test" &&
      !testObsError &&
      testObservations?.refreshed_at
    ) {
      return testObservations.refreshed_at;
    }
    return snapshot.refreshedAt;
  }, [dataMode, snapshot.refreshedAt, testObsError, testObservations]);

  const activeAlerts = useMemo<DemoAlert[]>(() => {
    if (dataMode !== "test") {
      return snapshot.alerts;
    }
    const alerts: DemoAlert[] = [];
    for (const sensor of activeSensors) {
      const startedAt = sensor.lastReceivedAt ?? effectiveRefreshedAt;
      if (
        sensor.observationSeverity === "danger" ||
        sensor.observationSeverity === "caution"
      ) {
        alerts.push({
          id: `live-alert-${sensor.id}`,
          sensorId: sensor.id,
          sensorCode: sensor.sensorCode,
          sensorName: sensor.name,
          category: "tilt",
          severity: sensor.observationSeverity,
          startedAt,
          measuredValue: sensor.tiltValue,
          unit: "deg",
          source: "device_test",
        });
      }
      if (sensor.lowBattery) {
        alerts.push({
          id: `live-battery-${sensor.id}`,
          sensorId: sensor.id,
          sensorCode: sensor.sensorCode,
          sensorName: sensor.name,
          category: "battery",
          severity: "status",
          startedAt,
          measuredValue: sensor.batteryPercent,
          unit: "%",
          source: "device_test",
        });
      }
    }
    return alerts;
  }, [activeSensors, dataMode, effectiveRefreshedAt, snapshot.alerts]);

  const handleDeleteSensorFromMap = useCallback(
    async (sensorId: string) => {
      const targetSensor = activeSensors.find(
        (sensor) => sensor.id === sensorId,
      );
      const name = targetSensor?.name ?? sensorId;
      const code = targetSensor?.sensorCode ?? "";
      if (
        !window.confirm(
          `センサー「${name} (${code})」を台帳から削除しますか？\n（削除すると、同じIDで新しく正常に登録できるようになります）`,
        )
      ) {
        return;
      }
      try {
        const res = await fetch(
          `/api/test-sensors/${encodeURIComponent(sensorId)}`,
          { method: "DELETE" },
        );
        if (res.ok || res.status === HTTP_NO_CONTENT) {
          setRegisteredSensors((prev) =>
            prev.filter((sensor) => sensor.id !== sensorId),
          );
          setSelectedModalSensor(null);
        } else {
          alert("センサーの削除に失敗しました");
        }
      } catch {
        alert("センサーAPIへ接続できませんでした");
      }
    },
    [activeSensors],
  );
  const severityCounts = useMemo(
    () => countSeverities(activeSensors),
    [activeSensors],
  );

  useEffect(() => {
    // ダッシュボードの警告リンクから渡された対象センサーへ地図を移動します。
    const requestedSensorId = new URLSearchParams(window.location.search).get(
      "focus",
    );
    if (requestedSensorId) {
      const frameId = window.requestAnimationFrame(() => {
        setSelectedSensorId(requestedSensorId);
        setFocusRequest({ sensorId: requestedSensorId, requestId: 1 });
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, []);

  useEffect(() => {
    if (dataMode === "test" || newAlerts.length === 0) {
      return;
    }
    const timeoutId = window.setTimeout(
      dismissNewAlerts,
      TOAST_DISMISS_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [dataMode, dismissNewAlerts, newAlerts.length]);

  // 実機センサー（基準設定済みかつ15°以上のdanger）またはデモdangerからの緊急警報検出とラッチ保持 (Issue #17, #18)
  const liveDangerSensor = useMemo(() => {
    return (
      activeSensors.find(
        (sensor) =>
          sensor.observationSeverity === "danger" &&
          sensor.tiltValue !== null &&
          sensor.tiltValue >= DANGER_TILT_THRESHOLD_DEG &&
          !dismissedDangerCodes[sensor.sensorCode],
      ) ?? null
    );
  }, [activeSensors, dismissedDangerCodes]);

  useEffect(() => {
    if (liveDangerSensor) {
      const alertPayload = {
        sensorId: liveDangerSensor.id,
        sensorName: liveDangerSensor.name,
        sensorCode: liveDangerSensor.sensorCode,
        code: liveDangerSensor.sensorCode,
        tiltDeg: liveDangerSensor.tiltValue ?? DANGER_TILT_THRESHOLD_DEG,
        reason: "大きな姿勢変化（倒木・地滑りの危険）",
      };
      const timer = setTimeout(() => {
        setLatchedEmergencyAlert(alertPayload);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [liveDangerSensor]);

  // センサーの傾斜が15°未満（normal / caution）に戻ったら確認解除フラグをクリアし、次回の再傾斜時に再発火可能にする
  useEffect(() => {
    const dismissedKeys = Object.keys(dismissedDangerCodes);
    if (dismissedKeys.length === 0) return;
    const recoveredCodes = dismissedKeys.filter((code) => {
      const sensor = activeSensors.find((item) => item.sensorCode === code);
      if (!sensor) return false;
      return (
        sensor.observationSeverity !== "danger" ||
        sensor.tiltValue === null ||
        sensor.tiltValue < DANGER_TILT_THRESHOLD_DEG
      );
    });
    if (recoveredCodes.length > 0) {
      const timer = setTimeout(() => {
        setDismissedDangerCodes((prev) => {
          const next = { ...prev };
          for (const code of recoveredCodes) {
            delete next[code];
          }
          return next;
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeSensors, dismissedDangerCodes]);

  const activeEmergencyAlert = useMemo(() => {
    if (manualEmergencyAlert) return manualEmergencyAlert;
    if (liveDangerSensor) {
      return {
        sensorId: liveDangerSensor.id,
        sensorName: liveDangerSensor.name,
        sensorCode: liveDangerSensor.sensorCode,
        code: liveDangerSensor.sensorCode,
        tiltDeg: liveDangerSensor.tiltValue ?? DANGER_TILT_THRESHOLD_DEG,
        reason: "大きな姿勢変化（倒木・地滑りの危険）",
      };
    }
    if (
      latchedEmergencyAlert &&
      !dismissedDangerCodes[latchedEmergencyAlert.sensorCode]
    ) {
      return latchedEmergencyAlert;
    }
    return null;
  }, [
    dismissedDangerCodes,
    latchedEmergencyAlert,
    liveDangerSensor,
    manualEmergencyAlert,
  ]);

  const previousEmergencyCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeEmergencyAlert) {
      previousEmergencyCodeRef.current = activeEmergencyAlert.sensorCode;
      startPcAlarm();
      void fetch("/api/test-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: activeEmergencyAlert.sensorCode,
          activeAlert: {
            sensorCode: activeEmergencyAlert.sensorCode,
            sensorName: activeEmergencyAlert.sensorName,
            tiltDeg: activeEmergencyAlert.tiltDeg,
            reason: activeEmergencyAlert.reason,
            triggeredAt: new Date().toISOString(),
          },
        }),
      }).catch(() => {
        // 警報同期APIが一時的に応答しない場合もPC画面の警報表示は継続する
      });
    } else {
      stopPcAlarm();
      const clearedCode = previousEmergencyCodeRef.current;
      if (clearedCode) {
        previousEmergencyCodeRef.current = null;
        void fetch("/api/test-baseline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clearAlert: true, node_id: clearedCode }),
        }).catch(() => {
          // 警報解除同期の失敗時は次回ポーリングで再同期する
        });
      }
    }
    return () => stopPcAlarm();
  }, [activeEmergencyAlert, startPcAlarm, stopPcAlarm]);

  const openSensorDetails = useCallback(
    (sensor: DemoSensor) => {
      // 地図画面を遷移元として保持し、同一タブ内で詳細へ切り替えます。
      router.push(`/sensors/${encodeURIComponent(sensor.id)}?from=map`);
    },
    [router],
  );

  const focusSensor = useCallback((sensorId: string) => {
    // 警告からの明示的な移動では検索による非表示を解除し、対象を必ず確認可能にします。
    setQuery("");
    setSelectedSensorId(sensorId);
    setFocusRequest((current) => ({
      sensorId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, []);

  const handlePresetChange = useCallback((preset: MapPresetMode) => {
    setActivePreset(preset);
    if (preset === "disaster") {
      setLayerStates({
        sensor: "visible",
        boundary: "faded",
        rest_point: "visible",
        route_track: "faded",
        wildlife_hazard: "hidden",
        geology_risk: "hidden",
      });
    } else if (preset === "planning") {
      setLayerStates({
        sensor: "visible",
        boundary: "visible",
        rest_point: "visible",
        route_track: "visible",
        wildlife_hazard: "faded",
        geology_risk: "faded",
      });
    } else if (preset === "safety") {
      setLayerStates({
        sensor: "visible",
        boundary: "faded",
        rest_point: "visible",
        route_track: "hidden",
        wildlife_hazard: "visible",
        geology_risk: "visible",
      });
    } else if (preset === "all") {
      setLayerStates({
        sensor: "visible",
        boundary: "visible",
        rest_point: "visible",
        route_track: "visible",
        wildlife_hazard: "visible",
        geology_risk: "visible",
      });
    }
  }, []);

  const handleLayerChange = useCallback(
    (layerId: MapLayerId, visibility: LayerVisibility) => {
      setLayerStates((prev) => ({ ...prev, [layerId]: visibility }));
    },
    [],
  );

  return (
    <main
      className={`${styles.appShell} ${!isWarningPanelOpen ? styles.panelClosed : ""} ${!sidebarOpen ? styles.sidebarClosed : ""}`.trim()}
    >
      <AppSidebar
        activePath="/map"
        demoDescription={
          dataMode === "test" ? "実機台帳DBと接続中" : "架空データを表示中"
        }
        environmentLabel={dataMode === "test" ? "実機 TEST" : "デモモード"}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((previousOpen) => !previousOpen)}
      />

      <section className={styles.workspace}>
        {/* PC画面での緊急警報バナー (Issue #16) */}
        {activeEmergencyAlert && (
          <aside className={styles.pcEmergencyBanner} role="alert">
            <div className={styles.pcEmergencyLeft}>
              <span className={styles.pcEmergencyIcon} aria-hidden="true">
                🚨
              </span>
              <div>
                <strong className={styles.pcEmergencyTitle}>
                  【緊急警報】山林センサーの大きな姿勢変化を検知しました！
                </strong>
                <p className={styles.pcEmergencyDesc}>
                  対象機体:{" "}
                  <strong>
                    {activeEmergencyAlert.sensorName}（
                    {activeEmergencyAlert.sensorCode}）
                  </strong>{" "}
                  | 傾斜変位:{" "}
                  <strong>+{activeEmergencyAlert.tiltDeg.toFixed(1)}°</strong> |
                  倒木・地滑りの恐れがあります。現場安全確認を発令してください。
                </p>
              </div>
            </div>
            <div className={styles.pcEmergencyActions}>
              <button
                type="button"
                className={styles.pcEmergencyCalibrateBtn}
                onClick={() => {
                  void resetNodeBaseline(activeEmergencyAlert.code);
                }}
                title="現在取得されている角度を基準姿勢に確定し、角度を0.0°にリセットして警報を直ちに停止します"
              >
                🎯 現在の姿勢を0°基準に再設定（角度0°・警報停止）
              </button>
              <button
                type="button"
                className={styles.pcEmergencyFocusBtn}
                onClick={() => focusSensor(activeEmergencyAlert.sensorId)}
              >
                🎯 対象地点を表示
              </button>
              <button
                type="button"
                className={styles.pcEmergencyDismissBtn}
                onClick={() => {
                  const codesToDismiss: Record<string, boolean> = {
                    [activeEmergencyAlert.sensorCode]: true,
                  };
                  for (const sensor of activeSensors) {
                    if (
                      sensor.observationSeverity === "danger" ||
                      (sensor.tiltValue !== null &&
                        sensor.tiltValue >= DANGER_TILT_THRESHOLD_DEG)
                    ) {
                      codesToDismiss[sensor.sensorCode] = true;
                    }
                  }
                  setDismissedDangerCodes((prev) => ({
                    ...prev,
                    ...codesToDismiss,
                  }));
                  setLatchedEmergencyAlert(null);
                  setManualEmergencyAlert(null);
                  stopPcAlarm();
                }}
              >
                🔕 警報を確認して解除（警報音を停止）
              </button>
            </div>
          </aside>
        )}
        {isMobileDevice && (
          <aside className={styles.mobileWarningBanner} role="status">
            <span>
              📱
              スマートフォンからアクセスされています。現場作業・実演用の専用画面を開きますか？
            </span>
            <Link
              className={styles.mobileWarningLink}
              href={dataMode === "test" ? "/mobile?mode=test" : "/mobile"}
            >
              現場専用画面（/mobile）へ移動 ↗
            </Link>
          </aside>
        )}
        {unregisteredNodeIds.length > 0 && (
          <aside className={styles.unregisteredBanner} role="alert">
            <Icon name="alert" />
            <span>
              未登録の端末からデータを受信しています:{" "}
              <strong>{unregisteredNodeIds.join(", ")}</strong>
              （台帳未登録のため地図上に配置されていません。
              <Link className={styles.registerLink} href="/sensors">
                センサー管理台帳で登録してください ↗
              </Link>
              ）
            </span>
          </aside>
        )}

        {dataMode === "test" && baseSensors.length === 0 && (
          <div className={styles.emptyRegistryNotice}>
            <p>
              台帳（SQLite）に登録されたセンサーがありません。
              <Link href="/sensors">センサー管理画面（/sensors）</Link>
              からセンサーを登録してください。
            </p>
          </div>
        )}

        {/* 上部パンくずリスト & マップ制御バー */}
        <div className={styles.breadcrumbsBar}>
          <div className={styles.breadcrumbsLeft}>
            {!sidebarOpen && (
              <SidebarToggleButton
                isOpen={false}
                onClick={() => setSidebarOpen(true)}
              />
            )}
            <Breadcrumbs
              items={[
                { label: "山林一覧", href: "/map" },
                {
                  label: currentMountain.name,
                  href: `/map?mountain=${currentMountain.id}`,
                },
                { label: currentMountain.areaName, current: true },
              ]}
            />
          </div>

          <div className={styles.breadcrumbsRight}>
            <div
              aria-label="山林工区選択"
              className={styles.engineSwitcher}
              role="group"
            >
              {mountainsList.map((mountain) => (
                <button
                  data-sanmou-button="secondary"
                  aria-pressed={mountain.id === selectedMountainId}
                  className={`${styles.engineBtn} ${mountain.id === selectedMountainId ? styles.activeEngine : ""}`}
                  key={mountain.id}
                  onClick={() => setSelectedMountainId(mountain.id)}
                  type="button"
                >
                  {mountain.name}
                </button>
              ))}
              <button
                aria-label="新しい山林工区を登録"
                className={styles.addMountainBtn}
                onClick={() => setIsAddMountainOpen(true)}
                title="新しい山林工区・下絵図面を登録"
                type="button"
              >
                ＋
              </button>
            </div>
            <button
              className={styles.openMobileModalBtn}
              onClick={() => setIsQrModalOpen(true)}
              title="スマートフォンでこの画面を開くためのQRコードを表示"
              type="button"
            >
              📱 スマホで開く（QR）
            </button>
            <button
              className={styles.resetT1AngleBtn}
              onClick={() => resetNodeBaseline("T1")}
              title="タニさんが直立した状態でクリックすると、T1の角度を0.0°にリセット（キャリブレーション確定）します"
              type="button"
            >
              🎯 T1角度リセット(0°)
              {baselines["T1"] ? ` [${baselines["T1"].setAt}確定]` : ""}
            </button>

            <LayerController
              activePreset={activePreset}
              isOpen={layerPanelOpen}
              layerStates={layerStates}
              onLayerChange={handleLayerChange}
              onPresetChange={handlePresetChange}
              onToggleOpen={() =>
                setLayerPanelOpen((previousOpen) => !previousOpen)
              }
            />

            <button
              data-sanmou-button="secondary"
              aria-label={
                isWarningPanelOpen ? "警告パネルを閉じる" : "警告パネルを開く"
              }
              className={`${styles.warningToggleBtn} ${activeAlerts.length > 0 ? styles.hasAlerts : ""}`}
              onClick={() =>
                setIsWarningPanelOpen((previousOpen) => !previousOpen)
              }
              type="button"
            >
              <Icon name="alert" />
              <span>警告一覧 ({activeAlerts.length})</span>
            </button>
          </div>
        </div>

        {/* 右側に警告パネルがあるため上部ヘッダーと状態集計を1行に凝縮し、地図の縦表示領域を最大化する */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.titleBlock}>
              <div>
                <h1>センサー監視</h1>
                {dataMode === "test" ? (
                  isLiveTestMode ? (
                    <span className={styles.liveBadge}>実機受信中 (TEST)</span>
                  ) : (
                    <span className={styles.waitingBadge}>
                      実機待機中 (TEST)
                    </span>
                  )
                ) : (
                  <span className={styles.demoBadge}>デモ</span>
                )}
              </div>
            </div>

            <section className={styles.summaryBar} aria-label="監視状態の集計">
              <div className={styles.summaryPills}>
                {SUMMARY_ORDER.map((severity) => (
                  <div
                    className={styles.summaryPill}
                    data-tone={severity}
                    key={severity}
                  >
                    <span
                      className={styles.sensorDot}
                      data-severity={severity}
                      aria-hidden="true"
                    />
                    <span className={styles.summaryPillLabel}>
                      {OBSERVATION_LABELS[severity]}
                    </span>
                    <strong className={styles.summaryPillValue}>
                      {severityCounts[severity]}
                    </strong>
                    <span className={styles.summaryPillUnit}>台</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={styles.headerActions}>
            <p className={styles.updatedAt}>
              <span>最終更新</span>
              <time dateTime={effectiveRefreshedAt} suppressHydrationWarning>
                {formatJapanDateTime(effectiveRefreshedAt)}
              </time>
              <i aria-label="更新状態: 正常" />
            </p>
            <label className={styles.searchBox}>
              <Icon name="search" />
              <span className="sr-only">センサーを検索</span>
              <input
                aria-label="センサーを検索"
                placeholder="ID・名称で検索"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button
                  data-sanmou-button="secondary"
                  aria-label="検索をクリア"
                  type="button"
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              ) : null}
            </label>
          </div>
        </header>
        <section className={styles.mapSection}>
          <div className={styles.mapFrame}>
            {mapViewEngine === "offline_svg" ? (
              <OfflineMountainMap
                layerStates={layerStates}
                mapImageUrl={currentMountain.mapImageUrl}
                mountainBounds={
                  currentMountain.minLatitude !== undefined &&
                  currentMountain.maxLatitude !== undefined &&
                  currentMountain.minLongitude !== undefined &&
                  currentMountain.maxLongitude !== undefined
                    ? {
                        minLat: currentMountain.minLatitude,
                        maxLat: currentMountain.maxLatitude,
                        minLon: currentMountain.minLongitude,
                        maxLon: currentMountain.maxLongitude,
                      }
                    : undefined
                }
                mountainName={`${currentMountain.name} ${currentMountain.areaName}`}
                overlayPaths={dataMode === "test" ? [] : DEMO_OVERLAY_PATHS}
                overlayPoints={dataMode === "test" ? [] : DEMO_OVERLAY_POINTS}
                selectedSensorId={selectedSensorId}
                sensors={activeSensors}
                onSelectSensor={(sensor) => setSelectedModalSensor(sensor)}
              />
            ) : (
              <SatelliteMap
                focusRequest={focusRequest}
                resetViewRequest={resetViewRequest}
                selectedSensorId={selectedSensorId}
                sensors={activeSensors}
                visibleSensorIds={visibleSensorIds}
                onOpenDetails={openSensorDetails}
                onSelectSensor={setSelectedSensorId}
              />
            )}
          </div>
          <footer className={styles.mapFooter}>
            <div className={styles.legend} aria-label="マーカー凡例">
              {SUMMARY_ORDER.map((severity) => (
                <span key={severity}>
                  <i data-severity={severity} />
                  {OBSERVATION_LABELS[severity]}
                </span>
              ))}
            </div>
            <div className={styles.mapFooterActions}>
              <span className={styles.resultCount}>
                <strong>{filteredSensors.length}台を表示</strong>
                {filteredSensors.length < baseSensors.length
                  ? ` / ${baseSensors.length - filteredSensors.length}台を非表示`
                  : null}
              </span>
              {/* 将来のスタンドアロンアプリ化（DEC-13）時に独自ズーム・パンを復帰させる際のリセット導線としてコメントアウト保持（GEMINI.md Rule 11）
              <Button
                className={styles.resetMapButton}
                variant="secondary"
                onClick={() => setResetViewRequest((current) => current + 1)}
              >
                全域表示
              </Button>
              */}
            </div>
          </footer>
        </section>
      </section>

      {isWarningPanelOpen && (
        <WarningPanel
          alerts={activeAlerts}
          onFocusSensor={focusSensor}
          onTriggerTestAlert={() => {
            const target = activeSensors[0];
            const code = target?.sensorCode ?? "T1";
            setManualEmergencyAlert({
              sensorId: target?.id ?? "DEMO-001",
              sensorName: target?.name ?? "樹木ノード T1（タニ装着）",
              sensorCode: code,
              code,
              tiltDeg: TEST_ALERT_DEMO_TILT_DEG,
              reason: "大きな姿勢変化検知（実演ピッチ用）",
            });
          }}
          refreshedAt={effectiveRefreshedAt}
          selectedSensorId={selectedSensorId}
        />
      )}

      {/* マーカークリック時のハイブリッド詳細推移モーダル */}
      <SensorDetailModal
        isCalibrated={Boolean(
          currentModalSensor && baselines[currentModalSensor.sensorCode],
        )}
        onClose={() => setSelectedModalSensor(null)}
        onDeleteSensor={handleDeleteSensorFromMap}
        onResetBaseline={resetNodeBaseline}
        sensor={currentModalSensor}
      />

      {dataMode !== "test" && newAlerts.length > 0 ? (
        <div className={styles.toast} role="status">
          <Icon name="alert" />
          <div>
            <strong>新しいデモ警告</strong>
            <span>{newAlerts.length}件の警告を受信しました</span>
          </div>
          <button
            data-sanmou-button="secondary"
            aria-label="通知を閉じる"
            type="button"
            onClick={dismissNewAlerts}
          >
            ×
          </button>
        </div>
      ) : null}

      {/* 新規山林工区・下絵地図の登録モーダル */}
      {isAddMountainOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget)
              setIsAddMountainOpen(false);
          }}
        >
          <div
            aria-labelledby="add-mountain-title"
            aria-modal="true"
            className={styles.mountainModal}
            role="dialog"
          >
            <header className={styles.modalHeader}>
              <h3 id="add-mountain-title">🌲 新規山林工区の登録</h3>
              <button
                aria-label="閉じる"
                className={styles.modalCloseBtn}
                onClick={() => setIsAddMountainOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>
            <form onSubmit={handleCreateMountain} className={styles.modalForm}>
              <label className={styles.formField}>
                <span>山林名</span>
                <input
                  placeholder="例: 御在所岳"
                  required
                  value={newMountainName}
                  onChange={(changeEvent) =>
                    setNewMountainName(changeEvent.target.value)
                  }
                />
              </label>
              <label className={styles.formField}>
                <span>工区名・林班</span>
                <input
                  placeholder="例: 本谷・一ノ谷工区"
                  required
                  value={newAreaName}
                  onChange={(changeEvent) =>
                    setNewAreaName(changeEvent.target.value)
                  }
                />
              </label>
              <label className={styles.formField}>
                <span>下絵地図画像パス</span>
                <input
                  placeholder="/maps/gozaisyo_toukousen.png"
                  value={newMapImageUrl}
                  onChange={(changeEvent) =>
                    setNewMapImageUrl(changeEvent.target.value)
                  }
                />
                <small>※ 森林基本図スキャンPNGまたは航空写真画像</small>
              </label>
              <footer className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsAddMountainOpen(false)}
                >
                  キャンセル
                </button>
                <button type="submit" className={styles.submitBtn}>
                  山林工区を保存
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* 現場スマートフォン接続用 QRコード & NFCモーダル */}
      {isQrModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget)
              setIsQrModalOpen(false);
          }}
        >
          <div
            aria-labelledby="qr-modal-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <header className={styles.modalHeader}>
              <h3 id="qr-modal-title">📱 現場スマホで開く（QRコード & NFC）</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setIsQrModalOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>

            <div className={styles.qrModalBody}>
              <p>
                スマホの標準カメラ（またはNFCタグ）をかざすだけで、専用の現場警報・機体設置登録画面が直接開きます。
              </p>

              <div className={styles.hostModeSwitcher}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${qrTargetNode === "" ? styles.activeModeBtn : ""}`}
                  onClick={() => setQrTargetNode("")}
                >
                  🚨 現場警報モニター画面を開く（/mobile）
                </button>
                {["T1", "S1", "T2", "S2"].map((nodeCode) => (
                  <button
                    key={nodeCode}
                    type="button"
                    className={`${styles.modeBtn} ${qrTargetNode === nodeCode ? styles.activeModeBtn : ""}`}
                    onClick={() => setQrTargetNode(nodeCode)}
                  >
                    🏷️ 機体「{nodeCode}」のNFC設置登録URLを生成
                  </button>
                ))}
              </div>

              <div className={styles.qrContainer}>
                <QrCode size={QR_CODE_SIZE_PX} value={mobileUrl} />
              </div>

              <div className={styles.qrUrlBox}>
                <span className={styles.qrUrlText}>{mobileUrl}</span>
                <button
                  className={styles.copyUrlBtn}
                  onClick={copyMobileUrl}
                  type="button"
                >
                  {copied ? "コピー完了！" : "URLコピー"}
                </button>
              </div>
              <div className={styles.hostModeSwitcher}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${useBonjour && !customIp ? styles.activeModeBtn : ""}`}
                  onClick={() => {
                    setUseBonjour(true);
                    setCustomIp("");
                  }}
                >
                  🍏 固定ホスト名: {bonjourHost}（推奨・IP変更に影響なし）
                </button>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${!useBonjour && !customIp ? styles.activeModeBtn : ""}`}
                  onClick={() => {
                    setUseBonjour(false);
                    setCustomIp("");
                  }}
                >
                  🌐 IP直接指定: {networkIp}
                </button>
              </div>

              <div className={styles.ipConfigBox}>
                <label htmlFor="custom-ip-input">
                  LAN接続先IP（自動検出: <code>{networkIp}</code>）:
                </label>
                <div className={styles.ipInputRow}>
                  <input
                    id="custom-ip-input"
                    className={styles.ipInput}
                    placeholder={networkIp}
                    value={customIp}
                    onChange={(changeEvent) =>
                      setCustomIp(changeEvent.target.value)
                    }
                  />
                  {customIp && (
                    <button
                      type="button"
                      className={styles.resetIpBtn}
                      onClick={() => setCustomIp("")}
                    >
                      自動に戻す
                    </button>
                  )}
                </div>
                <small className={styles.ipHelpText}>
                  ※
                  スマホとMacが同じWi-Fi（またはiPhoneのテザリング）に接続されている必要があります。
                </small>
              </div>
              <div className={styles.qrNfcGuide}>
                <strong>🏷️ NFCタグで開く場合:</strong>
                <span>
                  NFCタグを機体に貼り付ける場合、このURL（
                  <code>{mobileUrl}</code>
                  ）をNFCタグに書き込んでおくと、スマホをかざすだけでSafariが自動起動します。
                </span>
              </div>
            </div>

            <footer className={styles.modalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => setIsQrModalOpen(false)}
                type="button"
              >
                閉じる
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
