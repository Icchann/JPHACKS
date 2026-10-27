import React, { useCallback, useEffect, useId, useMemo, useState } from "react";

import type {
  DemoSensor,
  LayerVisibility,
  MapLayerId,
  OverlayPath,
  OverlayPoint,
} from "../types";
import styles from "./offline-mountain-map.module.css";

export type MountainBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export type MountainBoundsInput =
  | MountainBounds
  | {
      minLatitude?: number;
      maxLatitude?: number;
      minLongitude?: number;
      maxLongitude?: number;
    };

export type OfflineMapFocusRequest = {
  sensorId: string;
  token: number;
};

type OfflineMountainMapProps = {
  sensors: DemoSensor[];
  selectedSensorId?: string | null;
  onSelectSensor: (sensor: DemoSensor) => void;
  overlayPoints?: OverlayPoint[];
  overlayPaths?: OverlayPath[];
  layerStates: Record<MapLayerId, LayerVisibility>;
  mountainName?: string;
  mapImageUrl?: string | null;
  mountainBounds?: MountainBoundsInput | null;
  resetViewRequest?: number;
  focusRequest?: OfflineMapFocusRequest | null;
  className?: string;
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 680;
const PADDING = 80;

const DEFAULT_ZOOM_LEVEL = 1.0;
const MIN_BUTTON_ZOOM_LEVEL = 0.6;
const MAX_BUTTON_ZOOM_LEVEL = 2.4;
const BUTTON_ZOOM_STEP = 0.2;
// レイヤーの不透明度および背景画像の調整定数
const LAYER_OPACITY_VISIBLE = 1.0;
const LAYER_OPACITY_FADED = 0.25;
const LAYER_OPACITY_HIDDEN = 0;
const GROUND_OVERLAY_OPACITY = 0.92;
const MIN_GROUND_OVERLAY_DIMENSION = 10;
const FOREST_ZONE_OPACITY = 0.85;

// センサーピンおよび銘板・アラートバッジの描画定数
const SENSOR_HIT_AREA_RADIUS = 26;
const SENSOR_MARKER_PIN_RADIUS = 17;
const OFFLINE_BADGE_OFFSET = 13;
const OFFLINE_BADGE_RADIUS = 6.5;
const CODE_TAG_CHAR_WIDTH = 8;
const CODE_TAG_HORIZONTAL_PADDING = 10;
const CODE_TAG_HEIGHT = 16;
const CODE_TAG_BORDER_RADIUS = 3;
const CODE_TAG_OFFSET_Y = 20;
const CODE_TAG_TEXT_OFFSET_Y = 28;
const ALERT_PILL_OFFSET_Y = -26;
const ALERT_PILL_WIDTH = 92;
const ALERT_PILL_HEIGHT = 18;
const ALERT_PILL_BORDER_RADIUS = 4;
const DANGER_TILT_DISPLAY_THRESHOLD = 5.0;
const PERCENTAGE_MULTIPLIER = 100;
const DEFAULT_ELEVATION_METERS = 400;
const FACILITY_POINT_RADIUS = 13;
const FACILITY_LABEL_OFFSET_Y = 23;
const PATH_LABEL_OFFSET = 6;
const MIN_COORDINATE_SPAN = 0.0001;

// センサー配列の増減で地図が伸縮しないよう、工区の基準バウンディングボックスを固定定義する（案C: Issue #33）
const DEFAULT_MOUNTAIN_BOUNDS: MountainBounds = {
  minLat: 34.985,
  maxLat: 35.022,
  minLon: 136.982,
  maxLon: 137.032,
};

// 工区外・現地仮設スロット領域のレイアウト定数
const OFF_SITE_BAR_X = 24;
const OFF_SITE_BAR_WIDTH = SVG_WIDTH - 48;
const OFF_SITE_BAR_HEIGHT = 82;
const OFF_SITE_BAR_Y = SVG_HEIGHT - 92;
const OFF_SITE_BAR_BORDER_RADIUS = 8;
const OFF_SITE_CONTENT_PADDING = 48;

// 林業現場の森林基本図・等高線地形図に即した、完全オフライン山林マップ
export function OfflineMountainMap({
  sensors,
  selectedSensorId,
  onSelectSensor,
  overlayPoints = [],
  overlayPaths = [],
  layerStates,
  mountainName = "白神山地 第3工区",
  mapImageUrl,
  mountainBounds,
  // resetViewRequest = 0,
  // focusRequest = null,
  className,
}: OfflineMountainMapProps) {
  const [hoveredSensor, setHoveredSensor] = useState<DemoSensor | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Windows等で地図エリアを画面いっぱいに広げる全体表示（拡大）ステート (Issue #12)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // PC操作に不慣れな作業員でも確実に地図を拡大縮小・移動できるよう、ボタンズームおよびドラッグパン状態を管理する
  const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_ZOOM_LEVEL);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const resetView = useCallback(() => {
    setZoomLevel(DEFAULT_ZOOM_LEVEL);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);
  // 地図のドラッグ＆ドロップによる自由な移動（ピンクリック時はドラッグを開始しない）
  const handleMouseDown = (mouseEvent: React.MouseEvent) => {
    if (
      (mouseEvent.target as HTMLElement).closest(`.${styles.sensorMarkerGroup}`)
    ) {
      return;
    }
    setIsDragging(true);
    setDragStart({
      x: mouseEvent.clientX - panOffset.x,
      y: mouseEvent.clientY - panOffset.y,
    });
  };

  const handleMouseMove = (mouseEvent: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: mouseEvent.clientX - dragStart.x,
      y: mouseEvent.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (touchEvent: React.TouchEvent) => {
    const primaryTouch = touchEvent.touches[0];
    if (touchEvent.touches.length === 1 && primaryTouch) {
      setIsDragging(true);
      setDragStart({
        x: primaryTouch.clientX - panOffset.x,
        y: primaryTouch.clientY - panOffset.y,
      });
    }
  };

  const handleTouchMove = (touchEvent: React.TouchEvent) => {
    const primaryTouch = touchEvent.touches[0];
    if (!isDragging || touchEvent.touches.length !== 1 || !primaryTouch) return;
    setPanOffset({
      x: primaryTouch.clientX - dragStart.x,
      y: primaryTouch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };
  const uniqueId = useId();

  // 検索フィルタや遠方機体の追加で背景図や既存ピンが1ピクセルもズレないよう、
  // センサー配列に依存しない工区固定のバウンディングボックスを算出する（案C: Issue #33）
  const fixedBounds = useMemo<MountainBounds>(() => {
    if (mountainBounds) {
      const candidateMinLat =
        "minLat" in mountainBounds
          ? mountainBounds.minLat
          : mountainBounds.minLatitude;
      const candidateMaxLat =
        "maxLat" in mountainBounds
          ? mountainBounds.maxLat
          : mountainBounds.maxLatitude;
      const candidateMinLon =
        "minLon" in mountainBounds
          ? mountainBounds.minLon
          : mountainBounds.minLongitude;
      const candidateMaxLon =
        "maxLon" in mountainBounds
          ? mountainBounds.maxLon
          : mountainBounds.maxLongitude;

      if (
        candidateMinLat !== undefined &&
        candidateMaxLat !== undefined &&
        candidateMinLon !== undefined &&
        candidateMaxLon !== undefined &&
        candidateMaxLat > candidateMinLat &&
        candidateMaxLon > candidateMinLon
      ) {
        return {
          minLat: candidateMinLat,
          maxLat: candidateMaxLat,
          minLon: candidateMinLon,
          maxLon: candidateMaxLon,
        };
      }
    }
    return DEFAULT_MOUNTAIN_BOUNDS;
  }, [mountainBounds]);

  // 緯度経度をSVG直交座標へ正規化変換（北が上＝緯度大がY小）
  const project = useMemo(() => {
    const latitudeSpan = Math.max(
      fixedBounds.maxLat - fixedBounds.minLat,
      MIN_COORDINATE_SPAN,
    );
    const longitudeSpan = Math.max(
      fixedBounds.maxLon - fixedBounds.minLon,
      MIN_COORDINATE_SPAN,
    );

    return (latitude: number, longitude: number) => {
      const projectedX =
        PADDING +
        ((longitude - fixedBounds.minLon) / longitudeSpan) *
          (SVG_WIDTH - PADDING * 2);
      const projectedY =
        SVG_HEIGHT -
        PADDING -
        ((latitude - fixedBounds.minLat) / latitudeSpan) *
          (SVG_HEIGHT - PADDING * 2);
      return { x: projectedX, y: projectedY };
    };
  }, [fixedBounds]);

  // 各センサーが固定工区BBox内に収まっているか判定し、工区外の機体は下部の仮設スロットへ整列配置する
  const positionedSensors = useMemo(() => {
    const offSiteSensorsList = sensors.filter(
      (sensor) =>
        !(
          sensor.latitude >= fixedBounds.minLat &&
          sensor.latitude <= fixedBounds.maxLat &&
          sensor.longitude >= fixedBounds.minLon &&
          sensor.longitude <= fixedBounds.maxLon
        ),
    );
    const offSiteCount = offSiteSensorsList.length;

    // スロット内で利用可能な横幅（パディング分を除く）
    const availableWidth = OFF_SITE_BAR_WIDTH - OFF_SITE_CONTENT_PADDING * 2;
    // 台数に応じたステップ幅（最大130px、台数が多い場合は枠内に均等縮小）
    const stepX =
      offSiteCount > 1 ? Math.min(130, availableWidth / (offSiteCount - 1)) : 0;
    const totalSpan = (offSiteCount - 1) * stepX;
    // 中央揃えで配置開始Xを計算
    const startX =
      OFF_SITE_BAR_X +
      OFF_SITE_CONTENT_PADDING +
      (availableWidth - totalSpan) / 2;

    const offSitePositions = new Map<string, { x: number; y: number }>();
    offSiteSensorsList.forEach((sensor, index) => {
      // 台数が多くステップが狭い場合は上下2段にジグザグ配置してアラートピル・タグの衝突を防止
      const isDense = stepX > 0 && stepX < 110;
      const yOffset = isDense ? (index % 2 === 0 ? -10 : 12) : 0;
      const x = offSiteCount === 1 ? SVG_WIDTH / 2 : startX + index * stepX;
      const y = OFF_SITE_BAR_Y + 50 + yOffset;
      offSitePositions.set(sensor.id, { x, y });
    });

    return sensors.map((sensor) => {
      const offSitePos = offSitePositions.get(sensor.id);
      if (!offSitePos) {
        return {
          sensor,
          position: project(sensor.latitude, sensor.longitude),
          isOffSite: false,
        };
      }

      return {
        sensor,
        position: offSitePos,
        isOffSite: true,
      };
    });
  }, [sensors, fixedBounds, project]);

  const hasOffSiteSensors = useMemo(
    () => positionedSensors.some((item) => item.isOffSite),
    [positionedSensors],
  );

  /*
   * 将来のスタンドアロンアプリ化（DEC-13）時に使用する外部リセット・フォーカス連動（GEMINI.md Rule 11 に基づきコメントアウトで保持）
   * useEffect(() => {
   *   if (resetViewRequest === 0 || resetViewRequest === handledResetViewRequestRef.current) return;
   *   handledResetViewRequestRef.current = resetViewRequest;
   *   resetView();
   * }, [resetViewRequest, resetView]);
   */
  // レイヤー別の不透明度取得
  const getLayerOpacity = (layerId: MapLayerId): number => {
    const visibilityState = layerStates[layerId] ?? "visible";
    if (visibilityState === "hidden") return LAYER_OPACITY_HIDDEN;
    if (visibilityState === "faded") return LAYER_OPACITY_FADED;
    return LAYER_OPACITY_VISIBLE;
  };

  return (
    <div
      className={`${styles.mapWrapper} ${className ?? ""} ${isExpanded ? styles.expandedFullscreen : ""}`.trim()}
    >
      <header className={styles.mapToolbar}>
        <div className={styles.mapTitleBlock}>
          <span className={styles.areaIndicator}>🌲 森林基本図</span>
          <strong className={styles.mountainHeading}>{mountainName}</strong>
          <span className={styles.offlineNotice}>（等高線地形図）</span>
        </div>

        <div className={styles.toolbarControls}>
          {isExpanded ? (
            <button
              aria-label="地図の拡大表示を閉じる"
              className={styles.closeFullscreenBtn}
              onClick={() => setIsExpanded(false)}
              title="通常表示に戻る (Esc)"
              type="button"
            >
              ✕ 地図の拡大表示を閉じる (Esc)
            </button>
          ) : (
            <button
              aria-label="全体表示"
              className={styles.expandButton}
              onClick={() => {
                setIsExpanded(true);
              }}
              title="地図を画面いっぱいに広げて大きく表示"
              type="button"
            >
              ⛶ 全体表示（大きく表示）
            </button>
          )}
          {/* PC操作に不慣れな現場作業員でも迷わず操作できるよう、常にツールバーに拡大・縮小・リセットボタンを表示する */}
          <div
            aria-label="ズーム調整"
            className={styles.zoomControls}
            role="group"
          >
            <button
              data-sanmou-button="secondary"
              aria-label="拡大"
              className={styles.zoomButton}
              onClick={() =>
                setZoomLevel((previousZoom) =>
                  Math.min(
                    previousZoom + BUTTON_ZOOM_STEP,
                    MAX_BUTTON_ZOOM_LEVEL,
                  ),
                )
              }
              type="button"
            >
              ＋ 拡大
            </button>
            <button
              data-sanmou-button="secondary"
              aria-label="位置リセット"
              className={styles.zoomButton}
              onClick={resetView}
              title="位置と倍率を初期状態に戻す"
              type="button"
            >
              ⟲ 位置リセット
            </button>
            <button
              data-sanmou-button="secondary"
              aria-label="縮小"
              className={styles.zoomButton}
              onClick={() =>
                setZoomLevel((previousZoom) =>
                  Math.max(
                    previousZoom - BUTTON_ZOOM_STEP,
                    MIN_BUTTON_ZOOM_LEVEL,
                  ),
                )
              }
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          aria-label={`${mountainName}の山林観測地図`}
          className={styles.svgCanvas}
          preserveAspectRatio="xMidYMid meet"
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

          {/* 世の中のGIS標準: 実物の等高線図・航空写真の画像グラウンド・オーバーレイ */}
          {mapImageUrl && (
            <image
              className={styles.groundOverlayImage}
              height={Math.max(
                project(fixedBounds.minLat, fixedBounds.maxLon).y -
                  project(fixedBounds.maxLat, fixedBounds.minLon).y,
                MIN_GROUND_OVERLAY_DIMENSION,
              )}
              href={mapImageUrl}
              opacity={GROUND_OVERLAY_OPACITY}
              preserveAspectRatio="none"
              width={Math.max(
                project(fixedBounds.minLat, fixedBounds.maxLon).x -
                  project(fixedBounds.maxLat, fixedBounds.minLon).x,
                MIN_GROUND_OVERLAY_DIMENSION,
              )}
              x={project(fixedBounds.maxLat, fixedBounds.minLon).x}
              y={project(fixedBounds.maxLat, fixedBounds.minLon).y}
            />
          )}

          {/* 森林区画ポリゴン（スギ・ヒノキ針葉樹林帯、天然生広葉樹林帯） */}
          <g className={styles.forestZones} opacity={FOREST_ZONE_OPACITY}>
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
          {overlayPaths.map((overlayPath) => {
            const opacity = getLayerOpacity(overlayPath.layerId);
            if (opacity === LAYER_OPACITY_HIDDEN) return null;

            // 工区外の線（すべての座標が fixedBounds から外れている）は描画しない
            const hasInBoundCoordinate = overlayPath.coordinates.some(
              (coordinate) =>
                coordinate.latitude >= fixedBounds.minLat &&
                coordinate.latitude <= fixedBounds.maxLat &&
                coordinate.longitude >= fixedBounds.minLon &&
                coordinate.longitude <= fixedBounds.maxLon,
            );
            if (!hasInBoundCoordinate) return null;
            const pointsString = overlayPath.coordinates
              .map((coordinate) => {
                const projectedPoint = project(
                  coordinate.latitude,
                  coordinate.longitude,
                );
                return `${projectedPoint.x},${projectedPoint.y}`;
              })
              .join(" ");

            const isBoundary = overlayPath.subType === "private_border";
            const isRoad = overlayPath.subType === "work_road";
            const firstCoordinate = overlayPath.coordinates[0];

            return (
              <g
                key={overlayPath.id}
                className={styles.pathGroup}
                opacity={opacity}
              >
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
                {firstCoordinate && (
                  <text
                    className={styles.pathNameText}
                    x={
                      project(
                        firstCoordinate.latitude,
                        firstCoordinate.longitude,
                      ).x + PATH_LABEL_OFFSET
                    }
                    y={
                      project(
                        firstCoordinate.latitude,
                        firstCoordinate.longitude,
                      ).y - PATH_LABEL_OFFSET
                    }
                  >
                    {overlayPath.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* 現場オーバーレイ点（休憩詰所、湧水、危険箇所） */}
          {overlayPoints.map((overlayPoint) => {
            const opacity = getLayerOpacity(overlayPoint.layerId);
            if (opacity === LAYER_OPACITY_HIDDEN) return null;

            // 工区外の点は描画しない
            const isInBounds =
              overlayPoint.latitude >= fixedBounds.minLat &&
              overlayPoint.latitude <= fixedBounds.maxLat &&
              overlayPoint.longitude >= fixedBounds.minLon &&
              overlayPoint.longitude <= fixedBounds.maxLon;
            if (!isInBounds) return null;
            const projectedPosition = project(
              overlayPoint.latitude,
              overlayPoint.longitude,
            );
            const isRestPoint = overlayPoint.layerId === "rest_point";

            return (
              <g
                key={overlayPoint.id}
                className={styles.facilityPointGroup}
                opacity={opacity}
                transform={`translate(${projectedPosition.x}, ${projectedPosition.y})`}
              >
                <circle
                  className={
                    isRestPoint ? styles.restPointBg : styles.hazardPointBg
                  }
                  r={FACILITY_POINT_RADIUS}
                />
                <text
                  className={styles.facilityIcon}
                  dominantBaseline="central"
                  textAnchor="middle"
                  y="1"
                >
                  {isRestPoint
                    ? overlayPoint.subType === "hut"
                      ? "⌂"
                      : "💧"
                    : "▲"}
                </text>
                <text
                  className={styles.facilityLabel}
                  textAnchor="middle"
                  y={FACILITY_LABEL_OFFSET_Y}
                >
                  {overlayPoint.name}
                </text>
              </g>
            );
          })}

          {/* 工区外（遠方・現地仮設）センサーが存在する場合の専用スロット枠（案C: Issue #33） */}
          {getLayerOpacity("sensor") > LAYER_OPACITY_HIDDEN &&
            hasOffSiteSensors && (
              <g className={styles.offSiteSlotContainer}>
                <rect
                  className={styles.offSiteSlotRect}
                  height={OFF_SITE_BAR_HEIGHT}
                  rx={OFF_SITE_BAR_BORDER_RADIUS}
                  width={OFF_SITE_BAR_WIDTH}
                  x={OFF_SITE_BAR_X}
                  y={OFF_SITE_BAR_Y}
                />
                <text
                  className={styles.offSiteSlotTitle}
                  x={OFF_SITE_BAR_X + 16}
                  y={OFF_SITE_BAR_Y + 18}
                >
                  📍 工区外・現地仮設スロット（参考配置）
                  <tspan className={styles.offSiteSlotCount}>
                    {` (${positionedSensors.filter((s) => s.isOffSite).length}台)`}
                  </tspan>
                </text>
              </g>
            )}

          {/* センサーマーカー（森林測量標・杭風デザイン） */}
          {getLayerOpacity("sensor") > LAYER_OPACITY_HIDDEN &&
            positionedSensors.map(({ sensor, position }) => {
              const isSelected = selectedSensorId === sensor.id;
              const isDanger = sensor.observationSeverity === "danger";
              const isCaution = sensor.observationSeverity === "caution";
              const isTree = sensor.nodeType === "tree";
              const isOffline = sensor.communicationStatus === "offline";
              const sensorOpacity = getLayerOpacity("sensor");
              const codeTagWidth =
                sensor.sensorCode.length * CODE_TAG_CHAR_WIDTH +
                CODE_TAG_HORIZONTAL_PADDING;

              return (
                <g
                  key={sensor.id}
                  className={`${styles.sensorMarkerGroup} ${isSelected ? styles.selectedMarker : ""} ${isOffline ? styles.offlineMarker : ""}`.trim()}
                  opacity={sensorOpacity}
                  onClick={() => onSelectSensor(sensor)}
                  onMouseEnter={() => {
                    setHoveredSensor(sensor);
                    setHoverPosition(position);
                  }}
                  onMouseLeave={() => setHoveredSensor(null)}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${position.x}, ${position.y})`}
                >
                  {/*
                    【重要】ホバーのバグ防止（無限ループ・位置ズレ防止）:
                    ヒット判定円（hitArea）は固定サイズで絶対に動かさず、
                    装飾要素すべてに pointer-events: none を適用してマウス奪い合いを防ぎます。
                  */}
                  <circle
                    className={styles.hitArea}
                    r={SENSOR_HIT_AREA_RADIUS}
                  />

                  {/* 測量標ピンの本体円 */}
                  <circle
                    className={`${styles.markerPin} ${isTree ? styles.treePin : styles.slopePin} ${styles[sensor.observationSeverity]}`}
                    r={SENSOR_MARKER_PIN_RADIUS}
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

                  {/* 通信断（offline）インジケーターバッジ */}
                  {isOffline && (
                    <g
                      transform={`translate(${OFFLINE_BADGE_OFFSET}, -${OFFLINE_BADGE_OFFSET})`}
                    >
                      <circle
                        className={styles.offlineBadgeBg}
                        r={OFFLINE_BADGE_RADIUS}
                      />
                      <text
                        className={styles.offlineBadgeText}
                        dominantBaseline="central"
                        textAnchor="middle"
                        y="0.5"
                      >
                        !
                      </text>
                    </g>
                  )}

                  {/* センサーコード銘板（名札） */}
                  <rect
                    className={styles.codeTagRect}
                    height={CODE_TAG_HEIGHT}
                    rx={CODE_TAG_BORDER_RADIUS}
                    width={codeTagWidth}
                    x={-codeTagWidth / 2}
                    y={CODE_TAG_OFFSET_Y}
                  />
                  <text
                    className={styles.codeTagText}
                    dominantBaseline="central"
                    textAnchor="middle"
                    y={CODE_TAG_TEXT_OFFSET_Y}
                  >
                    {sensor.sensorCode}
                  </text>

                  {/* 異常値の直接可視化（ホバー不要で危険値を直視） */}
                  {(isDanger || isCaution) && (
                    <g
                      className={styles.alertFlagGroup}
                      transform={`translate(0, ${ALERT_PILL_OFFSET_Y})`}
                    >
                      <rect
                        className={
                          isDanger
                            ? styles.dangerAlertPill
                            : styles.cautionAlertPill
                        }
                        height={ALERT_PILL_HEIGHT}
                        rx={ALERT_PILL_BORDER_RADIUS}
                        width={ALERT_PILL_WIDTH}
                        x={-ALERT_PILL_WIDTH / 2}
                        y={-ALERT_PILL_HEIGHT / 2}
                      />
                      <text
                        className={styles.alertFlagText}
                        dominantBaseline="central"
                        textAnchor="middle"
                        y="0"
                      >
                        {isDanger ? "⚠️ " : "注意: "}
                        {sensor.tiltValue !== null &&
                        (sensor.tiltValue >= DANGER_TILT_DISPLAY_THRESHOLD ||
                          sensor.soilMoistureValue === null)
                          ? `+${sensor.tiltValue.toFixed(1)}°`
                          : sensor.soilMoistureValue !== null
                            ? `${(sensor.soilMoistureValue * PERCENTAGE_MULTIPLIER).toFixed(0)}%`
                            : `${(sensor.tiltValue ?? 0).toFixed(1)}°`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
        </svg>

        {/* マーカーホバー時の情報ポップアップ */}
        {hoveredSensor && hoverPosition && (
          <aside
            aria-label="センサー簡易情報"
            className={styles.hoverTooltip}
            style={{
              left: `calc(${50 + ((hoverPosition.x - SVG_WIDTH / 2) / SVG_WIDTH) * 100 * zoomLevel}% + ${panOffset.x}px)`,
              top: `calc(${50 + ((hoverPosition.y - SVG_HEIGHT / 2) / SVG_HEIGHT) * 100 * zoomLevel}% + ${panOffset.y}px)`,
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
                    ? `${(hoveredSensor.soilMoistureValue * PERCENTAGE_MULTIPLIER).toFixed(1)}%`
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
                {hoveredSensor.elevationMeters ?? DEFAULT_ELEVATION_METERS}m）
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

      {/* 地図ピンとの重なりやズーム時の巨大化を防ぐため、凡例をSVG外の下部バーとして常設表示する */}
      <footer
        aria-label="森林基本図の凡例"
        className={styles.externalLegendBar}
      >
        <div className={styles.legendItemsGroup}>
          <span className={styles.legendBarItem}>
            <span className={styles.legendSwatchIndexContour} />
            計曲線 (50m)
          </span>
          <span className={styles.legendBarItem}>
            <span className={styles.legendSwatchIntermediateContour} />
            主曲線 (10m)
          </span>
          <span className={styles.legendBarItem}>
            <span className={styles.legendSwatchStream} />
            沢・水系
          </span>
          <span className={styles.legendBarItem}>
            <span className={styles.legendSwatchRoad} />
            林道・作業道
          </span>
          <span className={styles.legendBarItem}>🌲 樹木 / ⛰️ 斜面</span>
        </div>
        <span className={styles.gestureGuideText}>
          拡大・縮小ボタン / マウスドラッグで地図を自由に移動できます
        </span>
      </footer>
    </div>
  );
}
