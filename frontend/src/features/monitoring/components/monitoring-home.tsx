"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AppSidebar,
  SidebarToggleButton,
} from "../../../components/ui/app-sidebar";
import { Breadcrumbs } from "../../../components/ui/breadcrumbs";
import { Button, KpiTile } from "../../../components/ui/ui-primitives";
import { QrCode } from "../../../components/ui/qr-code";
import {
  DEFAULT_LAYER_STATES,
  DEMO_MOUNTAINS,
  DEMO_OVERLAY_PATHS,
  DEMO_OVERLAY_POINTS,
} from "../demo-data";
import {
  countSeverities,
  filterSensors,
  formatJapanDateTime,
  OBSERVATION_LABELS,
} from "../monitoring-utils";
import type {
  CommunicationStatus,
  DemoSensor,
  LayerVisibility,
  MapLayerId,
  MapPresetMode,
  MountainArea,
  ObservationSeverity,
} from "../types";
import { useTestObservations } from "../../dashboard/use-test-observations";
import type { TestSensorListResponse } from "../../sensor-management/sensor-api-types";
import { useDemoMonitoring } from "../use-demo-monitoring";
import { Icon } from "./icon";
import { LayerController } from "./layer-controller";
import styles from "./monitoring-home.module.css";
import { OfflineMountainMap } from "./offline-mountain-map";
import { type MapFocusRequest, SatelliteMap } from "./satellite-map";
import { SensorDetailModal } from "./sensor-detail-modal";
import { WarningPanel } from "./warning-panel";
const SUMMARY_ORDER: ObservationSeverity[] = ["normal", "caution", "danger"];

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
  const { data: testObservations } = useTestObservations();
  const isLiveTestMode = Boolean(
    testObservations?.items && testObservations.items.length > 0,
  );
  const [registeredSensors, setRegisteredSensors] = useState<DemoSensor[]>([]);

  // 実機テストモード時（SANMOU_APP_ENV === "test"）は、SQLiteに登録された正規の台帳データを取得
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

        const converted: DemoSensor[] = result.items.map((item) => ({
          id: item.id,
          sensorCode: item.sensor_code,
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          observationSeverity: (item.observation_severity === "unknown"
            ? "normal"
            : item.observation_severity) as ObservationSeverity,
          communicationStatus:
            item.communication_status === "unknown"
              ? "offline"
              : item.communication_status,
          deviceFaultStatus:
            item.device_fault_status === "unknown"
              ? "ok"
              : item.device_fault_status,
          lowBattery: Boolean(item.low_battery),
          soilMoistureValue: null,
          tiltValue: null,
          batteryPercent: null,
          lastReceivedAt: item.last_received_at,
          source: "device_test",
          nodeType: item.sensor_code.startsWith("T") ? "tree" : "slope",
        }));
        setRegisteredSensors(converted);
      } catch {
        // API未接続時は前回の状態を維持
      }
    }

    void loadTestSensors();
    const timerId = window.setInterval(loadTestSensors, 5000);
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
  const [resetViewRequest, setResetViewRequest] = useState(0);

  // 林業現場向け新機能: 開閉サイドバー、複数山選択、レイヤー制御、詳細モーダル
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mountainsList, setMountainsList] =
    useState<MountainArea[]>(DEMO_MOUNTAINS);
  const [selectedMountainId, setSelectedMountainId] =
    useState<string>("gozaisyo-01");
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
    tiltDeg: number;
    reason: string;
  } | null>(null);

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
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      };
      playBeep();
      pcAlarmIntervalRef.current = window.setInterval(playBeep, 600);
    } catch {
      // Audio not permitted yet
    }
  }, []);

  const stopPcAlarm = useCallback(() => {
    clearInterval(pcAlarmIntervalRef.current ?? undefined);
    pcAlarmIntervalRef.current = null;
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile =
        window.innerWidth < 768 ||
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

  useEffect(() => {
    fetch("/api/network-ip")
      .then((res) => res.json())
      .then((data: { ip?: string; hostname?: string }) => {
        if (data?.ip) setNetworkIp(data.ip);
        if (data?.hostname) setBonjourHost(data.hostname);
      })
      .catch(() => {});
  }, []);

  const effectiveHost =
    customIp.trim() || (useBonjour ? bonjourHost : networkIp);

  const mobileUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `http://${effectiveHost}:3000/mobile`;
    }
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const targetHost =
      hostname === "localhost" || hostname === "127.0.0.1"
        ? effectiveHost
        : hostname;
    return `${window.location.protocol}//${targetHost}${port}/mobile`;
  }, [effectiveHost]);

  const copyMobileUrl = () => {
    void navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // 各機体の基準姿勢（キャリブレーションベクトル）の共有とリセット
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
        };
        if (mounted && data?.baselines) {
          setBaselines(data.baselines);
        }
      } catch {
        // ignore network error
      }
    };
    void loadBaselines();
    const interval = setInterval(loadBaselines, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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
    [testObservations],
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

        const converted: MountainArea[] = result.items.map((m) => ({
          id: m.id,
          name: m.name,
          areaName: m.area_name,
          description: m.description,
          minLatitude: m.min_latitude,
          maxLatitude: m.max_latitude,
          minLongitude: m.min_longitude,
          maxLongitude: m.max_longitude,
          mapImageUrl: m.map_image_url,
          centerLatitude: (m.min_latitude + m.max_latitude) / 2,
          centerLongitude: (m.min_longitude + m.max_longitude) / 2,
        }));
        setMountainsList(converted);
        if (!converted.some((m) => m.id === selectedMountainId)) {
          setSelectedMountainId(converted[0]?.id ?? "gozaisyo-01");
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

  const handleCreateMountain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMountainName.trim() || !newAreaName.trim()) return;

    try {
      const response = await fetch("/api/backend/mountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMountainName.trim(),
          area_name: newAreaName.trim(),
          min_latitude: 35.008,
          max_latitude: 35.025,
          min_longitude: 136.415,
          max_longitude: 136.455,
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
      mountainsList.find((m) => m.id === selectedMountainId) ??
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
    const registeredCodes = new Set(baseSensors.map((s) => s.sensorCode));
    const allLiveNodeIds = new Set(
      testObservations.items.map((item) => item.node_id),
    );
    return Array.from(allLiveNodeIds).filter(
      (nodeId) => !registeredCodes.has(nodeId),
    );
  }, [dataMode, testObservations, baseSensors]);

  // 実機テストモード時（USBシリアル受信時）は、届いた生観測値を台帳センサーへ正規照合（固定エイリアス廃止）
  const activeSensors = useMemo(() => {
    if (
      dataMode !== "test" ||
      !testObservations?.items ||
      testObservations.items.length === 0
    ) {
      return filteredSensors;
    }

    const latestByNode: Record<string, (typeof testObservations.items)[0]> = {};
    for (const item of testObservations.items) {
      latestByNode[item.node_id] = item;
    }

    return filteredSensors.map((sensor) => {
      // 台帳の sensorCode とパケットの node_id を完全一致で正規照合
      const live = latestByNode[sensor.sensorCode];
      if (!live) return sensor;
      // seq=0 の全軸ゼロは基準取得・角度計算から除外する（Issue #13）
      const isZeroAcc =
        live.ax_mg === 0 && live.ay_mg === 0 && live.az_mg === 0;

      const soilMoisture =
        live.soil_raw === null || live.soil_raw === -1
          ? null
          : Math.min(Math.max(live.soil_raw / 2000, 0), 1.0);
      const nodeBaseline = baselines[sensor.sensorCode];
      let tiltDeg: number | null = null;
      let severity: ObservationSeverity = "normal";

      if (isZeroAcc) {
        tiltDeg = null;
      } else if (nodeBaseline) {
        // 確定した基準姿勢ベクトルとの成す角（度）を計算 (内積・コサイン類似度)
        const dot =
          live.ax_mg * nodeBaseline.ax +
          live.ay_mg * nodeBaseline.ay +
          live.az_mg * nodeBaseline.az;
        const normCurr = Math.sqrt(
          live.ax_mg ** 2 + live.ay_mg ** 2 + live.az_mg ** 2,
        );
        const normBase = Math.sqrt(
          nodeBaseline.ax ** 2 + nodeBaseline.ay ** 2 + nodeBaseline.az ** 2,
        );
        if (normCurr > 0 && normBase > 0) {
          const cosTheta = Math.max(
            -1.0,
            Math.min(1.0, dot / (normCurr * normBase)),
          );
          tiltDeg =
            Math.round(((Math.acos(cosTheta) * 180) / Math.PI) * 10) / 10;
          if (tiltDeg >= 15.0) {
            severity = "danger";
          } else if (tiltDeg >= 5.0) {
            severity = "caution";
          }
        }
      } else {
        // 基準未設定時は水平面に対する仮傾斜
        const horizontalAcc = Math.sqrt(live.ax_mg ** 2 + live.ay_mg ** 2);
        tiltDeg =
          Math.round(
            ((Math.atan2(horizontalAcc, Math.max(Math.abs(live.az_mg), 1)) *
              180) /
              Math.PI) *
              10,
          ) / 10;
      }

      const batteryPct =
        live.battery_mv === null || live.battery_mv === -1
          ? null
          : Math.min(
              Math.max(Math.round(((live.battery_mv - 2800) / 800) * 100), 0),
              100,
            );
      // 最終受信からの経過時間で通信状態を判定（60秒以上経過で受信途絶）
      const receivedEpoch = new Date(live.received_at).getTime();
      const currentEpoch = new Date(testObservations.refreshed_at).getTime();
      const isFresh =
        !isNaN(receivedEpoch) &&
        !isNaN(currentEpoch) &&
        currentEpoch - receivedEpoch < 60_000;
      const commStatus: CommunicationStatus = isFresh ? "online" : "offline";

      return {
        ...sensor,
        source: "device_test" as const,
        observationSeverity: severity,
        soilMoistureValue: soilMoisture,
        tiltValue: tiltDeg,
        batteryPercent: batteryPct,
        lastReceivedAt: live.received_at,
        communicationStatus: commStatus,
      };
    });
  }, [baselines, dataMode, filteredSensors, testObservations]);

  const visibleSensorIds = useMemo(
    () => new Set(activeSensors.map((sensor) => sensor.id)),
    [activeSensors],
  );

  const handleDeleteSensorFromMap = useCallback(
    async (sensorId: string) => {
      const targetSensor = activeSensors.find((s) => s.id === sensorId);
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
        if (res.ok || res.status === 204) {
          setRegisteredSensors((prev) => prev.filter((s) => s.id !== sensorId));
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
    if (newAlerts.length === 0) {
      return;
    }
    const timeoutId = window.setTimeout(dismissNewAlerts, 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [dismissNewAlerts, newAlerts.length]);
  // 実機センサーまたは手動トリガーからの緊急警報検出 (Issue #16)
  const activeEmergencyAlert = useMemo(() => {
    if (manualEmergencyAlert) return manualEmergencyAlert;
    const tilted = activeSensors.find(
      (s) => s.tiltValue !== null && s.tiltValue >= 15.0,
    );
    if (tilted) {
      return {
        sensorId: tilted.id,
        sensorName: tilted.name,
        sensorCode: tilted.sensorCode,
        tiltDeg: tilted.tiltValue ?? 15.0,
        reason: "大きな姿勢変化（倒木・地滑りの危険）",
      };
    }
    return null;
  }, [manualEmergencyAlert, activeSensors]);

  useEffect(() => {
    if (activeEmergencyAlert) {
      startPcAlarm();
    } else {
      stopPcAlarm();
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
        onToggle={() => setSidebarOpen((v) => !v)}
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
                className={styles.pcEmergencyFocusBtn}
                onClick={() => focusSensor(activeEmergencyAlert.sensorId)}
              >
                🎯 対象地点を表示
              </button>
              <button
                type="button"
                className={styles.pcEmergencyDismissBtn}
                onClick={() => {
                  setManualEmergencyAlert(null);
                  stopPcAlarm();
                }}
              >
                警報を確認して解除
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
            <Link className={styles.mobileWarningLink} href="/mobile">
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
              {mountainsList.map((m) => (
                <button
                  aria-pressed={m.id === selectedMountainId}
                  className={`${styles.engineBtn} ${m.id === selectedMountainId ? styles.activeEngine : ""}`}
                  key={m.id}
                  onClick={() => setSelectedMountainId(m.id)}
                  type="button"
                >
                  {m.name}
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
              onToggleOpen={() => setLayerPanelOpen((v) => !v)}
            />

            <button
              aria-label={
                isWarningPanelOpen ? "警告パネルを閉じる" : "警告パネルを開く"
              }
              className={`${styles.warningToggleBtn} ${snapshot.alerts.length > 0 ? styles.hasAlerts : ""}`}
              onClick={() => setIsWarningPanelOpen((v) => !v)}
              type="button"
            >
              <Icon name="alert" />
              <span>警告一覧 ({snapshot.alerts.length})</span>
            </button>
          </div>
        </div>

        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <div>
              <h1>センサー監視</h1>
              {dataMode === "test" ? (
                isLiveTestMode ? (
                  <span className={styles.liveBadge}>実機受信中 (TEST)</span>
                ) : (
                  <span className={styles.waitingBadge}>実機待機中 (TEST)</span>
                )
              ) : (
                <span className={styles.demoBadge}>デモ</span>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            <p className={styles.updatedAt}>
              <span>最終更新</span>
              <time dateTime={snapshot.refreshedAt}>
                {formatJapanDateTime(snapshot.refreshedAt)}
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

        <section className={styles.summaryBar} aria-label="監視状態の集計">
          <div className={styles.summaryCards}>
            {SUMMARY_ORDER.map((severity) => (
              <KpiTile
                label={OBSERVATION_LABELS[severity]}
                value={severityCounts[severity]}
                suffix="台"
                tone={severity}
                key={severity}
              />
            ))}
          </div>
        </section>

        <section className={styles.mapSection}>
          <div className={styles.mapFrame}>
            {mapViewEngine === "offline_svg" ? (
              <OfflineMountainMap
                layerStates={layerStates}
                mapImageUrl={currentMountain.mapImageUrl}
                mountainName={`${currentMountain.name} ${currentMountain.areaName}`}
                overlayPaths={DEMO_OVERLAY_PATHS}
                overlayPoints={DEMO_OVERLAY_POINTS}
                selectedSensorId={selectedSensorId}
                sensors={activeSensors}
                onSelectSensor={(sensor) => setSelectedModalSensor(sensor)}
              />
            ) : (
              <SatelliteMap
                focusRequest={focusRequest}
                resetViewRequest={resetViewRequest}
                selectedSensorId={selectedSensorId}
                sensors={snapshot.sensors}
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
                {filteredSensors.length < snapshot.sensors.length
                  ? ` / ${snapshot.sensors.length - filteredSensors.length}台を非表示`
                  : null}
              </span>
              <Button
                className={styles.resetMapButton}
                variant="secondary"
                onClick={() => setResetViewRequest((current) => current + 1)}
              >
                全域表示
              </Button>
            </div>
          </footer>
        </section>
      </section>

      {isWarningPanelOpen && (
        <WarningPanel
          alerts={snapshot.alerts}
          onFocusSensor={focusSensor}
          onTriggerTestAlert={() => {
            const target = activeSensors[0];
            setManualEmergencyAlert({
              sensorId: target?.id ?? "DEMO-001",
              sensorName: target?.name ?? "樹木ノード T1（タニ装着）",
              sensorCode: target?.sensorCode ?? "T1",
              tiltDeg: 24.5,
              reason: "大きな姿勢変化検知（実演ピッチ用）",
            });
          }}
          refreshedAt={snapshot.refreshedAt}
          selectedSensorId={selectedSensorId}
        />
      )}

      {/* マーカークリック時のハイブリッド詳細推移モーダル */}
      <SensorDetailModal
        isCalibrated={Boolean(
          selectedModalSensor && baselines[selectedModalSensor.sensorCode],
        )}
        onClose={() => setSelectedModalSensor(null)}
        onDeleteSensor={handleDeleteSensorFromMap}
        onResetBaseline={resetNodeBaseline}
        sensor={selectedModalSensor}
      />

      {newAlerts.length > 0 ? (
        <div className={styles.toast} role="status">
          <Icon name="alert" />
          <div>
            <strong>新しいデモ警告</strong>
            <span>{newAlerts.length}件の警告を受信しました</span>
          </div>
          <button
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddMountainOpen(false);
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
                  onChange={(e) => setNewMountainName(e.target.value)}
                />
              </label>
              <label className={styles.formField}>
                <span>工区名・林班</span>
                <input
                  placeholder="例: 本谷・一ノ谷工区"
                  required
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                />
              </label>
              <label className={styles.formField}>
                <span>下絵地図画像パス</span>
                <input
                  placeholder="/maps/gozaisyo_toukousen.png"
                  value={newMapImageUrl}
                  onChange={(e) => setNewMapImageUrl(e.target.value)}
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsQrModalOpen(false);
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
                スマホの標準カメラをかざすだけで、専用の現場警報・GPS登録画面が直接開きます。
              </p>

              <div className={styles.qrContainer}>
                <QrCode size={220} value={mobileUrl} />
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
                    onChange={(e) => setCustomIp(e.target.value)}
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
