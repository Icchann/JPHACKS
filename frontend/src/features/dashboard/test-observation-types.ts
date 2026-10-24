export type TestObservation = {
  received_at: string;
  node_id: string;
  seq: number;
  hop: number;
  sample_ms: number;
  ax_mg: number;
  ay_mg: number;
  az_mg: number;
  soil_raw: number | null;
  battery_mv: number | null;
};

export type TestObservationResponse = {
  items: TestObservation[];
  file_exists: boolean;
  invalid_row_count: number;
  source: "device_test";
  refreshed_at: string;
};
