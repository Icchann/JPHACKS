import { connection } from "next/server";

import { DashboardHome } from "@/features/dashboard/components/dashboard-home";
import { TestDashboardHome } from "@/features/dashboard/components/test-dashboard-home";

// 起動時に指定した環境だけで実機CSV表示へ切り替え、デモ表示との混在を防ぎます。
export default async function DashboardPage() {
  await connection();

  if (process.env.SANMOU_APP_ENV === "test") {
    return <TestDashboardHome />;
  }

  return <DashboardHome />;
}
