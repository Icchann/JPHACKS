import os from "node:os";
import { NextResponse } from "next/server";

export function GET() {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  const preferredIp =
    addresses.find(
      (ip) =>
        ip.startsWith("192.168.") ||
        ip.startsWith("172.") ||
        ip.startsWith("10."),
    ) ??
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
