import os from "node:os";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 仮想NIC・トンネル系インターフェースはLAN接続先候補から除外する
const VIRTUAL_IFACE_PATTERN =
  /^(docker|veth|br-|utun|awdl|llw|vboxnet|vmnet|lo|tun|tap)/i;

export function GET() {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    if (VIRTUAL_IFACE_PATTERN.test(name)) {
      continue;
    }
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  // 一般的な家庭・会場Wi-Fi (192.168.) -> iPhoneテザリング等 (172.) -> 10. の優先順で選択
  const preferredIp =
    addresses.find((ip) => ip.startsWith("192.168.")) ??
    addresses.find((ip) => ip.startsWith("172.")) ??
    addresses.find((ip) => ip.startsWith("10.")) ??
    addresses[0] ??
    "127.0.0.1";
  const rawHost = os.hostname();
  const bonjourHost = rawHost.endsWith(".local") ? rawHost : `${rawHost}.local`;

  return NextResponse.json({
    ip: preferredIp,
    hostname: bonjourHost,
    addresses,
  });
}
