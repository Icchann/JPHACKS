import { SensorManagement } from "@/features/sensor-management/components/sensor-management";

// test一括起動時だけ検証DBへ接続し、通常devでは従来のデモを表示します。
export default function SensorsPage() {
  const dataMode = process.env.SANMOU_APP_ENV === "test" ? "test" : "demo";
  return <SensorManagement dataMode={dataMode} />;
}
