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
    tab?: string;
    nfc?: string;
  }>;
};

export default async function MobilePage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const defaultMode = process.env.SANMOU_APP_ENV === "test" ? "test" : "demo";
  const initialMode = resolvedParams?.mode
    ? resolvedParams.mode === "test"
      ? "test"
      : "demo"
    : defaultMode;
  const initialNode = resolvedParams?.node ?? "T1";
  const isNfcLaunch =
    resolvedParams?.nfc === "1" || Boolean(resolvedParams?.node);
  const initialTab =
    resolvedParams?.tab === "register" || resolvedParams?.nfc === "1"
      ? "register"
      : "monitor";

  return (
    <MobileHome
      dataMode={initialMode}
      initialNodeId={initialNode}
      initialTab={initialTab}
      isNfcLaunch={isNfcLaunch}
    />
  );
}
