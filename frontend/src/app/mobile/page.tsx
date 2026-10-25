import type { Metadata } from "next";

import { MobileHome } from "../../features/mobile/components/mobile-home";

export const metadata: Metadata = {
  title: "山網 | 現場モバイルモニター",
  description: "作業員・現場実演向け大画面アラート＆GPS設置登録システム",
};

type PageProps = {
  searchParams?: Promise<{
    mode?: string;
    node?: string;
  }>;
};

export default async function MobilePage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialMode = resolvedParams?.mode === "test" ? "test" : "demo";
  const initialNode = resolvedParams?.node ?? "T1";

  return <MobileHome dataMode={initialMode} initialNodeId={initialNode} />;
}
