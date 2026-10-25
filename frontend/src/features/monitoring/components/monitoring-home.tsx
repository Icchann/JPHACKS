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
  DemoSensor,
  LayerVisibility,
  MapLayerId,
  MapPresetMode,
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
  const [selectedMountainId, setSelectedMountainId] = useState("shirakami-03");
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
      DEMO_MOUNTAINS.find((m) => m.id === selectedMountainId) ??
      DEMO_MOUNTAINS[0],
    [selectedMountainId],
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

      let severity: ObservationSeverity = "normal";
      if ((soilMoisture !== null && soilMoisture >= 0.75) || tiltDeg >= 2.0) {
        severity = "danger";
      } else if (
        (soilMoisture !== null && soilMoisture >= 0.6) ||
        tiltDeg >= 1.0
      ) {
        severity = "caution";
      }

      return {
        ...sensor,
        source: "device_test" as const,
        observationSeverity: severity,
        soilMoistureValue: soilMoisture,
        tiltValue: tiltDeg,
        batteryPercent: batteryPct,
        lastReceivedAt: live.received_at,
        communicationStatus: "online" as const,
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
              {DEMO_MOUNTAINS.map((m) => (
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
            </div>

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
            <p>
              {currentMountain.name} / {currentMountain.areaName}
            </p>
            <div>
              <h1>センサー監視</h1>
              {isLiveTestMode ? (
                <span className={styles.liveBadge}>実機受信中 (TEST)</span>
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
                mountainName={`${currentMountain.name} ${currentMountain.areaName}`}
                onSelectSensor={(sensor) => setSelectedModalSensor(sensor)}
                overlayPaths={DEMO_OVERLAY_PATHS}
                overlayPoints={DEMO_OVERLAY_POINTS}
                selectedSensorId={selectedSensorId}
                sensors={activeSensors}
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
    </main>
  );
}
