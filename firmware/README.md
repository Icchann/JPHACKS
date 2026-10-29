# firmware — 山網 観測機体 (ESP32C3) ファームウェア

> 文書版: 1.0 / 2026-10-29  
> 対象ハードウェア: Seeed Studio XIAO ESP32C3, Analog Devices ADXL367 (I2C/SPI), Ebyte E220-900T22S (UART)  
> 準拠: Issue #54, #55, #56, CONTRACTS.md, DEC-23

---

## 1. 構成概要

本ファームウェアは、山林に設置される観測機体の制御ロジックを提供します。

- **静止基準姿勢サンプリング状態機械 (`baseline_capture_fsm`)**:
  - スマホからの設置命令受領後、揺れ待ち (`WAIT_STILL`) → 静止サンプリング (`SAMPLING` 20サンプル/2秒) → NVS原子的保存 (`COMMITTED`) を実行。
  - 全軸ゼロ、センサー通信断、重力範囲外 (750〜1250mg 外)、過大分散を異常として排除。
- **設置用 BLE GATT サービス (`ble_installation_service`)**:
  - 電源投入後 300秒間（5分間）BLE アドバタイズ待受を実施。
  - NFC タグに記載された `node_id` との照合、認証トークン検証、および基準結果の Read/Notify を提供。
- **LoRa 新形式パケット生成 (`lora_packet_formatter`)**:
  - `S1` 形式パケット（13項目）により、物理設置ID (`installation_id`)、起動ID (`boot_id`)、観測連番 (`sample_seq`) を付与して送信。

---

## 2. ハードウェア結線 (XIAO ESP32C3)

| モジュール | ピン名 | XIAO ESP32C3 ピン | 説明 |
|---|---|---|---|
| ADXL367 | VCC | 3V3 | 電源 (3.3V) |
| ADXL367 | GND | GND | グランド |
| ADXL367 | SCL | D5 (GPIO7) | I2C クロック |
| ADXL367 | SDA | D4 (GPIO6) | I2C データ |
| E220 LoRa | RXD | D7 (GPIO21 / TX) | LoRa 送信データ |
| E220 LoRa | TXD | D6 (GPIO20 / RX) | LoRa 受信データ |
| E220 LoRa | AUX | D3 (GPIO5) | ビジー状態検出 |
| E220 LoRa | M0/M1 | GND | 通常送受信モード (Mode 0) |

---

## 3. ビルドと実機書き込み

PlatformIO または ESP-IDF (v5.x) を使用してビルドします。

```bash
# PlatformIOの場合
pio run -e xiao_esp32c3
pio run -e xiao_esp32c3 -t upload
```
