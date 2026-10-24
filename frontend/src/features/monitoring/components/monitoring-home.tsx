"use client";

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
import { useDemoMonitoring } from "../use-demo-monitoring";
import { Icon } from "./icon";
import { LayerController } from "./layer-controller";
import styles from "./monitoring-home.module.css";
import { OfflineMountainMap } from "./offline-mountain-map";
import { type MapFocusRequest, SatelliteMap } from "./satellite-map";
import { SensorDetailModal } from "./sensor-detail-modal";
import { WarningPanel } from "./warning-panel";
const SUMMARY_ORDER: ObservationSeverity[] = ["normal", "caution", "danger"];

export function MonitoringHome({
  initialMapEngine = "offline_svg",
}: {
  initialMapEngine?: "offline_svg" | "satellite_google";
} = {}) {
  const router = useRouter();
  const { snapshot, newAlerts, dismissNewAlerts } = useDemoMonitoring();
  const { data: testObservations } = useTestObservations();
  const isLiveTestMode = Boolean(
    testObservations && testObservations.items.length > 0,
  );
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
  const filteredSensors = useMemo(
    () => filterSensors(snapshot.sensors, query),
    [query, snapshot.sensors],
  );
  // 実機テストモード時（USBシリアル受信時）は、届いた生観測値を地図上のピンへ自動反映
  const activeSensors = useMemo(() => {
    if (!testObservations || testObservations.items.length === 0) {
      return filteredSensors;
    }

    const latestByNode: Record<string, (typeof testObservations.items)[0]> = {};
    for (const item of testObservations.items) {
      latestByNode[item.node_id] = item;
    }

    const aliases: Record<string, string> = {
      "DEMO-001": "S1",
      "DEMO-002": "S2",
      "DEMO-003": "T1",
      "DEMO-004": "T2",
    };

    return filteredSensors.map((sensor) => {
      const aliasKey = aliases[sensor.sensorCode];
      const live =
        latestByNode[sensor.sensorCode] ??
        (aliasKey ? latestByNode[aliasKey] : undefined) ??
        latestByNode[sensor.id];

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
        sensorCode: live.node_id,
        observationSeverity: severity,
        soilMoistureValue: soilMoisture,
        tiltValue: tiltDeg,
        batteryPercent: batteryPct,
        lastReceivedAt: live.received_at,
        communicationStatus: "online" as const,
      };
    });
  }, [filteredSensors, testObservations]);

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
        demoDescription="架空データを表示中"
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <section className={styles.workspace}>
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
