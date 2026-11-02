import { Capacitor } from "@capacitor/core";
import { describe, expect, it, vi } from "vitest";

import {
  CapacitorBluetoothAdapter,
  getRecommendedBleAdapter,
  MockBluetoothAdapter,
  WebBluetoothAdapter,
} from "./ble-device-adapter";

describe("getRecommendedBleAdapter", () => {
  it("dataMode === 'demo' の場合は MockBluetoothAdapter を返却すること", () => {
    const adapter = getRecommendedBleAdapter("demo");
    expect(adapter).toBeInstanceOf(MockBluetoothAdapter);
    expect(adapter.isSupported()).toBe(true);
  });

  it("Capacitor ネイティブ環境の場合は CapacitorBluetoothAdapter を返却すること", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const adapter = getRecommendedBleAdapter("test");
    expect(adapter).toBeInstanceOf(CapacitorBluetoothAdapter);
    expect(adapter.isSupported()).toBe(true);
    vi.restoreAllMocks();
  });

  it("通常のブラウザ環境の場合は WebBluetoothAdapter を返却すること", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    const adapter = getRecommendedBleAdapter("test");
    expect(adapter).toBeInstanceOf(WebBluetoothAdapter);
    vi.restoreAllMocks();
  });
});
