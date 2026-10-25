import React, { useId, useMemo, useState } from "react";

import type {
  DemoSensor,
  LayerVisibility,
  MapLayerId,
  OverlayPath,
  OverlayPoint,
} from "../types";
import styles from "./offline-mountain-map.module.css";

type OfflineMountainMapProps = {
  sensors: DemoSensor[];
  selectedSensorId?: string | null;
  onSelectSensor: (sensor: DemoSensor) => void;
  overlayPoints?: OverlayPoint[];
  overlayPaths?: OverlayPath[];
  layerStates: Record<MapLayerId, LayerVisibility>;
  mountainName?: string;
  className?: string;
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 680;
const PADDING = 80;

// 林業現場の森林基本図・等高線地形図に即した、完全オフライン山林マップ
export function OfflineMountainMap({
  sensors,
  selectedSensorId,
  onSelectSensor,
  overlayPoints = [],
  overlayPaths = [],
  layerStates,
  mountainName = "白神山地 第3工区",
  className,
}: OfflineMountainMapProps) {
  const [hoveredSensor, setHoveredSensor] = useState<DemoSensor | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // 地図のドラッグ＆ドロップによる自由なスクロール（パン移動）
  const handleMouseDown = (e: React.MouseEvent) => {
    // センサーピンクリック時はドラッグ移動を開始しない
    if ((e.target as HTMLElement).closest(`.${styles.sensorMarkerGroup}`)) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // マウスホイールやトラックパッドによるスクロール・パン移動
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoomLevel((prev) => Math.min(Math.max(prev * zoomFactor, 0.7), 2.5));
    } else {
      setPanOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // タッチ操作（タブレット・スマホ・タッチ対応PC）でのスクロール対応
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1 || !e.touches[0]) return;
    setPanOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };
  const uniqueId = useId();

  // 全センサーとオーバーレイから緯度経度のバウンディングボックスを算出
  const bounds = useMemo(() => {
    const allLats = [
      ...sensors.map((s) => s.latitude),
      ...overlayPoints.map((p) => p.latitude),
      ...overlayPaths.flatMap((p) => p.coordinates.map((c) => c.latitude)),
    ];
    const allLons = [
      ...sensors.map((s) => s.longitude),
      ...overlayPoints.map((p) => p.longitude),
      ...overlayPaths.flatMap((p) => p.coordinates.map((c) => c.longitude)),
    ];

    if (allLats.length === 0 || allLons.length === 0) {
      return { minLat: 34.99, maxLat: 35.01, minLon: 136.99, maxLon: 137.02 };
    }

    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);

    // 外周に18%のマージンを設けて端が見切れないようにする
    const latSpan = Math.max(maxLat - minLat, 0.002);
    const lonSpan = Math.max(maxLon - minLon, 0.002);
    const latMargin = latSpan * 0.18;
    const lonMargin = lonSpan * 0.18;

    return {
      minLat: minLat - latMargin,
      maxLat: maxLat + latMargin,
      minLon: minLon - lonMargin,
      maxLon: maxLon + lonMargin,
    };
  }, [sensors, overlayPoints, overlayPaths]);

  // 緯度経度をSVG直交座標へ正規化変換（北が上＝緯度大がY小）
  const project = useMemo(() => {
    const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
    const lonRange = Math.max(bounds.maxLon - bounds.minLon, 0.0001);

    return (lat: number, lon: number) => {
      const x =
        PADDING +
        ((lon - bounds.minLon) / lonRange) * (SVG_WIDTH - PADDING * 2);
      const y =
        SVG_HEIGHT -
        PADDING -
        ((lat - bounds.minLat) / latRange) * (SVG_HEIGHT - PADDING * 2);
      return { x, y };
    };
  }, [bounds]);

  // レイヤー別の不透明度取得
  const getLayerOpacity = (layerId: MapLayerId): number => {
    const state = layerStates[layerId] ?? "visible";
    if (state === "hidden") return 0;
    if (state === "faded") return 0.25;
    return 1;
  };

  return (
    <div className={`${styles.mapWrapper} ${className ?? ""}`.trim()}>
      <header className={styles.mapToolbar}>
        <div className={styles.mapTitleBlock}>
          <span className={styles.areaIndicator}>🌲 森林基本図</span>
          <strong className={styles.mountainHeading}>{mountainName}</strong>
          <span className={styles.offlineNotice}>（等高線地形図）</span>
        </div>

        <div className={styles.toolbarControls}>
          <div
            aria-label="ズーム調整"
            className={styles.zoomControls}
            role="group"
          >
            <button
              data-sanmou-button="secondary"
              aria-label="拡大"
              className={styles.zoomButton}
              onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 2.0))}
              type="button"
            >
              ＋ 拡大
            </button>
            <button
              data-sanmou-button="secondary"
              aria-label="リセット"
              className={styles.zoomButton}
              onClick={resetView}
              type="button"
            >
              全体表示
            </button>
            <button
              data-sanmou-button="secondary"
              aria-label="縮小"
              className={styles.zoomButton}
              onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.8))}
              type="button"
            >
              ー 縮小
            </button>
          </div>
        </div>
      </header>

      <div
        className={`${styles.canvasContainer} ${isDragging ? styles.dragging : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          aria-label={`${mountainName}の山林観測地図`}
          className={styles.svgCanvas}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        >
          <defs>
            {/* 森林基本図の用紙テクスチャ */}
            <pattern
              height="20"
              id={`topo-grid-${uniqueId}`}
              patternUnits="userSpaceOnUse"
              width="20"
            >
              <rect fill="#fbf9f4" height="20" width="20" />
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#eee9dc"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          {/* 森林用紙ベース */}
          <rect
            fill={`url(#topo-grid-${uniqueId})`}
            height={SVG_HEIGHT}
            width={SVG_WIDTH}
          />

          {/* 森林区画ポリゴン（スギ・ヒノキ針葉樹林帯、天然生広葉樹林帯） */}
          <g className={styles.forestZones} opacity={0.85}>
            {/* スギ林区画 */}
            <polygon
              className={styles.coniferZone}
              points="140,160 380,120 540,240 420,440 220,400 130,280"
            />
            {/* ヒノキ林区画 */}
            <polygon
              className={styles.coniferZone}
              points="520,220 780,180 880,340 760,510 580,430 480,310"
            />
            {/* 広葉樹・保安林区画 */}
            <polygon
              className={styles.broadleafZone}
              points="200,420 460,450 680,560 480,640 260,610 160,520"
            />
          </g>

          {/* 水系（沢・谷筋）: 北沢本流・支流 */}
          <g className={styles.waterStreams}>
            {/* 本流 */}
            <path
              className={styles.streamMain}
              d="M 80,80 Q 240,180 380,290 T 560,450 T 820,620"
            />
            {/* 支流 */}
            <path
              className={styles.streamBranch}
              d="M 460,110 Q 420,200 380,290"
            />
            <text className={styles.streamText} x="270" y="210">
              北沢 本流
            </text>
          </g>

          {/* 森林基本図の等高線（主曲線 10m / 計曲線 50m） */}
          <g className={styles.contourLines}>
            {/* 計曲線（50m毎） */}
            <ellipse
              cx="520"
              cy="310"
              fill="none"
              rx="100"
              ry="55"
              className={styles.indexContour}
            />
            <text className={styles.contourLabel} x="610" y="314">
              550m
            </text>

            <ellipse
              cx="510"
              cy="320"
              fill="none"
              rx="200"
              ry="115"
              className={styles.indexContour}
            />
            <text className={styles.contourLabel} x="700" y="324">
              500m
            </text>

            <ellipse
              cx="490"
              cy="330"
              fill="none"
              rx="310"
              ry="175"
              className={styles.indexContour}
            />
            <text className={styles.contourLabel} x="790" y="334">
              450m
            </text>

            <ellipse
              cx="470"
              cy="340"
              fill="none"
              rx="410"
              ry="235"
              className={styles.indexContour}
            />
            <text className={styles.contourLabel} x="870" y="344">
              400m
            </text>

            {/* 主曲線（10m毎の中間線） */}
            <ellipse
              cx="515"
              cy="315"
              fill="none"
              rx="150"
              ry="85"
              className={styles.intermediateContour}
            />
            <ellipse
              cx="500"
              cy="325"
              fill="none"
              rx="255"
              ry="145"
              className={styles.intermediateContour}
            />
            <ellipse
              cx="480"
              cy="335"
              fill="none"
              rx="360"
              ry="205"
              className={styles.intermediateContour}
            />
          </g>

          {/* 現場オーバーレイ線（林道、作業道、私有林境界線） */}
          {overlayPaths.map((path) => {
            const opacity = getLayerOpacity(path.layerId);
            if (opacity === 0) return null;

            const pointsString = path.coordinates
              .map((c) => {
                const pt = project(c.latitude, c.longitude);
                return `${pt.x},${pt.y}`;
              })
              .join(" ");

            const isBoundary = path.subType === "private_border";
            const isRoad = path.subType === "work_road";

            return (
              <g key={path.id} className={styles.pathGroup} opacity={opacity}>
                <polyline
                  className={
                    isBoundary
                      ? styles.boundaryLine
                      : isRoad
                        ? styles.roadLine
                        : styles.trailLine
                  }
                  fill="none"
                  points={pointsString}
                />
                {path.coordinates[0] && (
                  <text
                    className={styles.pathNameText}
                    x={
                      project(
                        path.coordinates[0].latitude,
                        path.coordinates[0].longitude,
                      ).x + 6
                    }
                    y={
                      project(
                        path.coordinates[0].latitude,
                        path.coordinates[0].longitude,
                      ).y - 6
                    }
                  >
                    {path.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* 現場オーバーレイ点（休憩詰所、湧水、危険箇所） */}
          {overlayPoints.map((pt) => {
            const opacity = getLayerOpacity(pt.layerId);
            if (opacity === 0) return null;

            const pos = project(pt.latitude, pt.longitude);
            const isRest = pt.layerId === "rest_point";

            return (
              <g
                key={pt.id}
                className={styles.facilityPointGroup}
                opacity={opacity}
                transform={`translate(${pos.x}, ${pos.y})`}
              >
                <circle
                  className={isRest ? styles.restPointBg : styles.hazardPointBg}
                  r="13"
                />
                <text
                  className={styles.facilityIcon}
                  dominantBaseline="central"
                  textAnchor="middle"
                  y="1"
                >
                  {isRest ? (pt.subType === "hut" ? "⌂" : "💧") : "▲"}
                </text>
                <text
                  className={styles.facilityLabel}
                  textAnchor="middle"
                  y="23"
                >
                  {pt.name}
                </text>
              </g>
            );
          })}

          {/* センサーマーカー（森林測量標・杭風デザイン） */}
          {getLayerOpacity("sensor") > 0 &&
            sensors.map((sensor) => {
              const pos = project(sensor.latitude, sensor.longitude);
              const isSelected = selectedSensorId === sensor.id;
              const isDanger = sensor.observationSeverity === "danger";
              const isCaution = sensor.observationSeverity === "caution";
              const isTree = sensor.nodeType === "tree";
              const sensorOpacity = getLayerOpacity("sensor");

              return (
                <g
                  key={sensor.id}
                  className={`${styles.sensorMarkerGroup} ${isSelected ? styles.selectedMarker : ""}`}
                  opacity={sensorOpacity}
                  onClick={() => onSelectSensor(sensor)}
                  onMouseEnter={() => {
                    setHoveredSensor(sensor);
                    setHoverPosition(pos);
                  }}
                  onMouseLeave={() => setHoveredSensor(null)}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${pos.x}, ${pos.y})`}
                >
                  {/*
                    【重要】ホバーのバグ防止（無限ループ・位置ズレ防止）:
                    ヒット判定円（hitArea）は固定サイズで絶対に動かさず、
                    装飾要素すべてに pointer-events: none を適用してマウス奪い合いを防ぎます。
                  */}
                  <circle className={styles.hitArea} r="26" />

                  {/* 測量標ピンの本体円 */}
                  <circle
                    className={`${styles.markerPin} ${isTree ? styles.treePin : styles.slopePin} ${styles[sensor.observationSeverity]}`}
                    r="17"
                  />

                  {/* 樹木 🌲 vs 斜面 ⛰️ のピクトグラム */}
                  <text
                    className={styles.markerSymbol}
                    dominantBaseline="central"
                    textAnchor="middle"
                    y="0"
                  >
                    {isTree ? "🌲" : "⛰️"}
                  </text>

                  {/* センサーコード銘板（名札） */}
                  <rect
                    className={styles.codeTagRect}
                    height="16"
                    rx="3"
                    width={sensor.sensorCode.length * 8 + 10}
                    x={-(sensor.sensorCode.length * 8 + 10) / 2}
                    y="20"
                  />
                  <text
                    className={styles.codeTagText}
                    dominantBaseline="central"
                    textAnchor="middle"
                    y="28"
                  >
                    {sensor.sensorCode}
                  </text>

                  {/* 異常値の直接可視化（ホバー不要で危険値を直視） */}
                  {(isDanger || isCaution) && (
                    <g
                      className={styles.alertFlagGroup}
                      transform="translate(0, -26)"
                    >
                      <rect
                        className={
                          isDanger
                            ? styles.dangerAlertPill
                            : styles.cautionAlertPill
                        }
                        height="18"
                        rx="4"
                        width="92"
                        x="-46"
                        y="-9"
                      />
                      <text
                        className={styles.alertFlagText}
                        dominantBaseline="central"
                        textAnchor="middle"
                        y="0"
                      >
                        {isDanger ? "⚠️ " : "注意: "}
                        {sensor.soilMoistureValue !== null
                          ? `${(sensor.soilMoistureValue * 100).toFixed(0)}%`
                          : `${(sensor.tiltValue ?? 0).toFixed(1)}°`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* 地図凡例（森林計画図スタイル） */}
          <g className={styles.mapLegend} transform="translate(20, 520)">
            <rect
              className={styles.legendBox}
              height="140"
              rx="6"
              width="180"
            />
            <text className={styles.legendHeader} x="12" y="20">
              凡例（森林基本図）
            </text>
            <line
              className={styles.indexContour}
              x1="12"
              x2="36"
              y1="40"
              y2="40"
            />
            <text className={styles.legendItem} x="44" y="44">
              計曲線 (50m)
            </text>

            <line
              className={styles.intermediateContour}
              x1="12"
              x2="36"
              y1="58"
              y2="58"
            />
            <text className={styles.legendItem} x="44" y="62">
              主曲線 (10m)
            </text>

            <line
              className={styles.streamMain}
              x1="12"
              x2="36"
              y1="76"
              y2="76"
            />
            <text className={styles.legendItem} x="44" y="80">
              沢・水系
            </text>

            <line className={styles.roadLine} x1="12" x2="36" y1="94" y2="94" />
            <text className={styles.legendItem} x="44" y="98">
              林道・作業道
            </text>

            <circle cx="24" cy="116" r="6" fill="#1b4332" />
            <text className={styles.legendItem} x="44" y="120">
              🌲 樹木 / ⛰️ 斜面
            </text>
          </g>
        </svg>

        {/* マーカーホバー時の情報ポップアップ */}
        {hoveredSensor && hoverPosition && (
          <aside
            aria-label="センサー簡易情報"
            className={styles.hoverTooltip}
            style={{
              left: `calc(${(hoverPosition.x / SVG_WIDTH) * 100}% + ${panOffset.x}px)`,
              top: `calc(${(hoverPosition.y / SVG_HEIGHT) * 100}% + ${panOffset.y}px)`,
            }}
          >
            <header className={styles.tooltipHeader}>
              <span className={styles.tooltipIcon}>
                {hoveredSensor.nodeType === "tree" ? "🌲" : "⛰️"}
              </span>
              <div>
                <strong className={styles.tooltipCode}>
                  {hoveredSensor.sensorCode}: {hoveredSensor.name}
                </strong>
                <span className={styles.tooltipType}>
                  {hoveredSensor.nodeType === "tree"
                    ? "樹木ノード（立木・架線元木）"
                    : "斜面ノード（急傾斜法面）"}
                </span>
              </div>
            </header>

            <div className={styles.tooltipMetrics}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>土壌水分:</span>
                <strong className={styles.metricValue}>
                  {hoveredSensor.soilMoistureValue !== null
                    ? `${(hoveredSensor.soilMoistureValue * 100).toFixed(1)}%`
                    : "未計測"}
                </strong>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>傾斜角変位:</span>
                <strong className={styles.metricValue}>
                  {hoveredSensor.tiltValue !== null
                    ? `+${hoveredSensor.tiltValue.toFixed(2)}°`
                    : "未計測"}
                </strong>
              </div>
            </div>

            {hoveredSensor.locationNote && (
              <p className={styles.locationNote}>
                📍 {hoveredSensor.locationNote}（標高:{" "}
                {hoveredSensor.elevationMeters ?? 400}m）
              </p>
            )}

            <footer className={styles.tooltipFooter}>
              <span className={styles.clickHint}>
                クリックで詳細グラフ・推移を確認 ↗
              </span>
            </footer>
          </aside>
        )}
      </div>
    </div>
  );
}
