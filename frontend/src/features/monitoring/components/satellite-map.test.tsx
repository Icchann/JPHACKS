import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadGoogleMaps } from "../google-maps-loader";
import { DEMO_SENSORS } from "../demo-data";
import { SatelliteMap } from "./satellite-map";

vi.mock("../google-maps-loader", () => ({
  loadGoogleMaps: vi.fn(),
}));

type MarkerOptions = {
  clickable?: boolean;
  icon?: { fillColor?: string };
  map?: unknown;
  position?: { lat: number; lng: number };
  title?: string;
  visible?: boolean;
};

class FakeMap {
  fitBounds = vi.fn();
  panTo = vi.fn();
  setZoom = vi.fn();
}

class FakeMarker {
  listeners = new Map<string, () => void>();
  setIcon = vi.fn();
  setMap = vi.fn();
  setPosition = vi.fn();
  setTitle = vi.fn();
  setVisible = vi.fn();

  constructor(public options: MarkerOptions) {}

  addListener(eventName: string, listener: () => void) {
    this.listeners.set(eventName, listener);
    return { remove: vi.fn() };
  }
}

class FakeBounds {
  points: Array<{ lat: number; lng: number }> = [];

  extend(point: { lat: number; lng: number }) {
    this.points.push(point);
  }

  isEmpty() {
    return this.points.length === 0;
  }
}

class FakeInfoWindow {
  close = vi.fn();
  open = vi.fn();
  setContent = vi.fn();
}

const mapInstances: FakeMap[] = [];
const markerInstances: FakeMarker[] = [];

function createGoogleMapsMock(): typeof google {
  return {
    maps: {
      Map: class extends FakeMap {
        constructor() {
          super();
          mapInstances.push(this);
        }
      },
      Marker: class extends FakeMarker {
        constructor(options: MarkerOptions) {
          super(options);
          markerInstances.push(this);
        }
      },
      InfoWindow: FakeInfoWindow,
      LatLngBounds: FakeBounds,
      MapTypeId: { SATELLITE: "satellite" },
      SymbolPath: { CIRCLE: 0 },
      event: { clearInstanceListeners: vi.fn() },
    },
  } as unknown as typeof google;
}

describe("SatelliteMap", () => {
  beforeEach(() => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "demo-key");
    vi.mocked(loadGoogleMaps).mockResolvedValue(createGoogleMapsMock());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("データ更新時に地図を再生成せず視点を維持する", async () => {
    const sensors = DEMO_SENSORS.slice(0, 2);
    const props = {
      focusRequest: null,
      onOpenDetails: vi.fn(),
      onSelectSensor: vi.fn(),
      resetViewRequest: 0,
      selectedSensorId: null,
      sensors,
      visibleSensorIds: new Set(sensors.map((sensor) => sensor.id)),
    };
    const { rerender } = render(<SatelliteMap {...props} />);

    await waitFor(() => expect(mapInstances).toHaveLength(1));
    await waitFor(() =>
      expect(mapInstances[0].fitBounds).toHaveBeenCalledOnce(),
    );

    const refreshedSensors = sensors.map((sensor) => ({ ...sensor }));
    rerender(
      <SatelliteMap
        {...props}
        sensors={refreshedSensors}
        visibleSensorIds={new Set(refreshedSensors.map((sensor) => sensor.id))}
      />,
    );

    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0].fitBounds).toHaveBeenCalledOnce();
  });

  it("マーカー選択を通知し、重要度色を変えずに詳細を開く", async () => {
    const sensor = DEMO_SENSORS[0];
    const onOpenDetails = vi.fn();
    const onSelectSensor = vi.fn();
    const view = render(
      <SatelliteMap
        focusRequest={null}
        resetViewRequest={0}
        selectedSensorId={null}
        sensors={[sensor]}
        visibleSensorIds={new Set([sensor.id])}
        onOpenDetails={onOpenDetails}
        onSelectSensor={onSelectSensor}
      />,
    );

    await waitFor(() =>
      expect(
        markerInstances.find((marker) => marker.options.title),
      ).toBeDefined(),
    );
    const sensorMarker = markerInstances.find((marker) => marker.options.title);

    act(() => sensorMarker?.listeners.get("click")?.());

    expect(onSelectSensor).toHaveBeenCalledWith(sensor.id);
    expect(onOpenDetails).toHaveBeenCalledWith(sensor);
    expect(sensorMarker?.options.icon?.fillColor).toBe("#d94b42");

    view.rerender(
      <SatelliteMap
        focusRequest={null}
        resetViewRequest={0}
        selectedSensorId={sensor.id}
        sensors={[sensor]}
        visibleSensorIds={new Set([sensor.id])}
        onOpenDetails={onOpenDetails}
        onSelectSensor={onSelectSensor}
      />,
    );
    const selectionRing = markerInstances.find(
      (marker) => marker.options.clickable === false,
    );
    expect(selectionRing?.setVisible).toHaveBeenLastCalledWith(true);
  });
});
