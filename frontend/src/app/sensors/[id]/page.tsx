import { notFound } from "next/navigation";

import { SensorDetail } from "../../../features/sensor-detail/components/sensor-detail";
import { DEMO_SENSORS } from "../../../features/monitoring/demo-data";

export default async function SensorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const sensor = DEMO_SENSORS.find((item) => item.id === id);

  if (!sensor) {
    notFound();
  }

  // 不正な戻り先を受け入れず、アプリ内の既知の画面だけを遷移先にします。
  const returnPath = from === "sensors" ? "/sensors" : "/map";

  return <SensorDetail returnPath={returnPath} sensor={sensor} />;
}
