import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.jphacks.sanmou",
  appName: "山網",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "山林観測機体をスキャン中...",
        cancel: "キャンセル",
        availableDevices: "利用可能な機体",
        noDeviceFound: "機体が見つかりません",
      },
    },
  },
};

export default config;
