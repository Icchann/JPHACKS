"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { OBSERVATION_LABELS } from "../monitoring-utils";
import { loadGoogleMaps } from "../google-maps-loader";
import type { DemoSensor, ObservationSeverity } from "../types";
import { Icon } from "./icon";
import styles from "./monitoring-home.module.css";

const MARKER_COLORS: Record<ObservationSeverity, string> = {
  normal: "#2e8b57",
  caution: "#e6a61b",
  danger: "#d94b42",
};

type SatelliteMapProps = {
  sensors: DemoSensor[];
  visibleSensorIds: Set<string>;
  focusRequest: MapFocusRequest | null;
  resetViewRequest: number;
  selectedSensorId: string | null;
  onOpenDetails: (sensor: DemoSensor) => void;
  onSelectSensor: (sensorId: string) => void;
};

export type MapFocusRequest = {
  sensorId: string;
  requestId: number;
};

function createMarkerIcon(
  mapsApi: typeof google,
  severity: ObservationSeverity,
): google.maps.Symbol {
  return {
    path: mapsApi.maps.SymbolPath.CIRCLE,
    fillColor: MARKER_COLORS[severity],
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 3,
    scale: 11,
  };
}

function createSelectionRing(mapsApi: typeof google): google.maps.Symbol {
  return {
    path: mapsApi.maps.SymbolPath.CIRCLE,
    fillOpacity: 0,
    strokeColor: "#123e2d",
    strokeOpacity: 1,
    strokeWeight: 3,
    scale: 16,
  };
}

function fitSensors(
  map: google.maps.Map,
  mapsApi: typeof google,
  sensors: DemoSensor[],
) {
  const bounds = new mapsApi.maps.LatLngBounds();
  sensors.forEach((sensor) => {
    bounds.extend({ lat: sensor.latitude, lng: sensor.longitude });
  });
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, 72);
  }
}

function appendLine(container: HTMLElement, label: string, value: string) {
  const line = document.createElement("p");
  const labelElement = document.createElement("span");
  labelElement.textContent = `${label} `;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  line.append(labelElement, valueElement);
  container.append(line);
}

function createInfoContent(sensor: DemoSensor): HTMLElement {
  const container = document.createElement("div");
  container.className = styles.mapInfoWindow;
  const title = document.createElement("strong");
  title.textContent = `${sensor.sensorCode} · ${sensor.name}`;
  container.append(title);
  appendLine(
    container,
    "土壌水分",
    sensor.soilMoistureValue?.toString() ?? "欠測",
  );
  appendLine(container, "傾斜", sensor.tiltValue?.toString() ?? "欠測");
  appendLine(
    container,
    "重要度",
    OBSERVATION_LABELS[sensor.observationSeverity],
  );
  appendLine(
    container,
    "通信",
    sensor.communicationStatus === "online" ? "オンライン" : "通信断",
  );
  return container;
}

