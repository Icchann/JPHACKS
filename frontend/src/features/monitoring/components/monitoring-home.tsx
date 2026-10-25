"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

  const mobileUrl = useMemo(() => {
    if (typeof window === "undefined") return "http://172.20.10.2:3000/mobile";
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const targetHost =
      hostname === "localhost" || hostname === "127.0.0.1"
        ? "172.20.10.2"
        : hostname;
    return `${window.location.protocol}//${targetHost}${port}/mobile`;
  }, []);

  const copyMobileUrl = () => {
    void navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      const soilMoisture =
        live.soil_raw === null || live.soil_raw === -1
          ? null
          : Math.min(Math.max(live.soil_raw / 2000, 0), 1.0);
      const horizontalAcc = Math.sqrt(live.ax_mg ** 2 + live.ay_mg ** 2);
      const tiltDeg =
        Math.round(
          ((Math.atan2(horizontalAcc, Math.max(Math.abs(live.az_mg), 1)) *
            180) /
            Math.PI) *
            100,
        ) / 100;
      const batteryPct =
        live.battery_mv === null || live.battery_mv === -1
          ? null
          : Math.min(
              Math.max(Math.round(((live.battery_mv - 2800) / 800) * 100), 0),
              100,
            );

      // 実測値は校正値・基準姿勢が未確定のため、危険判定を下さず未判定（normal）とする
      const severity: ObservationSeverity = "normal";

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
  }, [dataMode, filteredSensors, testObservations]);

  const visibleSensorIds = useMemo(
    () => new Set(activeSensors.map((sensor) => sensor.id)),
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
          refreshedAt={snapshot.refreshedAt}
          selectedSensorId={selectedSensorId}
          onFocusSensor={focusSensor}
        />
      )}

      {/* マーカークリック時のハイブリッド詳細推移モーダル */}
      <SensorDetailModal
        onClose={() => setSelectedModalSensor(null)}
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
