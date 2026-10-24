export type TestSensor = {
  id: string;
  sensor_code: string;
  name: string;
  latitude: number;
  longitude: number;
  observation_severity: "normal" | "caution" | "danger" | "unknown";
  communication_status: "online" | "offline" | "unknown";
  device_fault_status: "ok" | "fault" | "unknown";
  low_battery: boolean | null;
  last_received_at: string | null;
  source: "device_test";
};

export type TestSensorListResponse = {
  items: TestSensor[];
  next_cursor: string | null;
};