export function SatelliteMap({
  sensors,
  visibleSensorIds,
  focusRequest,
  resetViewRequest,
  selectedSensorId,
  onOpenDetails,
  onSelectSensor,
}: SatelliteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsApiRef = useRef<typeof google | null>(null);
  const markersRef = useRef(new Map<string, google.maps.Marker>());
  const selectionRingsRef = useRef(new Map<string, google.maps.Marker>());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const sensorByIdRef = useRef(new Map<string, DemoSensor>());
  const onOpenDetailsRef = useRef(onOpenDetails);
  const onSelectSensorRef = useRef(onSelectSensor);
  const hasInitialFitRef = useRef(false);
  const handledResetViewRequestRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const visibleSensors = useMemo(
    () => sensors.filter((sensor) => visibleSensorIds.has(sensor.id)),
    [sensors, visibleSensorIds],
  );

  useEffect(() => {
    sensorByIdRef.current = new Map(
      sensors.map((sensor) => [sensor.id, sensor]),
    );
  }, [sensors]);

  useEffect(() => {
    onOpenDetailsRef.current = onOpenDetails;
    onSelectSensorRef.current = onSelectSensor;
  }, [onOpenDetails, onSelectSensor]);

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) {
      return;
    }

    let cancelled = false;
    const markers = markersRef.current;
    const selectionRings = selectionRingsRef.current;
    setIsReady(false);
    setLoadError(null);

    void loadGoogleMaps(apiKey)
      .then((mapsApi) => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        const map = new mapsApi.maps.Map(mapContainerRef.current, {
          center: { lat: 35, lng: 137.004 },
          zoom: 15,
          mapTypeId: mapsApi.maps.MapTypeId.SATELLITE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const infoWindow = new mapsApi.maps.InfoWindow();

        mapRef.current = map;
        mapsApiRef.current = mapsApi;
        infoWindowRef.current = infoWindow;
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "衛星地図を読み込めませんでした",
          );
        }
      });

    return () => {
      cancelled = true;
      markers.forEach((marker) => {
        mapsApiRef.current?.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      });
      selectionRings.forEach((marker) => marker.setMap(null));
      markers.clear();
      selectionRings.clear();
      infoWindowRef.current?.close();
      mapRef.current = null;
      mapsApiRef.current = null;
      hasInitialFitRef.current = false;
      handledResetViewRequestRef.current = 0;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    const infoWindow = infoWindowRef.current;
    if (!isReady || !map || !mapsApi || !infoWindow) {
      return;
    }

    const sensorIds = new Set(sensors.map((sensor) => sensor.id));
    markersRef.current.forEach((marker, sensorId) => {
      if (!sensorIds.has(sensorId)) {
        mapsApi.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
        markersRef.current.delete(sensorId);
        selectionRingsRef.current.get(sensorId)?.setMap(null);
        selectionRingsRef.current.delete(sensorId);
      }
    });

    sensors.forEach((sensor) => {
      const position = { lat: sensor.latitude, lng: sensor.longitude };
      let marker = markersRef.current.get(sensor.id);
      let selectionRing = selectionRingsRef.current.get(sensor.id);

      if (!marker || !selectionRing) {
        selectionRing = new mapsApi.maps.Marker({
          clickable: false,
          icon: createSelectionRing(mapsApi),
          map,
          position,
          visible: false,
          zIndex: 1,
        });
        marker = new mapsApi.maps.Marker({
          icon: createMarkerIcon(mapsApi, sensor.observationSeverity),
          map,
          position,
          title: `${sensor.sensorCode} ${sensor.name} ${OBSERVATION_LABELS[sensor.observationSeverity]}`,
          zIndex: 2,
        });

        const sensorId = sensor.id;
        marker.addListener("mouseover", () => {
          const currentSensor = sensorByIdRef.current.get(sensorId);
          if (!currentSensor || !mapRef.current) {
            return;
          }
          infoWindow.setContent(createInfoContent(currentSensor));
          infoWindow.open({ anchor: marker, map: mapRef.current });
        });
        marker.addListener("mouseout", () => infoWindow.close());
        marker.addListener("click", () => {
          const currentSensor = sensorByIdRef.current.get(sensorId);
          if (!currentSensor) {
            return;
          }
          onSelectSensorRef.current(sensorId);
          onOpenDetailsRef.current(currentSensor);
        });
        markersRef.current.set(sensor.id, marker);
        selectionRingsRef.current.set(sensor.id, selectionRing);
      } else {
        marker.setPosition(position);
        marker.setTitle(
          `${sensor.sensorCode} ${sensor.name} ${OBSERVATION_LABELS[sensor.observationSeverity]}`,
        );
        marker.setIcon(createMarkerIcon(mapsApi, sensor.observationSeverity));
        selectionRing.setPosition(position);
      }
    });

    if (!hasInitialFitRef.current && sensors.length > 0) {
      fitSensors(map, mapsApi, sensors);
      hasInitialFitRef.current = true;
    }
  }, [isReady, sensors]);

  useEffect(() => {
    markersRef.current.forEach((marker, sensorId) => {
      marker.setVisible(visibleSensorIds.has(sensorId));
    });
    selectionRingsRef.current.forEach((marker, sensorId) => {
      marker.setVisible(
        visibleSensorIds.has(sensorId) && sensorId === selectedSensorId,
      );
    });
  }, [isReady, selectedSensorId, visibleSensorIds]);

  useEffect(() => {
    if (!focusRequest || !isReady || !mapRef.current) {
      return;
    }
    const sensor = sensorByIdRef.current.get(focusRequest.sensorId);
    if (!sensor) {
      return;
    }
    mapRef.current.panTo({ lat: sensor.latitude, lng: sensor.longitude });
    mapRef.current.setZoom(17);
  }, [focusRequest, isReady]);

  useEffect(() => {
    if (
      resetViewRequest === 0 ||
      resetViewRequest === handledResetViewRequestRef.current ||
      !isReady ||
      !mapRef.current ||
      !mapsApiRef.current
    ) {
      return;
    }
    handledResetViewRequestRef.current = resetViewRequest;
    fitSensors(mapRef.current, mapsApiRef.current, visibleSensors);
  }, [isReady, resetViewRequest, visibleSensors]);

  if (!apiKey || loadError) {
    return (
      <section
        className={styles.mapFallback}
        aria-label="衛星地図フォールバック"
      >
        <div className={styles.fallbackMessage}>
          <span className={styles.fallbackIcon}>
            <Icon name="map" />
          </span>
          <div>
            <strong>衛星地図を表示できません</strong>
            <p>{loadError ?? "Google Maps APIキーが未設定です"}</p>
          </div>
        </div>
        <div className={styles.fallbackSensorList}>
          {visibleSensors.length > 0 ? (
            visibleSensors.map((sensor) => (
              <button
                data-sanmou-button="row"
                aria-pressed={selectedSensorId === sensor.id}
                data-selected={selectedSensorId === sensor.id}
                key={sensor.id}
                type="button"
                onClick={() => {
                  onSelectSensor(sensor.id);
                  onOpenDetails(sensor);
                }}
              >
                <span
                  className={styles.sensorDot}
                  data-severity={sensor.observationSeverity}
                  aria-hidden="true"
                />
                <span>
                  <strong>{sensor.sensorCode}</strong>
                  <small>{sensor.name}</small>
                </span>
                <span>{OBSERVATION_LABELS[sensor.observationSeverity]}</span>
              </button>
            ))
          ) : (
            <p className={styles.emptyState}>該当するセンサーはありません</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <div
        ref={mapContainerRef}
        className={styles.mapCanvas}
        aria-label="衛星地図"
      />
      {isReady ? (
        <div className={styles.mapModeBadge}>
          <Icon name="map" width={15} height={15} />
          衛星写真
        </div>
      ) : (
        <div className={styles.mapStatus} role="status">
          <span aria-hidden="true" />
          衛星地図を読み込み中
        </div>
      )}
      {isReady && visibleSensors.length === 0 ? (
        <div className={styles.mapStatus}>該当するセンサーはありません</div>
      ) : null}
    </>
  );
}
