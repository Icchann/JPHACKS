import { MonitoringHome } from "@/features/monitoring/components/monitoring-home";

export default function MapPage() {
  const dataMode = process.env.SANMOU_APP_ENV === "test" ? "test" : "demo";
  return <MonitoringHome dataMode={dataMode} />;
}
