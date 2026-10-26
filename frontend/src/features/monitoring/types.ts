export type ObservationSeverity = "normal" | "caution" | "danger" | "unknown";

export type CommunicationStatus = "online" | "offline" | "unknown";

export type DeviceFaultStatus = "ok" | "fault" | "unknown";

export type ForestNodeType = "tree" | "slope";

export type DemoSensor = {
  id: string;
  sensorCode: string;
  name: string;
  latitude: number;
  longitude: number;
  observationSeverity: ObservationSeverity;
  communicationStatus: CommunicationStatus;
  deviceFaultStatus: DeviceFaultStatus;
  lowBattery: boolean;
  soilMoistureValue: number | null;
  tiltValue: number | null;
  batteryPercent: number | null;
  lastReceivedAt: string | null;
  source: "demo" | "device_test";
  // 林業現場でのリスク種別（倒木 vs 斜面崩壊）と設置位置の特定用メタデータ
  nodeType?: ForestNodeType;
  elevationMeters?: number;
  locationNote?: string;
  mountainId?: string;
};

export type AlertSeverity = "caution" | "danger" | "status";

export type AlertCategory = "moisture" | "tilt" | "battery";

export type DemoAlert = {
  id: string;
  sensorId: string;
  sensorCode: string;
  sensorName: string;
  category: AlertCategory;
  severity: AlertSeverity;
  startedAt: string;
  measuredValue: number | null;
  unit: string | null;
  source: "demo" | "device_test";
};

export type MonitoringSnapshot = {
  sensors: DemoSensor[];
  alerts: DemoAlert[];
  refreshedAt: string;
  source: "demo";
};

export type DemoObservation = {
  sensorId: string;
  measuredAt: string;
  soilMoistureValue: number | null;
  tiltValue: number | null;
  source: "demo" | "device_test";
};

// 複数山林・工区の階層管理用モデル（GIS Ground Overlay対応）
export type MountainArea = {
  id: string;
  name: string;
  areaName: string;
  description?: string | null;
  minLatitude?: number;
  maxLatitude?: number;
  minLongitude?: number;
  maxLongitude?: number;
  mapImageUrl?: string | null;
  centerLatitude?: number;
  centerLongitude?: number;
};

// 表示レイヤーの識別子
export type MapLayerId =
  | "sensor"
  | "boundary"
  | "rest_point"
  | "route_track"
  | "wildlife_hazard"
  | "geology_risk";

// レイヤーの3段階表示制御（100%表示 / 30%薄く透過 / 非表示）
export type LayerVisibility = "visible" | "faded" | "hidden";

// 現場利用シーンに応じた一括プリセット
export type MapPresetMode = "disaster" | "planning" | "safety" | "all";

// 現場オーバーレイ（点情報: 休憩所、危険生物）
export type OverlayPoint = {
  id: string;
  name: string;
  layerId: "rest_point" | "wildlife_hazard";
  subType: "hut" | "water" | "hornet" | "viper" | "bear";
  latitude: number;
  longitude: number;
  description: string;
};

// 現場オーバーレイ（線情報: 私有地境界、作業道、獣道、地質破砕帯）
export type OverlayPath = {
  id: string;
  name: string;
  layerId: "boundary" | "route_track" | "geology_risk";
  subType: "private_border" | "work_road" | "animal_trail" | "fault_line";
  coordinates: Array<{ latitude: number; longitude: number }>;
  color?: string;
};

// 汎用パンくずリスト要素
export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};
